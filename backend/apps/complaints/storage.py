import os

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateEvidenceStorage(FileSystemStorage):
    """Reads PRIVATE_MEDIA_ROOT lazily (so tests can override it). Never exposes a URL."""

    @property
    def base_location(self):
        return str(settings.PRIVATE_MEDIA_ROOT)

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    def url(self, name):
        raise ValueError("Evidence files are private and have no public URL.")


def private_evidence_storage():
    """Callable storage (referenced from the migration)."""
    return PrivateEvidenceStorage()
