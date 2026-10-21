"""
OpenEar - complaint business logic. Every rule that matters (who may see/act on a complaint,
legal status transitions, gender/domain eligibility, penalties, escalation, evidence handling)
is enforced here on the server; the client is never trusted.
"""

import io
import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from PIL import Image, ImageOps
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.authentication.models import User
from apps.authentication.registry import eligible_domains, official_emails_for_role

from .models import (
    Complaint,
    ComplaintAttachment,
    ComplaintCategory,
    ComplaintStatusHistory,
    EscalationAuditLog,
    PenaltyAuditLog,
    ScoreAlertLog,
)

logger = logging.getLogger(__name__)

UNRESOLVED = [Complaint.Status.PENDING, Complaint.Status.IN_PROGRESS]

ALLOWED_TRANSITIONS = {
    Complaint.Status.PENDING: {Complaint.Status.IN_PROGRESS, Complaint.Status.RESOLVED},
    Complaint.Status.IN_PROGRESS: {Complaint.Status.PENDING, Complaint.Status.RESOLVED},
    Complaint.Status.RESOLVED: set(),  # only the student can reopen
}


# ---------------------------------------------------------------------------
# Visibility & permissions
# ---------------------------------------------------------------------------
def visible_complaints_for(user):
    base = Complaint.objects.select_related(
        "student", "category", "assigned_secretary", "penalty_verified_by"
    ).prefetch_related("status_history__changed_by", "attachments", "escalation_logs")
    if user.is_admin:
        return base
    own = Q(student=user)
    domains = user.domain_assignments or []
    if user.is_level_2:
        return base.filter(own | Q(category__domain__in=domains))
    if user.is_level_1:
        mine = Q(category__domain__in=domains) & (Q(assigned_secretary=user) | Q(assigned_secretary__isnull=True))
        return base.filter(own | mine)
    return base.filter(own)


def can_act_on(user, complaint) -> bool:
    """May `user` change this complaint's status as an official?"""
    if complaint.student_id == user.id and not user.is_admin:
        return False  # nobody resolves their own complaint
    if user.is_admin:
        return True
    if not complaint.category or not user.has_domain_access(complaint.category.domain):
        return False
    if user.is_level_2:
        return True
    if user.is_level_1:
        return complaint.assigned_secretary_id in (None, user.id)
    return False


def is_masked_for(user, complaint) -> bool:
    return bool(
        complaint.is_confidential
        and complaint.student_id != user.id
        and not user.can_view_confidential_identity
    )


# ---------------------------------------------------------------------------
# Filing
# ---------------------------------------------------------------------------
def assert_can_file(student, category):
    if not student.gender:
        raise ValidationError("Please complete your profile (gender) before filing a grievance.")
    if category.domain not in eligible_domains(student.gender):
        if category.domain == "OTHERS":
            raise ValidationError("The General Secretary section is currently limited to boys.")
        raise ValidationError("This section is not open to your hostel/sports community.")


def pick_secretary(category, student):
    candidates = [
        u
        for u in User.objects.filter(is_active=True).exclude(role=User.Role.STUDENT).exclude(pk=student.pk)
        if category.assigned_role in (u.assigned_roles or [])
        and category.domain in (u.domain_assignments or [])
        and not u.is_admin
    ]
    if not candidates:
        return None
    same_gender = [u for u in candidates if u.gender and u.gender == student.gender]
    return sorted(same_gender or candidates, key=lambda u: u.id)[0]


def _clean_text(value, field, *, max_len, min_len=0, required=True):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be text.")
    value = value.strip()
    if required and len(value) < max(min_len, 1):
        raise ValidationError(f"{field} is required" + (f" (at least {min_len} characters)." if min_len else "."))
    if len(value) > max_len:
        raise ValidationError(f"{field} must be at most {max_len} characters.")
    return value


