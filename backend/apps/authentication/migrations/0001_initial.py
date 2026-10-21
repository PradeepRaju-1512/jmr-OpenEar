import django.contrib.auth.validators
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('username', models.CharField(error_messages={'unique': 'A user with that username already exists.'}, help_text='Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.', max_length=150, unique=True, validators=[django.contrib.auth.validators.UnicodeUsernameValidator()], verbose_name='username')),
                ('first_name', models.CharField(blank=True, max_length=150, verbose_name='first name')),
                ('last_name', models.CharField(blank=True, max_length=150, verbose_name='last name')),
                ('is_staff', models.BooleanField(default=False, help_text='Designates whether the user can log into this admin site.', verbose_name='staff status')),
                ('is_active', models.BooleanField(default=True, help_text='Designates whether this user should be treated as active. Unselect this instead of deleting accounts.', verbose_name='active')),
                ('date_joined', models.DateTimeField(default=django.utils.timezone.now, verbose_name='date joined')),
                ('email', models.EmailField(max_length=254, unique=True, verbose_name='IIITT Email Address')),
                ('roll_number', models.CharField(db_index=True, max_length=30, verbose_name='Student Roll Number')),
                ('role', models.CharField(choices=[('STUDENT', 'Student'), ('SEC_MESS', 'Mess Secretary'), ('SEC_HOSTEL_BOYS', 'Boys Hostel Secretary'), ('SEC_HOSTEL_GIRLS', 'Girls Hostel Secretary'), ('SEC_SPORTS_BOYS', 'Boys Sports Secretary'), ('SEC_SPORTS_GIRLS', 'Girls Sports Secretary'), ('SEC_GENERAL', 'General Secretary'), ('WARDEN_HOSTEL_BOYS', 'Boys Hostel Warden'), ('WARDEN_HOSTEL_GIRLS', 'Girls Hostel Warden'), ('WARDEN_MESS', 'Mess Warden'), ('INCHARGE_SPORTS', 'Sports Incharge'), ('ADMIN', 'System Administrator')], db_index=True, default='STUDENT', max_length=32)),
                ('gender', models.CharField(blank=True, choices=[('M', 'Male'), ('F', 'Female'), ('O', 'Other')], max_length=2, null=True)),
                ('phone_number', models.CharField(blank=True, max_length=15, null=True)),
                ('room_or_flat', models.CharField(blank=True, help_text='e.g. Block A Room 204', max_length=50, null=True)),
                ('domain_assignments', models.JSONField(blank=True, default=list, help_text='Synced from the registry; do not edit by hand')),
                ('assigned_roles', models.JSONField(blank=True, default=list, help_text='Synced from the registry; do not edit by hand')),
                ('negative_points', models.IntegerField(default=0, help_text='Verified SLA breach penalty points')),
                ('google_oauth_sub', models.CharField(blank=True, max_length=128, null=True, unique=True)),
                ('avatar_url', models.URLField(blank=True, max_length=500, null=True)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'verbose_name': 'IIITT User',
                'verbose_name_plural': 'IIITT Users',
                'ordering': ['email'],
            },
        ),
        migrations.CreateModel(
            name='OfficialAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('display_name', models.CharField(max_length=120)),
                ('primary_role', models.CharField(choices=[('SEC_MESS', 'Mess Secretary'), ('SEC_HOSTEL_BOYS', 'Boys Hostel Secretary'), ('SEC_HOSTEL_GIRLS', 'Girls Hostel Secretary'), ('SEC_SPORTS_BOYS', 'Boys Sports Secretary'), ('SEC_SPORTS_GIRLS', 'Girls Sports Secretary'), ('SEC_GENERAL', 'General Secretary'), ('WARDEN_HOSTEL_BOYS', 'Boys Hostel Warden'), ('WARDEN_HOSTEL_GIRLS', 'Girls Hostel Warden'), ('WARDEN_MESS', 'Mess Warden'), ('INCHARGE_SPORTS', 'Sports Incharge'), ('ADMIN', 'System Administrator')], max_length=32)),
                ('roles', models.JSONField(default=list, help_text='List of role codes, e.g. ["SEC_MESS", "SEC_HOSTEL_BOYS"]')),
                ('domains', models.JSONField(default=list, help_text='List of domains, e.g. ["MESS", "HOSTEL_BOYS"]')),
                ('gender', models.CharField(blank=True, choices=[('M', 'Male'), ('F', 'Female')], default='', max_length=1)),
                ('is_active', models.BooleanField(default=True)),
                ('term_label', models.CharField(blank=True, default='', help_text='e.g. "2026-27"', max_length=40)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Official assignment',
                'ordering': ['primary_role', 'email'],
            },
        ),
    ]
