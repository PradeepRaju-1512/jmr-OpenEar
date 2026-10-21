"""
OpenEar - Authentication & role models.

Roles are NOT trusted from the client. They are derived server-side from the
OfficialAssignment registry (plus OPENEAR_ADMIN_EMAILS) every time a token is used.
"""

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.exceptions import ValidationError
from django.db import models


def _institute_domain() -> str:
    from django.conf import settings

    return settings.ALLOWED_EMAIL_DOMAIN


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An institutional email is required.")
        email = self.normalize_email(email).lower()
        if not email.endswith("@" + _institute_domain()):
            raise ValidationError(f"Only @{_institute_domain()} emails are allowed.")
        extra_fields.setdefault("roll_number", email.split("@")[0])
        user = self.model(email=email, username=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """
    Tier model (no Registrar tier):
      0 Student | 1 Secretary | 2 Warden / Incharge | 99 Administrator
    """

    class Role(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        SECRETARY_MESS = "SEC_MESS", "Mess Secretary"
        SECRETARY_HOSTEL_BOYS = "SEC_HOSTEL_BOYS", "Boys Hostel Secretary"
        SECRETARY_HOSTEL_GIRLS = "SEC_HOSTEL_GIRLS", "Girls Hostel Secretary"
        SECRETARY_SPORTS_BOYS = "SEC_SPORTS_BOYS", "Boys Sports Secretary"
        SECRETARY_SPORTS_GIRLS = "SEC_SPORTS_GIRLS", "Girls Sports Secretary"
        SECRETARY_GENERAL = "SEC_GENERAL", "General Secretary"
        WARDEN_HOSTEL_BOYS = "WARDEN_HOSTEL_BOYS", "Boys Hostel Warden"
        WARDEN_HOSTEL_GIRLS = "WARDEN_HOSTEL_GIRLS", "Girls Hostel Warden"
        WARDEN_MESS = "WARDEN_MESS", "Mess Warden"
        INCHARGE_SPORTS = "INCHARGE_SPORTS", "Sports Incharge"
        ADMIN = "ADMIN", "System Administrator"

    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"

    LEVEL_1_ROLES = {
        "SEC_MESS", "SEC_HOSTEL_BOYS", "SEC_HOSTEL_GIRLS",
        "SEC_SPORTS_BOYS", "SEC_SPORTS_GIRLS", "SEC_GENERAL",
    }
    LEVEL_2_ROLES = {"WARDEN_HOSTEL_BOYS", "WARDEN_HOSTEL_GIRLS", "WARDEN_MESS", "INCHARGE_SPORTS"}

    email = models.EmailField(unique=True, verbose_name="IIITT Email Address")
    roll_number = models.CharField(max_length=30, verbose_name="Student Roll Number", db_index=True)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.STUDENT, db_index=True)
    gender = models.CharField(max_length=2, choices=Gender.choices, blank=True, null=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    room_or_flat = models.CharField(max_length=50, blank=True, null=True, help_text="e.g. Block A Room 204")

    domain_assignments = models.JSONField(default=list, blank=True, help_text="Synced from the registry; do not edit by hand")
    assigned_roles = models.JSONField(default=list, blank=True, help_text="Synced from the registry; do not edit by hand")

    negative_points = models.IntegerField(default=0, help_text="Verified SLA breach penalty points")

    google_oauth_sub = models.CharField(max_length=128, blank=True, null=True, unique=True)
    avatar_url = models.URLField(max_length=500, blank=True, null=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = CustomUserManager()

    class Meta:
        verbose_name = "IIITT User"
        verbose_name_plural = "IIITT Users"
        ordering = ["email"]

    def clean(self):
        super().clean()
        if self.email:
            self.email = self.email.lower()
            if not self.email.endswith("@" + _institute_domain()):
                raise ValidationError({"email": f"Only @{_institute_domain()} emails are allowed."})
            if not self.roll_number:
                self.roll_number = self.email.split("@")[0]

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_full_name() or self.roll_number} ({self.get_role_display()})"

    # ----- tier helpers -------------------------------------------------
    @property
    def is_admin(self) -> bool:
        return self.role == self.Role.ADMIN or bool(self.is_superuser)

    @property
    def is_level_2(self) -> bool:
        return self.role in self.LEVEL_2_ROLES and not self.is_admin

    @property
    def is_level_1(self) -> bool:
        return self.role in self.LEVEL_1_ROLES and not self.is_admin

    @property
    def tier_level(self) -> int:
        if self.is_admin:
            return 99
        if self.is_level_2:
            return 2
        if self.is_level_1:
            return 1
        return 0

    @property
    def role_title(self) -> str:
        labels = []
        for code in (self.assigned_roles or [self.role]):
            if code in self.Role.values:
                labels.append(self.Role(code).label)
        return " & ".join(labels) or self.get_role_display()

    @property
    def can_view_confidential_identity(self) -> bool:
        """Level 1 secretaries never see confidential identities; wardens and admins do."""
        return self.is_level_2 or self.is_admin

    def has_domain_access(self, domain: str) -> bool:
        """Authoritative: only the registry-synced domain list (admins: everything)."""
        if self.is_admin:
            return True
        return domain in (self.domain_assignments or [])


class OfficialAssignment(models.Model):
    """
    The single backend-controlled registry of office-bearers. Officials change every
    year: edit these rows in Django admin (or re-run `seed_openear`) and permissions
    follow on the person's very next request. Deactivating a row demotes them to student.
    """

    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=120)
    primary_role = models.CharField(max_length=32, choices=[c for c in User.Role.choices if c[0] != "STUDENT"])
    roles = models.JSONField(default=list, help_text='List of role codes, e.g. ["SEC_MESS", "SEC_HOSTEL_BOYS"]')
    domains = models.JSONField(default=list, help_text='List of domains, e.g. ["MESS", "HOSTEL_BOYS"]')
    gender = models.CharField(max_length=1, choices=[("M", "Male"), ("F", "Female")], blank=True, default="")
    is_active = models.BooleanField(default=True)
    term_label = models.CharField(max_length=40, blank=True, default="", help_text='e.g. "2026-27"')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["primary_role", "email"]
        verbose_name = "Official assignment"

    def clean(self):
        super().clean()
        self.email = (self.email or "").strip().lower()
        if self.email and not self.email.endswith("@" + _institute_domain()):
            raise ValidationError({"email": f"Only @{_institute_domain()} emails are allowed."})
        valid_roles = set(User.Role.values) - {"STUDENT"}
        if not isinstance(self.roles, list) or not set(self.roles) <= valid_roles:
            raise ValidationError({"roles": "Roles must be a list of valid role codes."})
        if self.primary_role not in (self.roles or []):
            raise ValidationError({"primary_role": "Primary role must be one of the listed roles."})
        from apps.complaints.models import ComplaintCategory

        valid_domains = set(ComplaintCategory.Domain.values)
        if not isinstance(self.domains, list) or not set(self.domains) <= valid_domains:
            raise ValidationError({"domains": "Domains must be a list of valid domain codes."})

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} -> {self.primary_role}"
