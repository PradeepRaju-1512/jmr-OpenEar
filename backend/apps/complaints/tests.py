"""
Run with:  DEBUG=True python manage.py test
Covers: Google token verification, registry sync, visibility/confidentiality, workflow rules,
penalties, escalation, and evidence sanitisation.
"""

import io
import tempfile
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.authentication.models import OfficialAssignment, User
from apps.authentication.registry import DEFAULT_OFFICIALS
from apps.complaints import services
from apps.complaints.categories_data import CATEGORIES
from apps.complaints.models import Complaint, ComplaintCategory


def make_user(email, role="STUDENT", gender="M", **kw):
    u = User.objects.create_user(email=email, first_name=email.split("@")[0], gender=gender, **kw)
    return u


def bearer(user):
    from rest_framework.authtoken.models import Token

    token, _ = Token.objects.get_or_create(user=user)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token.key}")
    return c


@override_settings(GOOGLE_OAUTH_CLIENT_ID="test-client", OPENEAR_ADMIN_EMAILS=["boss@iiitt.ac.in"])
class BaseCase(TestCase):
    def setUp(self):
        for row in CATEGORIES:
            ComplaintCategory.objects.create(**row)
        for row in DEFAULT_OFFICIALS:
            OfficialAssignment.objects.create(**row)
        self.student = make_user("241001@iiitt.ac.in", gender="M")
        self.girl = make_user("241002@iiitt.ac.in", gender="F")
        # Officials log in via registry sync
        self.mess_sec = make_user("231129@iiitt.ac.in")
        self.girls_sec = make_user("251256@iiitt.ac.in", gender="F")
        self.sports_sec = make_user("231119@iiitt.ac.in")
        self.warden = make_user("messwarden@iiitt.ac.in")
        self.admin = make_user("boss@iiitt.ac.in")
        for u in (self.mess_sec, self.girls_sec, self.sports_sec, self.warden, self.admin):
            bearer(u).get("/api/v1/auth/me/")  # triggers sync

    def file(self, user, codes, **extra):
        return services.create_complaints(
            user, category_codes=codes, title="Broken tap", description="The tap in the mess is broken",
            location_code=None, is_confidential=extra.get("conf", False), request_id=extra.get("rid"),
        )[0]


class AuthTests(BaseCase):
    def post(self, payload):
        return APIClient().post("/api/v1/auth/google-verify/", payload, format="json")

    def test_email_only_login_is_rejected(self):
        self.assertEqual(self.post({"email": "boss@iiitt.ac.in"}).status_code, 400)

    @mock.patch("apps.authentication.views.id_token.verify_oauth2_token", side_effect=ValueError("bad"))
    def test_invalid_token(self, _):
        self.assertEqual(self.post({"credential": "x"}).status_code, 401)

    @mock.patch("apps.authentication.views.id_token.verify_oauth2_token")
    def test_wrong_domain_rejected(self, m):
        m.return_value = {"email": "a@gmail.com", "email_verified": True, "sub": "1", "hd": "gmail.com"}
        self.assertEqual(self.post({"credential": "x"}).status_code, 403)

    @mock.patch("apps.authentication.views.id_token.verify_oauth2_token")
    def test_unverified_email_and_missing_hd_rejected(self, m):
        m.return_value = {"email": "a@iiitt.ac.in", "email_verified": False, "sub": "1", "hd": "iiitt.ac.in"}
        self.assertEqual(self.post({"credential": "x"}).status_code, 403)
        m.return_value = {"email": "a@iiitt.ac.in", "email_verified": True, "sub": "1"}
        self.assertEqual(self.post({"credential": "x"}).status_code, 403)

    @mock.patch("apps.authentication.views.id_token.verify_oauth2_token")
    def test_valid_login_assigns_role_from_registry(self, m):
        m.return_value = {"email": "messwarden@iiitt.ac.in", "email_verified": True, "sub": "w1", "hd": "iiitt.ac.in"}
        res = self.post({"credential": "x"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["user"]["role"], "WARDEN_MESS")

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="")
    def test_unconfigured_server_refuses(self):
        self.assertEqual(self.post({"credential": "x"}).status_code, 503)

    def test_bearer_required_and_old_official_loses_privileges(self):
        self.assertEqual(APIClient().get("/api/v1/auth/me/").status_code, 401)
        OfficialAssignment.objects.filter(email="231119@iiitt.ac.in").update(is_active=False)
        res = bearer(self.sports_sec).get("/api/v1/auth/me/")
        self.assertEqual(res.json()["role"], "STUDENT")


