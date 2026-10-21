"""OpenEar - complaint domain models."""

import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from .storage import private_evidence_storage

DOMAIN_CODES = {
    "MESS": "MESS",
    "HOSTEL_BOYS": "HSTB",
    "HOSTEL_GIRLS": "HSTG",
    "SPORTS_BOYS": "SPTB",
    "SPORTS_GIRLS": "SPTG",
    "OTHERS": "GEN",
}


class ComplaintCategory(models.Model):
    class Domain(models.TextChoices):
        MESS = "MESS", "Mess (Combined Boys & Girls)"
        HOSTEL_BOYS = "HOSTEL_BOYS", "Hostel (Boys)"
        HOSTEL_GIRLS = "HOSTEL_GIRLS", "Hostel (Girls)"
        SPORTS_BOYS = "SPORTS_BOYS", "Sports (Boys)"
        SPORTS_GIRLS = "SPORTS_GIRLS", "Sports (Girls)"
        OTHERS = "OTHERS", "General Secretary"

    code = models.SlugField(max_length=80, unique=True, help_text="Stable id used by the client, e.g. mess-hygiene")
    domain = models.CharField(max_length=30, choices=Domain.choices, db_index=True)
    name = models.CharField(max_length=100)
    sub_option = models.CharField(max_length=100, blank=True, null=True)
    sla_days = models.PositiveIntegerField(help_text="Resolution deadline in days")
    assigned_role = models.CharField(max_length=32, help_text="Level 1 secretary role handling this category")
    escalation_role = models.CharField(
        max_length=32,
        help_text="Role whose registry email receives escalations (resolved from the official registry)",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Complaint Category"
        verbose_name_plural = "Complaint Categories"
        ordering = ["domain", "name", "sub_option"]
        unique_together = [["domain", "name", "sub_option"]]

    def __str__(self):
        sub = f" -> {self.sub_option}" if self.sub_option else ""
        return f"[{self.domain}] {self.name}{sub} ({self.sla_days}d)"


class Complaint(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        RESOLVED = "RESOLVED", "Resolved"

    class PenaltyDecision(models.TextChoices):
        PENDING_REVIEW = "PENDING_REVIEW", "Pending Administrative Review"
        VERIFIED_APPLIED = "VERIFIED_APPLIED", "Verified & Penalty Applied"
        DISMISSED = "DISMISSED", "Dismissed"

    tracking_id = models.CharField(max_length=50, unique=True, editable=False)
    request_group = models.UUIDField(
        db_index=True, default=uuid.uuid4,
        help_text="Client-supplied idempotency key; shared by complaints sent to several secretaries at once",
    )

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="submitted_complaints")
    category = models.ForeignKey(ComplaintCategory, on_delete=models.PROTECT, related_name="complaints")
    sla_days_snapshot = models.PositiveIntegerField(help_text="SLA in force when the complaint was filed")

    title = models.CharField(max_length=200)
    description = models.TextField(max_length=5000)
    location_code = models.CharField(max_length=100, blank=True, null=True)
    is_confidential = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    deadline = models.DateTimeField(editable=False, db_index=True)

    first_resolved_at = models.DateTimeField(blank=True, null=True)
    last_resolved_at = models.DateTimeField(blank=True, null=True)
    is_reopened = models.BooleanField(default=False)
    reopened_count = models.PositiveIntegerField(default=0)

    assigned_secretary = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name="assigned_complaints"
    )

    sla_breached = models.BooleanField(default=False, db_index=True)
    escalated_to_level_2 = models.BooleanField(default=False, db_index=True)
    escalated_at = models.DateTimeField(blank=True, null=True)
    escalation_attempts = models.PositiveSmallIntegerField(default=0)

    penalty_decision = models.CharField(
        max_length=20, choices=PenaltyDecision.choices, default=PenaltyDecision.PENDING_REVIEW, db_index=True
    )
    penalty_points_amount = models.PositiveIntegerField(default=0)
    penalty_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name="verified_penalties"
    )
    penalty_verified_at = models.DateTimeField(blank=True, null=True)
    penalty_reason = models.TextField(blank=True, null=True)

    resolution_remarks = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]

    @staticmethod
    def new_tracking_id(domain: str) -> str:
        code = DOMAIN_CODES.get(domain, "GEN")
        year = timezone.now().year
        for _ in range(20):
            candidate = f"OE-{year}-{code}-{secrets.token_hex(3).upper()}"
            if not Complaint.objects.filter(tracking_id=candidate).exists():
                return candidate
        raise RuntimeError("Could not allocate a unique tracking id")

    def save(self, *args, **kwargs):
        if self._state.adding:
            if not self.sla_days_snapshot:
                self.sla_days_snapshot = self.category.sla_days
            if not self.deadline:
                self.deadline = (self.created_at or timezone.now()) + timedelta(days=self.sla_days_snapshot)
            if not self.tracking_id:
                self.tracking_id = self.new_tracking_id(self.category.domain)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.tracking_id

    @property
    def is_overdue(self) -> bool:
        return self.status != self.Status.RESOLVED and timezone.now() > self.deadline


class ComplaintStatusHistory(models.Model):
    """Append-only audit trail of status transitions."""

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="status_history")
    previous_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    remarks = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]


class EscalationAuditLog(models.Model):
    """One row per escalation email attempt per recipient (real delivery result, never simulated)."""

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="escalation_logs")
    recipient_role = models.CharField(max_length=32)
    recipient_email = models.EmailField(blank=True, default="")
    attempted_at = models.DateTimeField(default=timezone.now)
    delivered = models.BooleanField(default=False)
    retry_count = models.PositiveIntegerField(default=0)
    triggered_by = models.CharField(max_length=254, default="system")
    error_message = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-attempted_at", "-id"]


class PenaltyAuditLog(models.Model):
    """Append-only trail of every penalty decision and any reversal."""

    class Action(models.TextChoices):
        APPLIED = "APPLIED", "Applied"
        DISMISSED = "DISMISSED", "Dismissed"
        REVERSED = "REVERSED", "Reversed"

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="penalty_audit")
    secretary = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=12, choices=Action.choices)
    points = models.IntegerField(default=0)
    secretary_score_after = models.IntegerField(null=True, blank=True)
    reason = models.TextField()
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]


class ScoreAlertLog(models.Model):
    """Mess Warden notification sent when a secretary's negative score exceeds the threshold."""

    secretary = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    score = models.IntegerField()
    recipient_email = models.EmailField(blank=True, default="")
    delivered = models.BooleanField(default=False, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    last_attempt_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class ComplaintAttachment(models.Model):
    """Private, re-encoded (EXIF-free) evidence image. Only served through the authenticated endpoint."""

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="attachments")
    uploader = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="uploaded_attachments")
    file = models.FileField(upload_to="evidence/%Y/%m/", storage=private_evidence_storage)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    file_size_bytes = models.PositiveIntegerField()
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"[{self.complaint.tracking_id}] {self.original_filename}"
