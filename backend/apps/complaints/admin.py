from django.contrib import admin

from .models import (
    Complaint,
    ComplaintAttachment,
    ComplaintCategory,
    ComplaintStatusHistory,
    EscalationAuditLog,
    PenaltyAuditLog,
    ScoreAlertLog,
)


@admin.register(ComplaintCategory)
class ComplaintCategoryAdmin(admin.ModelAdmin):
    list_display = ("code", "domain", "name", "sub_option", "sla_days", "assigned_role", "escalation_role", "is_active")
    list_filter = ("domain", "is_active")


class ReadOnlyAdmin(admin.ModelAdmin):
    """Audit data is evidence: viewable but not editable or deletable from the admin."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Complaint)
class ComplaintAdmin(ReadOnlyAdmin):
    list_display = ("tracking_id", "category", "status", "deadline", "sla_breached", "escalated_to_level_2", "penalty_decision")
    list_filter = ("status", "sla_breached", "escalated_to_level_2", "penalty_decision", "category__domain")
    search_fields = ("tracking_id",)
    exclude = ("student", "description")  # keep student identity & free text out of the admin list/detail


for model in (ComplaintStatusHistory, EscalationAuditLog, PenaltyAuditLog, ScoreAlertLog):
    admin.site.register(model, ReadOnlyAdmin)

admin.site.register(ComplaintAttachment, ReadOnlyAdmin)
