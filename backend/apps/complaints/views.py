"""OpenEar - complaint API."""

from django.http import FileResponse
from rest_framework import mixins, permissions, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.authentication.serializers import serialize_user
from apps.authentication.models import User

from . import services
from .models import ComplaintCategory
from .serializers import serialize_category, serialize_complaint


class CategoryListView(views.APIView):
    def get(self, request):
        cats = ComplaintCategory.objects.filter(is_active=True)
        return Response([serialize_category(c) for c in cats])


class ComplaintViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Read + create only. There is deliberately NO generic update/delete: every mutation goes
    through an explicit, validated workflow action below.
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_queryset(self):
        return services.visible_complaints_for(self.request.user)

    def list(self, request):
        return Response([serialize_complaint(c, request.user) for c in self.get_queryset()])

    def retrieve(self, request, pk=None):
        complaint = self.get_queryset().filter(pk=pk).first() if str(pk).isdigit() else None
        if complaint is None:
            raise NotFound("Grievance not found.")
        return Response(serialize_complaint(complaint, request.user))

    def create(self, request):
        data = request.data
        codes = data.get("categoryIds")
        if codes is None and data.get("categoryId"):
            codes = [data.get("categoryId")]
        created, is_new = services.create_complaints(
            request.user,
            category_codes=codes,
            title=data.get("title"),
            description=data.get("description"),
            location_code=data.get("locationCode"),
            is_confidential=data.get("isConfidential") in (True, "true", "True", 1, "1"),
            request_id=data.get("requestId"),
        )
        fresh = list(self.get_queryset().filter(pk__in=[c.pk for c in created]))
        return Response(
            [serialize_complaint(c, request.user) for c in fresh],
            status=status.HTTP_201_CREATED if is_new else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        complaint = services.transition_status(pk, request.user, request.data.get("status"), request.data.get("remarks"))
        return Response(self._one(request, complaint.pk))

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen(self, request, pk=None):
        complaint = services.reopen_complaint(pk, request.user, request.data.get("remarks"))
        return Response(self._one(request, complaint.pk))

    @action(detail=True, methods=["post"], url_path="penalty")
    def penalty(self, request, pk=None):
        complaint = services.decide_penalty(
            pk, request.user, request.data.get("decision"), request.data.get("points"), request.data.get("reason")
        )
        officials = User.objects.exclude(role=User.Role.STUDENT).filter(is_active=True).order_by("email")
        return Response({
            "complaint": self._one(request, complaint.pk),
            "updatedUsers": [serialize_user(u, include_points=True) for u in officials],
        })

    @action(detail=True, methods=["post"], url_path="attachments", parser_classes=[MultiPartParser])
    def upload_attachments(self, request, pk=None):
        files = request.FILES.getlist("files")
        services.add_attachments(pk, request.user, files)
        return Response(self._one(request, pk), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path=r"attachments/(?P<attachment_id>\d+)")
    def download_attachment(self, request, pk=None, attachment_id=None):
        complaint = self.get_queryset().filter(pk=pk).first() if str(pk).isdigit() else None
        if complaint is None:
            raise NotFound("Not found.")
        visible = {a["id"] for a in serialize_complaint(complaint, request.user)["attachments"]}
        if attachment_id not in visible:
            raise NotFound("Not found.")
        attachment = complaint.attachments.filter(pk=attachment_id).first()
        if attachment is None:
            raise NotFound("Not found.")
        try:
            handle = attachment.file.open("rb")
        except FileNotFoundError:
            raise NotFound("The stored file is missing.")
        response = FileResponse(handle, content_type=attachment.content_type)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Disposition"] = "inline"
        return response

    def _one(self, request, pk):
        complaint = self.get_queryset().filter(pk=pk).first()
        if complaint is None:
            raise NotFound("Grievance not found.")
        return serialize_complaint(complaint, request.user)


class EscalationScanView(views.APIView):
    """Admin-only manual trigger. The same scan also runs every 15 minutes via Celery beat."""

    def post(self, request):
        if not request.user.is_admin:
            raise PermissionDenied("Only administrators can run the escalation scan.")
        return Response(services.run_escalation_scan(triggered_by=request.user.email))
