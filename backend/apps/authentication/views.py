"""OpenEar - authentication API. Only a cryptographically verified Google ID token can log in."""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from google.auth.exceptions import TransportError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import permissions, status, views
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .models import User
from .registry import sync_user_with_registry
from .serializers import serialize_user

logger = logging.getLogger(__name__)


def _fail(message: str, code: int):
    return Response({"error": message}, status=code)


class GoogleOAuthVerifyView(views.APIView):
    """
    POST {"credential": "<Google ID token>"}

    Verifies signature, issuer, audience, expiry, verified email, institute domain and
    hosted-domain claim. There is NO fallback: a missing token or missing server
    configuration always means login is refused.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            logger.error("GOOGLE_OAUTH_CLIENT_ID is not configured; refusing all logins.")
            return _fail("Sign-in is not configured on the server.", status.HTTP_503_SERVICE_UNAVAILABLE)

        credential = request.data.get("credential") or request.data.get("id_token")
        if not isinstance(credential, str) or not credential.strip() or len(credential) > 5000:
            return _fail("A Google credential is required.", status.HTTP_400_BAD_REQUEST)

        try:
            info = id_token.verify_oauth2_token(
                credential.strip(), google_requests.Request(), settings.GOOGLE_OAUTH_CLIENT_ID
            )
        except TransportError:
            logger.exception("Could not reach Google to verify the token")
            return _fail("Could not verify the Google credential right now. Try again.", status.HTTP_503_SERVICE_UNAVAILABLE)
        except ValueError:
            return _fail("Invalid or expired Google credential.", status.HTTP_401_UNAUTHORIZED)
        except Exception:  # noqa: BLE001 - any other verification failure is a refusal, never a pass
            logger.exception("Unexpected error while verifying Google credential")
            return _fail("Invalid Google credential.", status.HTTP_401_UNAUTHORIZED)

        email = str(info.get("email") or "").strip().lower()
        sub = str(info.get("sub") or "")
        if not email or not sub or info.get("email_verified") is not True:
            return _fail("Google did not return a verified email address.", status.HTTP_403_FORBIDDEN)

        domain = settings.ALLOWED_EMAIL_DOMAIN
        if not email.endswith("@" + domain):
            return _fail(f"Only @{domain} accounts are allowed.", status.HTTP_403_FORBIDDEN)
        if settings.GOOGLE_REQUIRE_HOSTED_DOMAIN and str(info.get("hd") or "").lower() != domain:
            return _fail(f"Only @{domain} Google Workspace accounts are allowed.", status.HTTP_403_FORBIDDEN)

        try:
            with transaction.atomic():
                user = User.objects.select_for_update().filter(email=email).first()
                created = user is None
                if created:
                    user = User.objects.create_user(
                        email=email,
                        first_name=str(info.get("given_name") or "")[:150],
                        last_name=str(info.get("family_name") or "")[:150],
                        google_oauth_sub=sub,
                        avatar_url=str(info.get("picture") or "")[:500] or None,
                    )
                else:
                    if user.google_oauth_sub and user.google_oauth_sub != sub:
                        logger.warning("Google subject mismatch for %s", email)
                        return _fail("This account is linked to a different Google identity.", status.HTTP_403_FORBIDDEN)
                    if not user.is_active:
                        return _fail("This account has been disabled.", status.HTTP_403_FORBIDDEN)
                    fields = []
                    if not user.google_oauth_sub:
                        user.google_oauth_sub = sub
                        fields.append("google_oauth_sub")
                    if info.get("given_name") and not user.first_name:
                        user.first_name = str(info["given_name"])[:150]
                        fields.append("first_name")
                    if info.get("family_name") and not user.last_name:
                        user.last_name = str(info["family_name"])[:150]
                        fields.append("last_name")
                    if fields:
                        user.save(update_fields=fields)
                user = sync_user_with_registry(user)
                Token.objects.filter(user=user).delete()  # rotate: old sessions end on new login
                token = Token.objects.create(user=user)
        except IntegrityError:
            logger.exception("Race while creating user %s", email)
            return _fail("Could not complete sign-in. Please try again.", status.HTTP_409_CONFLICT)

        expires_at = token.created + timedelta(hours=settings.AUTH_TOKEN_TTL_HOURS)
        return Response({"token": token.key, "expiresAt": expires_at.isoformat(), "user": serialize_user(user)})


class CurrentUserView(views.APIView):
    def get(self, request):
        return Response(serialize_user(request.user))


class LogoutView(views.APIView):
    def post(self, request):
        if request.auth is not None:
            request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileView(views.APIView):
    """One-time self-declaration of gender (needed for boys'/girls' hostel & sports routing)."""

    def post(self, request):
        user = request.user
        if user.gender:
            return _fail("Your profile is already set. Contact an administrator to change it.", status.HTTP_409_CONFLICT)
        gender = str(request.data.get("gender") or "").upper()
        if gender not in {"M", "F", "O"}:
            return _fail("Gender must be one of M, F, O.", status.HTTP_400_BAD_REQUEST)
        user.gender = gender
        user.save(update_fields=["gender"])
        return Response(serialize_user(user))


class UserListView(views.APIView):
    """
    Admins: every office-bearer with penalty scores.
    Everyone else: the public directory of office-bearers (no scores except their own).
    Student accounts are never listed.
    """

    def get(self, request):
        officials = User.objects.exclude(role=User.Role.STUDENT).filter(is_active=True).order_by("email")
        viewer = request.user
        payload = [
            serialize_user(u, include_points=viewer.is_admin or u.id == viewer.id) for u in officials
        ]
        return Response(payload)
