"""
Hand-written camelCase serialisers matching the React types.
All confidentiality masking happens HERE, on the server, for every field that could reveal identity.
"""

from django.conf import settings

from .services import is_masked_for

MASKED_ID = "ANONYMOUS-PROTECTED"


def _iso(value):
    return value.isoformat() if value else None


def serialize_category(cat) -> dict:
    return {
        "id": cat.code,
        "domain": cat.domain,
        "domainTitle": cat.get_domain_display(),
        "name": cat.name,
        "subOption": cat.sub_option or None,
        "slaDays": cat.sla_days,
        "assignedRole": cat.assigned_role,
        "escalationRole": cat.escalation_role,
    }


def _history(complaint, viewer, masked):
    events = []
    for ev in complaint.status_history.all():
        hide = masked and ev.changed_by_id == complaint.student_id
        events.append({
            "id": str(ev.id),
            "complaintId": str(complaint.id),
            "previousStatus": ev.previous_status,
            "newStatus": ev.new_status,
            "changedByUserId": MASKED_ID if hide else str(ev.changed_by_id),
            "changedByName": "Anonymous Student (Confidential)" if hide else (ev.changed_by.get_full_name() or ev.changed_by.roll_number),
            "changedByRole": "Student" if hide else ev.changed_by.role_title,
            "remarks": ev.remarks or "",
            "timestamp": _iso(ev.created_at),
        })
    return events


def _attachments(complaint, viewer, masked):
    if masked and viewer.is_level_1 and settings.CONFIDENTIAL_EVIDENCE_HIDDEN_FROM_SECRETARIES:
        return []
    result = []
    for index, att in enumerate(complaint.attachments.all(), start=1):
        is_student_upload = att.uploader_id == complaint.student_id
        result.append({
            "id": str(att.id),
            "complaintId": str(complaint.id),
            "uploaderId": MASKED_ID if (masked and is_student_upload) else str(att.uploader_id),
            "originalFilename": f"evidence-{index}" if masked else att.original_filename,
            "contentType": att.content_type,
            "fileSizeBytes": att.file_size_bytes,
            "storageKey": "",  # never expose server storage paths
            "createdAt": _iso(att.created_at),
        })
    return result


def serialize_complaint(complaint, viewer) -> dict:
    masked = is_masked_for(viewer, complaint)
    student = complaint.student
    is_owner = complaint.student_id == viewer.id
    sees_ops = viewer.is_admin or viewer.is_level_2  # escalation recipients & penalty internals
    sees_penalty = sees_ops or (viewer.is_level_1 and complaint.assigned_secretary_id == viewer.id)

    if masked:
        identity = {
            "studentId": MASKED_ID,
            "studentName": "Anonymous Student (Confidential)",
            "studentRollNo": "PROTECTED-ROLL-NO",
            "studentEmail": "confidential@iiitt.ac.in",
        }
    else:
        identity = {
            "studentId": str(student.id),
            "studentName": student.get_full_name() or student.roll_number,
            "studentRollNo": student.roll_number,
            "studentEmail": student.email,
        }

    category = complaint.category
    secretary = complaint.assigned_secretary
    return {
        "id": str(complaint.id),
        "trackingId": complaint.tracking_id,
        **identity,
        "isAnonymized": masked,
        "confidentialUnmasked": bool(complaint.is_confidential and not masked and not is_owner),
        "domain": category.domain,
        "categoryName": category.name,
        "subOption": category.sub_option or None,
        "slaDaysSnapshot": complaint.sla_days_snapshot,
        "slaDays": complaint.sla_days_snapshot,
        "title": complaint.title,
        "description": complaint.description,
        "locationCode": complaint.location_code,
        "isConfidential": complaint.is_confidential,
        "status": complaint.status,
        "createdAt": _iso(complaint.created_at),
        "deadline": _iso(complaint.deadline),
        "firstResolvedAt": _iso(complaint.first_resolved_at),
        "lastResolvedAt": _iso(complaint.last_resolved_at),
        "isReopened": complaint.is_reopened,
        "reopenedCount": complaint.reopened_count,
        "assignedSecretaryName": (secretary.get_full_name() or secretary.roll_number) if secretary else None,
        "assignedRole": category.assigned_role,
        "slaBreached": complaint.sla_breached if sees_ops else False,
        "escalatedToLevel2": complaint.escalated_to_level_2,
        "escalatedAt": _iso(complaint.escalated_at),
        "escalationHistory": [
            {
                "attemptedAt": _iso(log.attempted_at),
                "recipientRole": log.recipient_role,
                "recipientEmail": log.recipient_email,
                "delivered": log.delivered,
                "retryCount": log.retry_count,
                "triggeredBy": log.triggered_by,
            }
            for log in complaint.escalation_logs.all()
        ] if sees_ops else [],
        "penaltyDecision": complaint.penalty_decision if sees_penalty else "PENDING_REVIEW",
        "penaltyPointsAmount": complaint.penalty_points_amount if sees_penalty else 0,
        "penaltyVerifiedByAdmin": (
            (complaint.penalty_verified_by.get_full_name() or complaint.penalty_verified_by.email)
            if sees_penalty and complaint.penalty_verified_by else None
        ),
        "penaltyVerifiedAt": _iso(complaint.penalty_verified_at) if sees_penalty else None,
        "penaltyReason": complaint.penalty_reason if sees_penalty else None,
        "resolutionRemarks": complaint.resolution_remarks,
        "statusHistory": _history(complaint, viewer, masked),
        "attachments": _attachments(complaint, viewer, masked),
    }