@transaction.atomic
def create_complaints(student, *, category_codes, title, description, location_code, is_confidential, request_id):
    if not isinstance(category_codes, list) or not category_codes:
        raise ValidationError("Select at least one category.")
    codes = list(dict.fromkeys(str(c) for c in category_codes))
    if len(codes) > settings.MAX_COMPLAINT_TARGETS:
        raise ValidationError(f"You can address at most {settings.MAX_COMPLAINT_TARGETS} secretaries at once.")

    try:
        group = uuid.UUID(str(request_id)) if request_id else uuid.uuid4()
    except ValueError:
        raise ValidationError("requestId must be a UUID.")

    existing = list(Complaint.objects.filter(request_group=group, student=student))
    if existing:  # idempotent retry: never create duplicates
        return existing, False

    title = _clean_text(title, "Title", max_len=200, min_len=3)
    description = _clean_text(description, "Description", max_len=5000, min_len=10)
    location_code = _clean_text(location_code, "Location", max_len=100, required=False) or None

    categories = list(ComplaintCategory.objects.filter(code__in=codes, is_active=True))
    if len(categories) != len(codes):
        raise ValidationError("One or more selected categories do not exist.")

    created = []
    for category in categories:
        assert_can_file(student, category)
        complaint = Complaint.objects.create(
            student=student,
            category=category,
            sla_days_snapshot=category.sla_days,
            request_group=group,
            title=title,
            description=description,
            location_code=location_code,
            is_confidential=bool(is_confidential),
            assigned_secretary=pick_secretary(category, student),
        )
        ComplaintStatusHistory.objects.create(
            complaint=complaint,
            previous_status=Complaint.Status.PENDING,
            new_status=Complaint.Status.PENDING,
            changed_by=student,
            remarks="Grievance registered.",
        )
        created.append(complaint)
    return created, True


# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------
def _locked(complaint_id):
    try:
        return (
            Complaint.objects.select_for_update(of=("self",))
            .select_related("student", "category", "assigned_secretary")
            .get(pk=complaint_id)
        )
    except (Complaint.DoesNotExist, ValueError):
        raise NotFound("Grievance not found.")


@transaction.atomic
def transition_status(complaint_id, actor, new_status, remarks):
    complaint = _locked(complaint_id)
    if not visible_complaints_for(actor).filter(pk=complaint.pk).exists():
        raise NotFound("Grievance not found.")
    if not can_act_on(actor, complaint):
        raise PermissionDenied("You are not authorised to update this grievance.")
    if new_status not in Complaint.Status.values:
        raise ValidationError("Unknown status.")
    remarks = _clean_text(remarks, "Remarks", max_len=1000, required=False)

    current = Complaint.Status(complaint.status)
    target = Complaint.Status(new_status)
    if target == current:
        raise ValidationError(f"The grievance is already {current.label}.")
    if target not in ALLOWED_TRANSITIONS[current]:
        hint = " Only the student can reopen a resolved grievance." if current == Complaint.Status.RESOLVED else ""
        raise ValidationError(f"Cannot move a grievance from {current.label} to {target.label}.{hint}")

    now = timezone.now()
    if complaint.assigned_secretary_id is None and actor.is_level_1:
        complaint.assigned_secretary = actor
    if target == Complaint.Status.RESOLVED:
        complaint.first_resolved_at = complaint.first_resolved_at or now
        complaint.last_resolved_at = now
        if remarks:
            complaint.resolution_remarks = remarks
        if now > complaint.deadline:
            complaint.sla_breached = True
    complaint.status = target
    complaint.save()
    ComplaintStatusHistory.objects.create(
        complaint=complaint, previous_status=current, new_status=target, changed_by=actor, remarks=remarks or None
    )
    return complaint


@transaction.atomic
def reopen_complaint(complaint_id, actor, remarks):
    complaint = _locked(complaint_id)
    if complaint.student_id != actor.id:
        raise NotFound("Grievance not found.")
    if complaint.status != Complaint.Status.RESOLVED:
        raise ValidationError("Only resolved grievances can be reopened.")
    remarks = _clean_text(remarks, "Reason for reopening", max_len=1000, min_len=5)
    if complaint.reopened_count >= settings.MAX_REOPENS:
        raise ValidationError("This grievance has already been reopened the maximum number of times.")
    now = timezone.now()
    if complaint.last_resolved_at and now - complaint.last_resolved_at > timedelta(days=settings.REOPEN_WINDOW_DAYS):
        raise ValidationError(f"Grievances can only be reopened within {settings.REOPEN_WINDOW_DAYS} days of resolution.")

    complaint.status = Complaint.Status.PENDING
    complaint.is_reopened = True
    complaint.reopened_count += 1
    complaint.deadline = now + timedelta(days=complaint.sla_days_snapshot)  # fresh clock for the new round
    complaint.escalated_to_level_2 = False
    complaint.escalated_at = None
    complaint.escalation_attempts = 0
    complaint.save()
    ComplaintStatusHistory.objects.create(
        complaint=complaint,
        previous_status=Complaint.Status.RESOLVED,
        new_status=Complaint.Status.PENDING,
        changed_by=actor,
        remarks=f"Reopened by student: {remarks}",
    )
    return complaint


