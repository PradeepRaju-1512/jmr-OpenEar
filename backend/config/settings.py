"""
OpenEar - IIIT Tiruchirappalli Grievance & Redressal Platform
Django settings. Secrets and deployment-specific values come from the environment.
"""

import os
import sys
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

TESTING = "test" in sys.argv


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        raise ImproperlyConfigured(f"{name} must be an integer.")


# --------------------------------------------------------------------------
# Core
# --------------------------------------------------------------------------
DEBUG = env_bool("DEBUG", False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG or TESTING:
        SECRET_KEY = "dev-only-insecure-key-never-use-in-production"
    else:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY is required when DEBUG is off. "
            "Generate one with: python -c \"from django.core.management.utils import get_random_secret_key as g; print(g())\""
        )

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

AUTH_USER_MODEL = "authentication.User"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "apps.authentication.apps.AuthenticationConfig",
    "apps.complaints.apps.ComplaintsConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --------------------------------------------------------------------------
# Database (PostgreSQL in production via DATABASE_URL, SQLite for local dev)
# --------------------------------------------------------------------------
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
        conn_health_checks=True,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Evidence photos live OUTSIDE any publicly served directory. There is deliberately
# no MEDIA_URL: files are only reachable through the authenticated download endpoint.
PRIVATE_MEDIA_ROOT = Path(os.environ.get("PRIVATE_MEDIA_ROOT", BASE_DIR / "private_media"))

# --------------------------------------------------------------------------
# Django REST Framework  (Bearer token only; no cookie auth, so no CSRF surface)
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.authentication.authentication.ExpiringTokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PAGINATION_CLASS": None,
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/hour",
        "user": "1200/hour",
        "login": "30/hour",
    },
}

# --------------------------------------------------------------------------
# CORS / CSRF / transport security
# --------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
)
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "")

if not DEBUG and not TESTING:
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    if env_bool("BEHIND_TLS_PROXY", False):
        SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# --------------------------------------------------------------------------
# Celery / Redis
# --------------------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60

# --------------------------------------------------------------------------
# Email (real delivery is mandatory outside DEBUG)
# --------------------------------------------------------------------------
_default_email_backend = (
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", _default_email_backend)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = env_int("EMAIL_PORT", 587)
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_TIMEOUT = 20
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "OpenEar IIITT <no-reply@iiitt.ac.in>")

if not DEBUG and not TESTING:
    if "console" in EMAIL_BACKEND or "locmem" in EMAIL_BACKEND or "dummy" in EMAIL_BACKEND:
        raise ImproperlyConfigured(
            "A real EMAIL_BACKEND (SMTP) is required when DEBUG is off, otherwise escalations "
            "would be recorded as delivered without any email being sent."
        )
    if "smtp" in EMAIL_BACKEND and not EMAIL_HOST:
        raise ImproperlyConfigured("EMAIL_HOST is required for the SMTP email backend.")

# --------------------------------------------------------------------------
# Google sign-in
# --------------------------------------------------------------------------
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
ALLOWED_EMAIL_DOMAIN = os.environ.get("ALLOWED_EMAIL_DOMAIN", "iiitt.ac.in").lower()
# Require Google's hosted-domain ("hd") claim to equal the institute domain.
GOOGLE_REQUIRE_HOSTED_DOMAIN = env_bool("GOOGLE_REQUIRE_HOSTED_DOMAIN", True)
AUTH_TOKEN_TTL_HOURS = env_int("AUTH_TOKEN_TTL_HOURS", 24)

# --------------------------------------------------------------------------
# OpenEar business rules
# --------------------------------------------------------------------------
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")

# Emails that always receive the ADMIN role (penalty verification, manual scans).
# Everyone else is assigned from the OfficialAssignment registry (editable in Django admin).
OPENEAR_ADMIN_EMAILS = [e.lower() for e in env_list("OPENEAR_ADMIN_EMAILS", "")]

# Escalation recipient for General Secretary complaints (there is no Registrar tier).
# Falls back to the ADMIN accounts when empty.
GENERAL_ESCALATION_EMAIL = os.environ.get("GENERAL_ESCALATION_EMAIL", "").strip().lower()

# Earlier requirement: the General Secretary section is for boys only. Set to False to open it up.
GENERAL_SECRETARY_BOYS_ONLY = env_bool("GENERAL_SECRETARY_BOYS_ONLY", True)

# If True, Level 1 secretaries get no evidence photos at all on confidential complaints.
CONFIDENTIAL_EVIDENCE_HIDDEN_FROM_SECRETARIES = env_bool("CONFIDENTIAL_EVIDENCE_HIDDEN_FROM_SECRETARIES", False)

SCORE_ALERT_THRESHOLD = env_int("SCORE_ALERT_THRESHOLD", 10)  # notify Mess Warden when score EXCEEDS this
MAX_PENALTY_POINTS = env_int("MAX_PENALTY_POINTS", 5)
ESCALATION_MAX_ATTEMPTS = env_int("ESCALATION_MAX_ATTEMPTS", 5)
MAX_COMPLAINT_TARGETS = env_int("MAX_COMPLAINT_TARGETS", 3)
REOPEN_WINDOW_DAYS = env_int("REOPEN_WINDOW_DAYS", 14)
MAX_REOPENS = env_int("MAX_REOPENS", 3)

MAX_ATTACHMENTS_PER_COMPLAINT = 5
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024  # non-file request body; uploaded files are checked separately

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}
