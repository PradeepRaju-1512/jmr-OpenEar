"""Celery application. Run a worker AND a beat process in production."""

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("openear")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "scan-overdue-sla-deadlines": {
        "task": "apps.complaints.tasks.check_overdue_complaints_and_escalate",
        "schedule": crontab(minute="*/15"),
    },
}
