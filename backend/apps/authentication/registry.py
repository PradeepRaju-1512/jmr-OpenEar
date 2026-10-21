"""
OpenEar - official registry resolution & permission synchronisation.

Single source of truth: OfficialAssignment rows (+ OPENEAR_ADMIN_EMAILS).
`DEFAULT_OFFICIALS` is only the seed data used by `manage.py seed_openear`.
"""

import logging
from typing import Dict, List, Optional

from django.conf import settings

logger = logging.getLogger(__name__)

ALL_DOMAINS = ["MESS", "HOSTEL_BOYS", "HOSTEL_GIRLS", "SPORTS_BOYS", "SPORTS_GIRLS", "OTHERS"]

# Seed data for the 2026-27 term. NOTE: the Girls' Sports Secretary address was only
# supplied as "231167"; "@iiitt.ac.in" is assumed - confirm and edit in Django admin.
DEFAULT_OFFICIALS: List[Dict] = [
    {"email": "messwarden@iiitt.ac.in", "display_name": "Mess Warden", "primary_role": "WARDEN_MESS",
     "roles": ["WARDEN_MESS"], "domains": ["MESS"], "gender": ""},
    {"email": "231129@iiitt.ac.in", "display_name": "Boys' Mess & Hostel Secretary", "primary_role": "SEC_MESS",
     "roles": ["SEC_MESS", "SEC_HOSTEL_BOYS"], "domains": ["MESS", "HOSTEL_BOYS"], "gender": "M"},
    {"email": "251256@iiitt.ac.in", "display_name": "Girls' Mess & Hostel Secretary", "primary_role": "SEC_MESS",
     "roles": ["SEC_MESS", "SEC_HOSTEL_GIRLS"], "domains": ["MESS", "HOSTEL_GIRLS"], "gender": "F"},
    {"email": "chiefwarden@iiitt.ac.in", "display_name": "Hostel Warden", "primary_role": "WARDEN_HOSTEL_BOYS",
     "roles": ["WARDEN_HOSTEL_BOYS", "WARDEN_HOSTEL_GIRLS"], "domains": ["HOSTEL_BOYS", "HOSTEL_GIRLS"], "gender": ""},
    {"email": "231119@iiitt.ac.in", "display_name": "Boys' Sports Secretary", "primary_role": "SEC_SPORTS_BOYS",
     "roles": ["SEC_SPORTS_BOYS"], "domains": ["SPORTS_BOYS"], "gender": "M"},
    {"email": "231167@iiitt.ac.in", "display_name": "Girls' Sports Secretary", "primary_role": "SEC_SPORTS_GIRLS",
     "roles": ["SEC_SPORTS_GIRLS"], "domains": ["SPORTS_GIRLS"], "gender": "F"},
    {"email": "sureshd@iiitt.ac.in", "display_name": "Sports Incharge", "primary_role": "INCHARGE_SPORTS",
     "roles": ["INCHARGE_SPORTS"], "domains": ["SPORTS_BOYS", "SPORTS_GIRLS"], "gender": ""},
    {"email": "231136@iiitt.ac.in", "display_name": "General Secretary", "primary_role": "SEC_GENERAL",
     "roles": ["SEC_GENERAL"], "domains": ["OTHERS"], "gender": "M"},
]


def eligible_domains(gender) -> List[str]:
    """Which complaint domains a student of this gender may file in (single source of truth)."""
    if not gender:
        return []
    domains = ["MESS"]
    if gender in ("M", "O"):
        domains += ["HOSTEL_BOYS", "SPORTS_BOYS"]
    if gender in ("F", "O"):
        domains += ["HOSTEL_GIRLS", "SPORTS_GIRLS"]
    if not settings.GENERAL_SECRETARY_BOYS_ONLY or gender == "M":
        domains.append("OTHERS")
    return domains


def resolve_assignment(email: str) -> Optional[Dict]:
    """Return the effective assignment for an email, or None for an ordinary student."""
    from .models import OfficialAssignment

    email = (email or "").strip().lower()
    if email in settings.OPENEAR_ADMIN_EMAILS:
        return {"primary_role": "ADMIN", "roles": ["ADMIN"], "domains": list(ALL_DOMAINS),
                "display_name": "System Administrator", "gender": ""}
    row = OfficialAssignment.objects.filter(email__iexact=email, is_active=True).first()
    if row is None:
        return None
    return {"primary_role": row.primary_role, "roles": list(row.roles), "domains": list(row.domains),
            "display_name": row.display_name, "gender": row.gender}


def official_emails_for_role(role_code: str) -> List[str]:
    """Active registry emails currently holding `role_code` (used for escalation routing)."""
    from .models import OfficialAssignment

    emails = []
    if role_code == "ADMIN":
        emails.extend(settings.OPENEAR_ADMIN_EMAILS)
    for row in OfficialAssignment.objects.filter(is_active=True):
        if role_code in (row.roles or []):
            emails.append(row.email)
    seen, ordered = set(), []
    for e in emails:
        if e not in seen:
            seen.add(e)
            ordered.append(e)
    return ordered


def sync_user_with_registry(user):
    """
    Make the stored role/domains match the registry. Called on login AND on every
    authenticated request, so a former official loses privileges immediately and a
    new official gains them without needing to log in again.
    """
    # Accounts created with `createsuperuser` are managed from the command line.
    if user.is_superuser and user.role == "ADMIN":
        return user

    assignment = resolve_assignment(user.email)
    wanted_role = assignment["primary_role"] if assignment else "STUDENT"
    wanted_roles = assignment["roles"] if assignment else []
    wanted_domains = assignment["domains"] if assignment else []

    changed = []
    lost_authority = False
    if user.role != wanted_role:
        lost_authority = user.role != "STUDENT" and wanted_role == "STUDENT"
        user.role = wanted_role
        changed.append("role")
    if list(user.assigned_roles or []) != wanted_roles:
        user.assigned_roles = wanted_roles
        changed.append("assigned_roles")
    if list(user.domain_assignments or []) != wanted_domains:
        if set(user.domain_assignments or []) - set(wanted_domains):
            lost_authority = True
        user.domain_assignments = wanted_domains
        changed.append("domain_assignments")
    if assignment and assignment.get("gender") and not user.gender:
        user.gender = assignment["gender"]
        changed.append("gender")
    if assignment and not user.first_name and assignment.get("display_name"):
        user.first_name = assignment["display_name"]
        changed.append("first_name")

    if changed:
        user.save(update_fields=changed)
        logger.info("Synchronised registry roles for %s: %s", user.email, changed)
    if lost_authority:
        # Open complaints must not stay pinned to someone who no longer holds the post.
        from apps.complaints.models import Complaint

        Complaint.objects.filter(assigned_secretary=user).exclude(status="RESOLVED").update(assigned_secretary=None)
    return user
