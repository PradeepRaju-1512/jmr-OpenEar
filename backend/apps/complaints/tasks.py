import logging

from celery import shared_task

from .services import run_escalation_scan

logger = logging.getLogger(__name__)


@shared_task(name="apps.complaints.tasks.check_overdue_complaints_and_escalate")
def check_overdue_complaints_and_escalate():
    """Marks breaches and emails escalations. Failures are isolated per complaint and retried by the next run."""
    summary = run_escalation_scan(triggered_by="system")
    logger.info("Escalation scan: %s", summary)
    return summary
