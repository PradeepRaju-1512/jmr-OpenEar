# OpenEar - IIITT Grievance & Redressal Platform

React + TypeScript (Vite) frontend and a **Django REST** backend. Django is the only API: it verifies Google
sign-in, assigns roles from the official registry, stores complaints and evidence, tracks deadlines and sends
escalation emails.

## Sections and deadlines

| Section | Categories | Deadline |
| --- | --- | --- |
| Mess | Hygiene, Food Quality, Mess Maintenance (3 days); Utensils and Related Items (5 days) | 3-5 days |
| Hostel (boys / girls) | Wifi, Drinking water, Water, Room cleaning, Washrooms, Washing machines, Custom | 5 days |
| Sports (boys / girls) | Indoor: Table tennis, Chess, Carroms, Badminton. Outdoor: Volleyball, Football, Cricket, Kho kho, Kabaddi | 7 days (assumed, confirm) |
| General Secretary | Free text | 5 days (assumed, confirm); boys-only by default (`GENERAL_SECRETARY_BOYS_ONLY`) |

A student may address up to three secretaries in one submission; each gets its own copy, tracking ID and deadline.
Mess complaints go to the secretary matching the student's gender. The Mess Warden is an escalation authority,
never a complaint target. Penalties apply to the assigned secretary only; when a secretary's verified negative
score goes **above 10** the Mess Warden is emailed.

## Setup

### 1. Google sign-in (required: without it nobody can log in)
In Google Cloud Console create an **OAuth client ID (Web application)**. Add `http://localhost:3000` (and your
production URL) as an authorised JavaScript origin. Put the client ID in **both** `.env.local`
(`VITE_GOOGLE_CLIENT_ID`) and `backend/.env` (`GOOGLE_OAUTH_CLIENT_ID`).

### 2. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in DJANGO_SECRET_KEY, GOOGLE_OAUTH_CLIENT_ID, OPENEAR_ADMIN_EMAILS
python manage.py migrate
python manage.py seed_openear # categories + the 2026-27 officials
python manage.py test         # runs with DEBUG=True in .env
python manage.py runserver
```
Escalations: run `celery -A config worker -l info` **and** `celery -A config beat -l info` (needs Redis).
Outside `DEBUG`, the server refuses to start without a real SMTP configuration.

### 3. Frontend
```bash
cp .env.example .env.local    # set VITE_GOOGLE_CLIENT_ID
npm install
npm run dev                   # http://localhost:3000, /api is proxied to Django
npm run lint && npm run build
```

## Changing officials every year
Officials live in **Django admin > Official assignments** (`/admin/`, create the first admin with
`python manage.py createsuperuser`). Edit or deactivate a row and permissions change on that person's very next
request; a former official is demoted to student immediately and their open complaints are unassigned. Emails in
`OPENEAR_ADMIN_EMAILS` get the ADMIN role (penalty verification, manual scan).

The seeded Girls' Sports Secretary address `231167@iiitt.ac.in` is an assumption; correct it in the admin if needed.

## Security notes
- Login only accepts a Google ID token verified server-side (signature, audience, issuer, expiry, verified email,
  `@iiitt.ac.in` and the hosted-domain claim). There is no email-only or demo login.
- Roles are never read from the client; they are re-derived from the registry on every request.
- Evidence photos are re-encoded (EXIF/GPS removed), stored outside any public path and only served to people
  allowed to see that complaint. Confidential complaints hide the student's identity from secretaries everywhere
  (including history and filenames). Set `CONFIDENTIAL_EVIDENCE_HIDDEN_FROM_SECRETARIES=True` to hide photos too.
