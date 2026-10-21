from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .registry import sync_user_with_registry


class ExpiringTokenAuthentication(TokenAuthentication):
    """`Authorization: Bearer <token>` with server-side expiry and live role synchronisation."""

    keyword = "Bearer"

    def authenticate_credentials(self, key):
        model = self.get_model()
        try:
            token = model.objects.select_related("user").get(key=key)
        except model.DoesNotExist:
            raise AuthenticationFailed("Invalid token.")

        user = token.user
        if not user.is_active:
            raise AuthenticationFailed("Account disabled.")
        if timezone.now() - token.created > timedelta(hours=settings.AUTH_TOKEN_TTL_HOURS):
            token.delete()
            raise AuthenticationFailed("Session expired. Please sign in again.")

        user = sync_user_with_registry(user)
        return (user, token)