# ---------------------------------------------------------------------------
# Penalties
# ---------------------------------------------------------------------------
def _send_mail_strict(subject, body, recipients):
    """Raises on failure. Returns only when the SMTP server accepted the message."""
    sent = send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=False)
    if not sent:
        raise RuntimeError("Mail backend reported 0 messages sent.")


def deliver_score_alert(alert: ScoreAlertLog):
    secretary = alert.secretary
    alert.attempts += 1
    alert.last_attempt_at = timezone.now()
    try:
        if not alert.recipient_email:
            raise RuntimeError("No Mess Warden is configured in the official registry.")
        _send_mail_strict(
            f"[OpenEar] Secretary {secretary.get_full_name() or secretary.roll_number} exceeded {settings.SCORE_ALERT_THRESHOLD} penalty points",
            (
                f"Secretary: {secretary.get_full_name() or secretary.roll_number} <{secretary.email}>\n"
                f"Role: {secretary.role_title}\n"
                f"Verified negative score: {alert.score} (threshold: {settings.SCORE_ALERT_THRESHOLD})\n\n"
                f"Review at {settings.FRONTEND_URL}"
            ),
            [alert.recipient_email],
        )
        alert.delivered = True
        alert.last_error = ""
    except Exception as exc:  # noqa: BLE001 - recorded, retried by the periodic scan
        logger.exception("Score alert email failed (alert %s)", alert.pk)
        alert.last_error = str(exc)[:500]
    alert.save()


@transaction.atomic
def decide_penalty(complaint_id, actor, decision, points, reason):
    if not actor.is_admin:
        raise PermissionDenied("Only administrators can verify penalties.")
    complaint = _locked(complaint_id)
    reason = _clean_text(reason, "Reason", max_len=1000, min_len=5)
    if decision not in (Complaint.PenaltyDecision.VERIFIED_APPLIED, Complaint.PenaltyDecision.DISMISSED):
        raise ValidationError("Decision must be VERIFIED_APPLIED or DISMISSED.")
    if not complaint.sla_breached:
        raise ValidationError("Penalties can only be decided for grievances that breached their deadline.")

    now = timezone.now()
    secretary = None
    alert = None

    if decision == Complaint.PenaltyDecision.VERIFIED_APPLIED:
        if complaint.penalty_decision == Complaint.PenaltyDecision.VERIFIED_APPLIED:
            raise ValidationError("A penalty has already been applied for this grievance.")
        try:
            points = int(points)
        except (TypeError, ValueError):
            raise ValidationError("Points must be a whole number.")
        if not 1 <= points <= settings.MAX_PENALTY_POINTS:
            raise ValidationError(f"Points must be between 1 and {settings.MAX_PENALTY_POINTS}.")
        secretary = complaint.assigned_secretary
        if secretary is None or not secretary.is_level_1:
            raise ValidationError("No active secretary is assigned to this grievance, so no penalty can be applied.")
        before = User.objects.select_for_update().get(pk=secretary.pk).negative_points
        User.objects.filter(pk=secretary.pk).update(negative_points=F("negative_points") + points)
        secretary.refresh_from_db()
        complaint.penalty_points_amount = points
        PenaltyAuditLog.objects.create(
            complaint=complaint, secretary=secretary, actor=actor, action=PenaltyAuditLog.Action.APPLIED,
            points=points, secretary_score_after=secretary.negative_points, reason=reason,
        )
        if before <= settings.SCORE_ALERT_THRESHOLD < secretary.negative_points:
            warden_emails = official_emails_for_role("WARDEN_MESS")
            alert = ScoreAlertLog.objects.create(
                secretary=secretary, score=secretary.negative_points,
                recipient_email=warden_emails[0] if warden_emails else "",
            )
    else:  # DISMISSED
        if complaint.penalty_decision == Complaint.PenaltyDecision.VERIFIED_APPLIED and complaint.penalty_points_amount:
            secretary = complaint.assigned_secretary
            if secretary is not None:
                reverse = complaint.penalty_points_amount
                User.objects.select_for_update().get(pk=secretary.pk)
                User.objects.filter(pk=secretary.pk).update(negative_points=F("negative_points") - reverse)
                secretary.refresh_from_db()
                PenaltyAuditLog.objects.create(
                    complaint=complaint, secretary=secretary, actor=actor, action=PenaltyAuditLog.Action.REVERSED,
                    points=-reverse, secretary_score_after=secretary.negative_points, reason=reason,
                )
        complaint.penalty_points_amount = 0
        PenaltyAuditLog.objects.create(
            complaint=complaint, secretary=complaint.assigned_secretary, actor=actor,
            action=PenaltyAuditLog.Action.DISMISSED, points=0, reason=reason,
        )

    complaint.penalty_decision = decision
    complaint.penalty_verified_by = actor
    complaint.penalty_verified_at = now
    complaint.penalty_reason = reason
    complaint.save()

    if alert is not None:
        transaction.on_commit(lambda: deliver_score_alert(ScoreAlertLog.objects.select_related("secretary").get(pk=alert.pk)))
    return complaint


