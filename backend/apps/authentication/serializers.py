"""Hand-written camelCase serialisation matching the React `User` type."""

from .registry import eligible_domains


def serialize_user(user, include_points: bool = True) -> dict:
    return {
        "id": str(user.id),
        "name": user.get_full_name() or user.roll_number,
        "email": user.email,
        "rollNumber": user.roll_number,
        "role": user.role,
        "roleTitle": user.role_title,
        "tierLevel": user.tier_level,
        "domainScope": list(user.domain_assignments or []),
        "negativePoints": user.negative_points if include_points else 0,
        "gender": user.gender or None,
        "needsProfile": not user.gender,
        "eligibleDomains": eligible_domains(user.gender),
    }
