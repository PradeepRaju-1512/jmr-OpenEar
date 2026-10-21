# OpenEar backend (Django REST)

See the repository README for setup. Key modules:

- `apps/authentication` - Google token verification, `OfficialAssignment` registry, expiring bearer tokens.
- `apps/complaints/services.py` - every business rule (visibility, workflow state machine, penalties, escalation, evidence).
- `apps/complaints/categories_data.py` - canonical categories and SLAs (`manage.py seed_openear`).

Migrations were written by hand: after installing dependencies run `python manage.py makemigrations --check`.