# ---------------------------------------------------------------------------
# Escalation (real email, per-complaint isolation, bounded retries)
# ---------------------------------------------------------------------------
def escalation_recipients(category):
    if category.domain == "OTHERS" and settings.GENERAL_ESCALATION_EMAIL:
        return [settings.GENERAL_ESCALATION_EMAIL]
    if category.domain == "OTHERS":
        return official_emails_for_role("ADMIN")
    return official_emails_for_role(category.escalation_role)


def _escalate_one(complaint_id, triggered_by):
    with transaction.atomic():
        complaint = (
            Complaint.objects.select_for_update(of=("self",)).select_related("category", "student").get(pk=complaint_id)
        )
        if complaint.escalated_to_level_2 or complaint.status == Complaint.Status.RESOLVED:
            return None
        category = complaint.category
        recipients = escalation_recipients(category)
        attempt_no = complaint.escalation_attempts + 1
        complaint.escalation_attempts = attempt_no

        if not recipients:
            EscalationAuditLog.objects.create(
                complaint=complaint, recipient_role=category.escalation_role, recipient_email="",
                delivered=False, retry_count=attempt_no - 1, triggered_by=triggered_by,
                error_message="No recipient configured in the official registry.",
            )
            complaint.save(update_fields=["escalation_attempts"])
            return False

        overdue_by = timezone.now() - complaint.deadline
        days, hours = overdue_by.days, overdue_by.seconds // 3600
        student = complaint.student
        # Recipients are wardens / admins, who are allowed to see confidential identities.
        identity = f"{student.get_full_name() or student.roll_number} <{student.email}>"
        body = (
            f"Grievance {complaint.tracking_id} has passed its resolution deadline.\n\n"
            f"Category: {category.name}{' / ' + category.sub_option if category.sub_option else ''}\n"
            f"Domain: {category.domain}\n"
            f"Title: {complaint.title}\n"
            f"Submitted by: {identity}{' (marked confidential)' if complaint.is_confidential else ''}\n"
            f"Deadline: {timezone.localtime(complaint.deadline).strftime('%d %b %Y %H:%M')}\n"
            f"Overdue by: {days} day(s) {hours} hour(s)\n"
            f"Status: {complaint.get_status_display()}\n\n"
            f"Details: {complaint.description}\n\n"
            f"Open OpenEar: {settings.FRONTEND_URL}"
        )
        error = None
        try:
            _send_mail_strict(f"[OpenEar] OVERDUE: {complaint.tracking_id} - {category.name}", body, recipients)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Escalation email failed for %s", complaint.tracking_id)
            error = str(exc)[:500]

        for email in recipients:
            EscalationAuditLog.objects.create(
                complaint=complaint, recipient_role=category.escalation_role, recipient_email=email,
                delivered=error is None, retry_count=attempt_no - 1, triggered_by=triggered_by, error_message=error,
            )
        fields = ["escalation_attempts"]
        if error is None:
            complaint.escalated_to_level_2 = True
            complaint.escalated_at = timezone.now()
            fields += ["escalated_to_level_2", "escalated_at"]
        complaint.save(update_fields=fields)
        return error is None


def run_escalation_scan(triggered_by="system"):
    now = timezone.now()
    marked = Complaint.objects.filter(status__in=UNRESOLVED, deadline__lt=now, sla_breached=False).update(sla_breached=True)

    ids = list(
        Complaint.objects.filter(
            sla_breached=True, status__in=UNRESOLVED, escalated_to_level_2=False,
            escalation_attempts__lt=settings.ESCALATION_MAX_ATTEMPTS,
        ).values_list("pk", flat=True)
    )
    escalated = failed = 0
    for pk in ids:  # one bad complaint/recipient never blocks the others
        try:
            result = _escalate_one(pk, triggered_by)
        except Exception:  # noqa: BLE001
            logger.exception("Unexpected error escalating complaint %s", pk)
            failed += 1
            continue
        if result is True:
            escalated += 1
        elif result is False:
            failed += 1

    alerts_sent = 0
    for alert in ScoreAlertLog.objects.select_related("secretary").filter(delivered=False, attempts__lt=settings.ESCALATION_MAX_ATTEMPTS):
        if not alert.recipient_email:
            warden = official_emails_for_role("WARDEN_MESS")
            alert.recipient_email = warden[0] if warden else ""
        deliver_score_alert(alert)
        alerts_sent += int(alert.delivered)

    return {"newlyOverdue": marked, "escalatedCount": escalated, "failedCount": failed, "scoreAlertsSent": alerts_sent}