class FilingRulesTests(BaseCase):
    def test_gender_rules(self):
        with self.assertRaises(Exception):
            self.file(self.girl, ["hostel-boys-wifi"])
        with self.assertRaises(Exception):
            self.file(self.student, ["hostel-girls-wifi"])
        with self.assertRaises(Exception):
            self.file(self.girl, ["others-general"])  # boys-only by default
        self.assertEqual(len(self.file(self.student, ["others-general"])), 1)

    def test_multiple_secretaries_and_idempotency(self):
        rid = "6f1c1b1e-8a4e-4a52-9a52-0d4d6f0f5c11"
        first = self.file(self.student, ["mess-hygiene", "hostel-boys-wifi"], rid=rid)
        self.assertEqual(len(first), 2)
        again = self.file(self.student, ["mess-hygiene", "hostel-boys-wifi"], rid=rid)
        self.assertEqual(sorted(c.pk for c in first), sorted(c.pk for c in again))
        self.assertEqual(Complaint.objects.count(), 2)

    def test_girls_mess_goes_to_girls_secretary(self):
        c = self.file(self.girl, ["mess-hygiene"])[0]
        self.assertEqual(c.assigned_secretary_id, self.girls_sec.id)

    def test_sla_matches_spec(self):
        slas = {c["code"]: c["sla_days"] for c in CATEGORIES}
        self.assertEqual(slas["mess-hygiene"], 3)
        self.assertEqual(slas["mess-food-quality"], 3)
        self.assertEqual(slas["mess-utensils"], 5)
        self.assertEqual(slas["mess-maintenance"], 3)
        self.assertEqual(slas["hostel-boys-wifi"], 5)


class VisibilityAndConfidentialityTests(BaseCase):
    def test_student_cannot_edit_or_delete(self):
        c = self.file(self.student, ["mess-hygiene"])[0]
        api = bearer(self.student)
        self.assertEqual(api.delete(f"/api/v1/complaints/{c.id}/").status_code, 405)
        self.assertEqual(api.patch(f"/api/v1/complaints/{c.id}/", {"title": "x"}, format="json").status_code, 405)

    def test_domain_isolation(self):
        c = self.file(self.student, ["mess-hygiene"])[0]
        self.assertEqual(bearer(self.sports_sec).get(f"/api/v1/complaints/{c.id}/").status_code, 404)
        self.assertEqual(bearer(self.mess_sec).get(f"/api/v1/complaints/{c.id}/").status_code, 200)
        self.assertEqual(bearer(self.girl).get(f"/api/v1/complaints/{c.id}/").status_code, 404)

    def test_confidential_identity_masked_everywhere_for_secretary(self):
        c = self.file(self.student, ["mess-hygiene"], conf=True)[0]
        data = bearer(self.mess_sec).get(f"/api/v1/complaints/{c.id}/").json()
        blob = str(data)
        self.assertTrue(data["isAnonymized"])
        self.assertNotIn("241001", blob)
        self.assertNotIn(self.student.first_name, blob)  # history actor is masked too
        warden = bearer(self.warden).get(f"/api/v1/complaints/{c.id}/").json()
        self.assertEqual(warden["studentRollNo"], "241001")

    def test_users_endpoint_hides_students_and_scores(self):
        data = bearer(self.student).get("/api/v1/users/").json()
        self.assertTrue(all(u["role"] != "STUDENT" for u in data))
        self.assertTrue(all(u["negativePoints"] == 0 for u in data))


