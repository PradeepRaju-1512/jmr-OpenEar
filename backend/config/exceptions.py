"""Normalises every API error to {"error": "<message>"} which is what the React client reads."""

from rest_framework.response import Response
from rest_framework.views import exception_handler


def _flatten(detail) -> str:
    if isinstance(detail, dict):
        parts = []
        for key, value in detail.items():
            text = _flatten(value)
            parts.append(text if key in {"detail", "non_field_errors", "error"} else f"{key}: {text}")
        return " ".join(parts)
    if isinstance(detail, (list, tuple)):
        return " ".join(_flatten(item) for item in detail)
    return str(detail)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    message = _flatten(response.data) or "Request failed."
    headers = {k: v for k, v in response.items() if k.lower() in {"www-authenticate", "retry-after"}}
    return Response({"error": message}, status=response.status_code, headers=headers)