# ---------------------------------------------------------------------------
# Evidence images
# ---------------------------------------------------------------------------
ALLOWED_FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}
MAX_PIXELS = 40_000_000


def sanitize_image(upload):
    """Validate it really is an image and re-encode it from pixels, dropping EXIF/GPS and all other metadata."""
    name = getattr(upload, "name", "image")
    data = upload.read(settings.MAX_ATTACHMENT_BYTES + 1)
    if len(data) > settings.MAX_ATTACHMENT_BYTES:
        raise ValidationError(f"{name}: larger than {settings.MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB.")
    if not data:
        raise ValidationError(f"{name}: file is empty.")
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        probe = Image.open(io.BytesIO(data))
        probe.verify()
        image = Image.open(io.BytesIO(data))
        fmt = image.format
        if fmt not in ALLOWED_FORMATS:
            raise ValidationError(f"{name}: only JPEG, PNG or WebP images are accepted.")
        if image.width * image.height > MAX_PIXELS:
            raise ValidationError(f"{name}: image dimensions are too large.")
        image.load()
        image = ImageOps.exif_transpose(image)  # bake in orientation, then drop all metadata on re-encode
        out = io.BytesIO()
        if fmt == "JPEG":
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            image.save(out, "JPEG", quality=88, optimize=True)
        elif fmt == "PNG":
            image.save(out, "PNG", optimize=True)
        else:
            image.save(out, "WEBP", quality=88)
    except ValidationError:
        raise
    except Exception:  # noqa: BLE001 - corrupt, truncated, or decompression-bomb input
        raise ValidationError(f"{name}: not a valid image file.")
    content_type, ext = ALLOWED_FORMATS[fmt]
    return out.getvalue(), content_type, ext


def _safe_display_name(raw, index, ext):
    base = "".join(ch for ch in str(raw or "") if ch.isalnum() or ch in "._- ")[:80].strip()
    return base or f"evidence-{index}.{ext}"


def add_attachments(complaint_id, actor, files):
    complaint = Complaint.objects.filter(pk=complaint_id).select_related("category").first()
    if complaint is None or complaint.student_id != actor.id:
        raise NotFound("Grievance not found.")
    if complaint.status == Complaint.Status.RESOLVED:
        raise ValidationError("Evidence cannot be added to a resolved grievance.")
    if not files:
        raise ValidationError("No files were provided.")

    existing = complaint.attachments.count()
    if existing + len(files) > settings.MAX_ATTACHMENTS_PER_COMPLAINT:
        raise ValidationError(f"At most {settings.MAX_ATTACHMENTS_PER_COMPLAINT} images per grievance (already {existing}).")

    processed = [(f, *sanitize_image(f)) for f in files]  # validate everything BEFORE writing anything

    saved_names, created = [], []
    try:
        with transaction.atomic():
            locked = Complaint.objects.select_for_update().get(pk=complaint.pk)
            if locked.attachments.count() + len(processed) > settings.MAX_ATTACHMENTS_PER_COMPLAINT:
                raise ValidationError("Attachment limit reached.")
            for index, (upload, data, content_type, ext) in enumerate(processed, start=existing + 1):
                att = ComplaintAttachment(
                    complaint=locked, uploader=actor, original_filename=_safe_display_name(upload.name, index, ext),
                    content_type=content_type, file_size_bytes=len(data),
                )
                att.file.save(f"{uuid.uuid4().hex}.{ext}", ContentFile(data), save=False)
                saved_names.append(att.file.name)
                att.save()
                created.append(att)
    except Exception:
        storage = ComplaintAttachment._meta.get_field("file").storage
        for name in saved_names:  # no orphaned files if anything failed
            try:
                storage.delete(name)
            except Exception:  # noqa: BLE001
                logger.warning("Could not clean up evidence file %s", name)
        raise
    return created
