import apps.complaints.storage
import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ComplaintCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(help_text='Stable id used by the client, e.g. mess-hygiene', max_length=80, unique=True)),
                ('domain', models.CharField(choices=[('MESS', 'Mess (Combined Boys & Girls)'), ('HOSTEL_BOYS', 'Hostel (Boys)'), ('HOSTEL_GIRLS', 'Hostel (Girls)'), ('SPORTS_BOYS', 'Sports (Boys)'), ('SPORTS_GIRLS', 'Sports (Girls)'), ('OTHERS', 'General Secretary')], db_index=True, max_length=30)),
                ('name', models.CharField(max_length=100)),
                ('sub_option', models.CharField(blank=True, max_length=100, null=True)),
                ('sla_days', models.PositiveIntegerField(help_text='Resolution deadline in days')),
                ('assigned_role', models.CharField(help_text='Level 1 secretary role handling this category', max_length=32)),
                ('escalation_role', models.CharField(help_text='Role whose registry email receives escalations (resolved from the official registry)', max_length=32)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'verbose_name': 'Complaint Category',
                'verbose_name_plural': 'Complaint Categories',
                'ordering': ['domain', 'name', 'sub_option'],
                'unique_together': {('domain', 'name', 'sub_option')},
            },
        ),
        migrations.CreateModel(
            name='Complaint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tracking_id', models.CharField(editable=False, max_length=50, unique=True)),
                ('request_group', models.UUIDField(db_index=True, default=uuid.uuid4, help_text='Client-supplied idempotency key; shared by complaints sent to several secretaries at once')),
                ('sla_days_snapshot', models.PositiveIntegerField(help_text='SLA in force when the complaint was filed')),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(max_length=5000)),
                ('location_code', models.CharField(blank=True, max_length=100, null=True)),
                ('is_confidential', models.BooleanField(default=False)),
                ('status', models.CharField(choices=[('PENDING', 'Pending'), ('IN_PROGRESS', 'In Progress'), ('RESOLVED', 'Resolved')], db_index=True, default='PENDING', max_length=20)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('deadline', models.DateTimeField(db_index=True, editable=False)),
                ('first_resolved_at', models.DateTimeField(blank=True, null=True)),
                ('last_resolved_at', models.DateTimeField(blank=True, null=True)),
                ('is_reopened', models.BooleanField(default=False)),
                ('reopened_count', models.PositiveIntegerField(default=0)),
                ('sla_breached', models.BooleanField(db_index=True, default=False)),
                ('escalated_to_level_2', models.BooleanField(db_index=True, default=False)),
                ('escalated_at', models.DateTimeField(blank=True, null=True)),
                ('escalation_attempts', models.PositiveSmallIntegerField(default=0)),
                ('penalty_decision', models.CharField(choices=[('PENDING_REVIEW', 'Pending Administrative Review'), ('VERIFIED_APPLIED', 'Verified & Penalty Applied'), ('DISMISSED', 'Dismissed')], db_index=True, default='PENDING_REVIEW', max_length=20)),
                ('penalty_points_amount', models.PositiveIntegerField(default=0)),
                ('penalty_verified_at', models.DateTimeField(blank=True, null=True)),
                ('penalty_reason', models.TextField(blank=True, null=True)),
                ('resolution_remarks', models.TextField(blank=True, null=True)),
                ('assigned_secretary', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_complaints', to=settings.AUTH_USER_MODEL)),
                ('category', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='complaints', to='complaints.complaintcategory')),
                ('penalty_verified_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='verified_penalties', to=settings.AUTH_USER_MODEL)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='submitted_complaints', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ComplaintStatusHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('previous_status', models.CharField(max_length=20)),
                ('new_status', models.CharField(max_length=20)),
                ('remarks', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('changed_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
                ('complaint', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='status_history', to='complaints.complaint')),
            ],
            options={
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.CreateModel(
            name='EscalationAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('recipient_role', models.CharField(max_length=32)),
                ('recipient_email', models.EmailField(blank=True, default='', max_length=254)),
                ('attempted_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('delivered', models.BooleanField(default=False)),
                ('retry_count', models.PositiveIntegerField(default=0)),
                ('triggered_by', models.CharField(default='system', max_length=254)),
                ('error_message', models.TextField(blank=True, null=True)),
                ('complaint', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='escalation_logs', to='complaints.complaint')),
            ],
            options={
                'ordering': ['-attempted_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PenaltyAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('APPLIED', 'Applied'), ('DISMISSED', 'Dismissed'), ('REVERSED', 'Reversed')], max_length=12)),
                ('points', models.IntegerField(default=0)),
                ('secretary_score_after', models.IntegerField(blank=True, null=True)),
                ('reason', models.TextField()),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('actor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('complaint', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='penalty_audit', to='complaints.complaint')),
                ('secretary', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.CreateModel(
            name='ScoreAlertLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('score', models.IntegerField()),
                ('recipient_email', models.EmailField(blank=True, default='', max_length=254)),
                ('delivered', models.BooleanField(db_index=True, default=False)),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('last_error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('last_attempt_at', models.DateTimeField(blank=True, null=True)),
                ('secretary', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ComplaintAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(storage=apps.complaints.storage.private_evidence_storage, upload_to='evidence/%Y/%m/')),
                ('original_filename', models.CharField(max_length=255)),
                ('content_type', models.CharField(max_length=100)),
                ('file_size_bytes', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('complaint', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='complaints.complaint')),
                ('uploader', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='uploaded_attachments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['created_at', 'id'],
            },
        ),
    ]
