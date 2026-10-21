from django.core.management.base import BaseCommand
from django.db import transaction

from apps.authentication.models import OfficialAssignment
from apps.authentication.registry import DEFAULT_OFFICIALS
from apps.complaints.categories_data import CATEGORIES
from apps.complaints.models import ComplaintCategory


class Command(BaseCommand):
    help = "Create/refresh complaint categories and the default official registry (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset-officials",
            action="store_true",
            help="Overwrite existing registry rows with the defaults (otherwise existing rows are left untouched).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        created = updated = 0
        for row in CATEGORIES:
            _, was_created = ComplaintCategory.objects.update_or_create(
                code=row["code"],
                defaults={
                    "domain": row["domain"],
                    "name": row["name"],
                    "sub_option": row["sub_option"],
                    "sla_days": row["sla_days"],
                    "assigned_role": row["assigned_role"],
                    "escalation_role": row["escalation_role"],
                    "is_active": True,
                },
            )
            created += was_created
            updated += not was_created
        retired = ComplaintCategory.objects.exclude(code__in=[r["code"] for r in CATEGORIES]).update(is_active=False)
        self.stdout.write(f"Categories: {created} created, {updated} updated, {retired} retired.")

        official_new = 0
        for row in DEFAULT_OFFICIALS:
            defaults = {k: v for k, v in row.items() if k != "email"}
            defaults["term_label"] = "2026-27"
            if options["reset_officials"]:
                OfficialAssignment.objects.update_or_create(email=row["email"], defaults=defaults)
                official_new += 1
            else:
                _, was_created = OfficialAssignment.objects.get_or_create(email=row["email"], defaults=defaults)
                official_new += was_created
        self.stdout.write(f"Officials: {official_new} written. Manage them in Django admin > Official assignments.")