class WorkflowTests(BaseCase):
    def test_state_machine(self):
        c = self.file(self.student, ["mess-hygiene"])[0]
        api = bearer(self.mess_sec)
        self.assertEqual(api.post(f"/api/v1/complaints/{c.id}/status/", {"status": "RESOLVED", "remarks": "Fixed"}, format="json").status_code, 200)
        bad = api.post(f"/api/v1/complaints/{c.id}/status/", {"status": "PENDING"}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(bearer(self.student).post(f"/api/v1/complaints/{c.id}/status/", {"status": "IN_PROGRESS"}, format="json").status_code, 403)

    def test_reopen_resets_deadline_and_escalation(self):
        c = self.file(self.student, ["mess-hygiene"])[0]
        services.transition_status(c.id, self.mess_sec, "RESOLVED", "done")
        out = services.reopen_complaint(c.id, self.student, "Still broken")
        self.assertEqual(out.status, "PENDING")
        self.assertGreater(out.deadline, timezone.now() + timedelta(days=2))
        self.assertFalse(out.escalated_to_level_2)
        with self.assertRaises(Exception):
            services.reopen_complaint(c.id, self.student, "again")  # not resolved any more

    def test_official_cannot_resolve_own_complaint(self):
        c = self.file(self.mess_sec, ["hostel-boys-wifi"])[0]
        with self.assertRaises(Exception):
            services.transition_status(c.id, self.mess_sec, "RESOLVED", "self")


class PenaltyAndEscalationTests(BaseCase):
    def _overdue(self, code="mess-hygiene"):
        c = self.file(self.student, [code])[0]
        Complaint.objects.filter(pk=c.pk).update(deadline=timezone.now() - timedelta(days=1))
        return c

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_escalation_sends_real_email_once(self):
        c = self._overdue()
        out = services.run_escalation_scan("test")
        self.assertEqual(out["escalatedCount"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["messwarden@iiitt.ac.in"])
        services.run_escalation_scan("test")
        self.assertEqual(len(mail.outbox), 1)  # no duplicates
        c.refresh_from_db()
        self.assertTrue(c.escalated_to_level_2 and c.sla_breached)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_one_failing_email_does_not_block_others(self):
        self._overdue()
        self._overdue("hostel-boys-wifi")
        calls = {"n": 0}
        real = services.send_mail

        def flaky(*a, **k):
            calls["n"] += 1
            if calls["n"] == 1:
                raise OSError("smtp down")
            return real(*a, **k)

        with mock.patch.object(services, "send_mail", flaky):
            out = services.run_escalation_scan("test")
        self.assertEqual((out["escalatedCount"], out["failedCount"]), (1, 1))

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_penalty_applies_to_assigned_secretary_once_and_alerts_mess_warden(self):
        self.mess_sec.negative_points = 9
        self.mess_sec.save(update_fields=["negative_points"])
        c = self._overdue()
        services.run_escalation_scan("test")
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            services.decide_penalty(c.id, self.admin, "VERIFIED_APPLIED", 2, "Ignored for days")
        self.mess_sec.refresh_from_db()
        self.assertEqual(self.mess_sec.negative_points, 11)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["messwarden@iiitt.ac.in"])
        with self.assertRaises(Exception):
            services.decide_penalty(c.id, self.admin, "VERIFIED_APPLIED", 2, "twice")  # duplicate blocked
        services.decide_penalty(c.id, self.admin, "DISMISSED", None, "Vendor delay proven")
        self.mess_sec.refresh_from_db()
        self.assertEqual(self.mess_sec.negative_points, 9)  # reversal

    def test_penalty_validation_and_permissions(self):
        c = self.file(self.student, ["mess-hygiene"])[0]
        with self.assertRaises(Exception):
            services.decide_penalty(c.id, self.admin, "VERIFIED_APPLIED", 1, "not overdue yet")
        c = self._overdue()
        services.run_escalation_scan("test")
        with self.assertRaises(Exception):
            services.decide_penalty(c.id, self.warden, "VERIFIED_APPLIED", 1, "wardens cannot")
        for bad in (0, 99, "abc", -1):
            with self.assertRaises(Exception):
                services.decide_penalty(c.id, self.admin, "VERIFIED_APPLIED", bad, "bad points")

    def test_scan_endpoint_is_admin_only(self):
        self.assertEqual(APIClient().post("/api/v1/escalations/trigger-scan/").status_code, 401)
        self.assertEqual(bearer(self.student).post("/api/v1/escalations/trigger-scan/").status_code, 403)


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp(prefix="openear-test-evidence-"))
class EvidenceTests(BaseCase):
    def _jpeg_with_gps(self):
        img = Image.new("RGB", (40, 30), "red")
        exif = Image.Exif()
        exif[0x010F] = "SecretCameraMaker"
        buf = io.BytesIO()
        img.save(buf, "JPEG", exif=exif)
        return buf.getvalue()

    def test_exif_stripped_and_private_download(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        c = self.file(self.student, ["mess-hygiene"])[0]
        raw = self._jpeg_with_gps()
        self.assertIn(b"SecretCameraMaker", raw)
        api = bearer(self.student)
        res = api.post(
            f"/api/v1/complaints/{c.id}/attachments/",
            {"files": [SimpleUploadedFile("pic.jpg", raw, content_type="image/jpeg")]},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.content)
        att = res.json()["attachments"][0]
        self.assertEqual(att["storageKey"], "")
        stored = api.get(f"/api/v1/complaints/{c.id}/attachments/{att['id']}/")
        self.assertEqual(stored.status_code, 200)
        self.assertNotIn(b"SecretCameraMaker", b"".join(stored.streaming_content))
        self.assertEqual(bearer(self.sports_sec).get(f"/api/v1/complaints/{c.id}/attachments/{att['id']}/").status_code, 404)
        self.assertEqual(APIClient().get(f"/api/v1/complaints/{c.id}/attachments/{att['id']}/").status_code, 401)

    def test_non_image_rejected(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        c = self.file(self.student, ["mess-hygiene"])[0]
        res = bearer(self.student).post(
            f"/api/v1/complaints/{c.id}/attachments/",
            {"files": [SimpleUploadedFile("x.jpg", b"<script>alert(1)</script>", content_type="image/jpeg")]},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(c.attachments.count(), 0)
