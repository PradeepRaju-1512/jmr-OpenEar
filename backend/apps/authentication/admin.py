from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import OfficialAssignment, User


@admin.register(OfficialAssignment)
class OfficialAssignmentAdmin(admin.ModelAdmin):
    list_display = ("email", "display_name", "primary_role", "domains", "term_label", "is_active", "updated_at")
    list_filter = ("is_active", "primary_role")
    search_fields = ("email", "display_name")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "roll_number", "role", "gender", "negative_points", "is_active")
    list_filter = ("role", "gender", "is_active")
    search_fields = ("email", "roll_number", "first_name", "last_name")

    def has_add_permission(self, request):
        return False  # accounts are created by Google sign-in (admins via `createsuperuser`)
    readonly_fields = ("role", "assigned_roles", "domain_assignments", "google_oauth_sub", "negative_points", "last_login", "date_joined")
    fieldsets = (
        (None, {"fields": ("email", "username", "password")}),
        ("Profile", {"fields": ("first_name", "last_name", "roll_number", "gender", "phone_number", "room_or_flat")}),
        ("Registry-managed (read only)", {"fields": ("role", "assigned_roles", "domain_assignments", "negative_points", "google_oauth_sub")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
