"""OpenEar URL configuration - Django is the single authoritative API."""

from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.authentication.views import (
    CurrentUserView,
    GoogleOAuthVerifyView,
    LogoutView,
    ProfileView,
    UserListView,
)
from apps.complaints.views import (
    CategoryListView,
    ComplaintViewSet,
    EscalationScanView,
)

router = DefaultRouter()
router.register(r"complaints", ComplaintViewSet, basename="complaint")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/google-verify/", GoogleOAuthVerifyView.as_view(), name="google-verify"),
    path("api/v1/auth/me/", CurrentUserView.as_view(), name="current-user"),
    path("api/v1/auth/profile/", ProfileView.as_view(), name="profile"),
    path("api/v1/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/v1/users/", UserListView.as_view(), name="users"),
    path("api/v1/categories/", CategoryListView.as_view(), name="categories"),
    path("api/v1/escalations/trigger-scan/", EscalationScanView.as_view(), name="escalation-scan"),
    path("api/v1/", include(router.urls)),
]
