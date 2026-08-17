# DiningDealz

This is my first pass at building DiningDealz, a mobile-first app for finding happy hour spots, food deals, and other discounts in Ventura, Oxnard, and Camarillo, California.

I am building this project at an entry-level skill level, with some help from GitHub Copilot along the way. My goal is to learn by actually building a real app step by step instead of overcomplicating it too early.

## Project Goal

The main goal is to create a legit mobile app, not a website that later gets wrapped into a phone app.

The app is meant to help users find:

- restaurants
- fast food spots
- bars
- cafes
- shops
- attractions
- happy hour deals
- daily specials
- limited-time discounts

## URL Field Behavior

For business listing data, the backend treats `source_url` and `website_url` as different roles:

- `source_url`: official first-party website URL used by pull actions to fetch/update business details such as deals and hours
- `website_url`: public website URL shown and opened in the app business profile

When running admin pull actions (single-business pull or pull-all):

- enrichment tries to use `source_url` first when it is a supported first-party website URL
- if `source_url` is not usable, enrichment falls back to `website_url` when it is usable
- Yelp, social, directory, and other blocked URLs may remain as source links, but they are never fetched for enrichment
- imported values only fill whichever role is blank in the snapshot; they do not collapse both fields into one value

For the initial launch, I am keeping the scope small on purpose and only targeting these cities in the 805 area:

- Ventura
- Oxnard
- Camarillo

## Tech Stack

This is the stack I chose for the project:

- Expo 54 / React Native 0.81 / React 19 for the mobile app
- Django 6 + Django REST Framework for the backend
- Next.js for the website
- Vercel for hosting the website later
- Render for hosting the backend later
- Render Postgres for the production database later

Right now, the backend is the part that is furthest along because I wanted the mobile app to be built against real API endpoints instead of fake UI-only data.

That said, the mobile app is no longer just a placeholder. It now has a working browse experience, auth/profile flows, and business claim screens wired to the backend.

## What I Have Built So Far

### Backend Foundation

Current backend work includes:

- Django project setup inside the `backend` folder
- a `places` app for listings, claims, memberships, and account workflow
- Django admin setup so I can manage claims, memberships, deleted businesses, and snapshots through `/admin`
- API endpoints for health, places, place details, deals, login, signup, profile dashboard, and claim-related profile actions
- importer and service layers that normalize source records into mobile-friendly JSON
- local virtual environment and backend requirements file
- passing migrations and backend tests

### Mobile App Progress

The Expo / React Native app is now partially built and connected to the real backend.

Current mobile work includes:

- browse mode with both list and map views
- city filters and venue-type filters
- confirmed-deal, weekday, and verified-business filtering
- keyword search across names, venue types, cities, and addresses
- shared browse controls across list and map so the search container stays stable during mode changes
- animated list/map switching and profile-dashboard transitions
- Apple Maps-style light/dark map support on iOS with a smooth theme transition
- map result trays, selected-place preview cards, and animated marker rendering
- place detail cards with photos, deal sections, hours, phone numbers, and map previews
- login and account creation flows
- profile dashboard flow with animated transitions between auth, browse, and dashboard screens
- business claim flow with consolidated business results and per-location address selection before verification
- map marker rendering based on backend-provided or resolved coordinates
- native map boundary handling for built apps, with a JS fallback for Expo Go
- modularized screen-level mobile code so auth/profile/dashboard/detail views are no longer all inline in `mobile/App.tsx`

### Mobile Dev Network Modes

When running the mobile app against the local backend, you can now choose network mode:

- Wi-Fi adapter: `npm run start:wifi`
- Ethernet adapter (LAN cable): `npm run start:ethernet`
- Auto-detect either adapter: `npm start`

All commands should be run from `mobile/` after the backend is running with `python manage.py runserver 0.0.0.0:8000`.

### Current Backend Models

The backend currently includes data models for:

- `ListingSnapshot`
- `BusinessClaim`
- `BusinessMembership`

This lets the project store claim and ownership workflow data without keeping a long-lived restaurant/store catalog in the database.

Legacy catalog models for `Place`, `Deal`, `HappyHour`, and `ImportRun` have been removed from the active schema.

### Current API Direction

The backend now builds listing responses from source-backed records instead of serving a long-lived `Place` catalog out of the database.

That means the current direction is:

- pull configured listing data from curated and discovery-oriented sources
- normalize and group them at request time through the backend service layer
- expose them through API endpoints that the mobile app consumes directly
- keep durable business edits in `ListingSnapshot` while leaving raw discovery data source-backed

## Current Listing Pipeline

The listing APIs are built from source-backed records and normalized for the mobile app.

That currently includes:

- curated business source definitions in `backend/config/business_sources.py`
- discovery data stored in `backend/config/discovered_places.json`
- grouping and deduplication in `backend/places/services/source_listings.py`
- coordinate backfill for records that need geocode resolution before they can appear on the mobile map
- multi-location grouping so one business profile can expose multiple addresses inside the app
- address-quality merging so partial or duplicate records collapse into a better canonical location when possible

The current runtime goal is:

- keep `ListingSnapshot` as the durable source of truth for admin-edited business data
- treat `backend/config/discovered_places.json` as generated/cache/seed discovery data, not the long-term source of truth
- keep listings source-backed and normalized while durable business edits live in the database

In Postgres-backed deployments, the committed `backend/config/discovered_places.json` file is now treated as a seed file. If the runtime discovery file does not exist yet, the backend can bootstrap a runtime copy once. After that, normal discovery writes go to the runtime file instead of mutating the committed `config/` copy.

### Multi-Location Source Rule

If a business has multiple locations, I want it to show up in the app as one business profile with multiple locations inside that profile, not as separate business profiles.

Because of that, multi-location brands in [backend/config/settings.py](c:/dev/HappyHourApp/backend/config/settings.py) should be added with the `multi_location_business(profile_name, locations)` helper.

That helper automatically gives every location entry the same `profile_name` and shared slugified `profile_slug`, so future brands follow the same grouping pattern as Lure Fish House and Finney's Crafthouse.

## Current Project Structure

```text
HappyHourApp/
	backend/
		config/
		places/
		manage.py
		requirements.txt
	mobile/
	web/
```

## What Is Ready Right Now

Right now, these parts are working:

- backend project structure and admin workflow
- source-backed place list and place detail APIs
- deal aggregation and location grouping
- coordinate-aware map payloads for mobile browse
- business claim and membership workflow backed by `ListingSnapshot`
- async search in the List of Businesses admin page without full-page refreshes
- deleted-business admin controls for restore, hard delete, and suppression through `deleted_from_business_database`
- curated JSON catalog migration with verified business records and non-destructive admin refreshes
- Expo mobile browse UI with list and map modes
- mobile search, city filtering, venue filtering, and map/list UX polish
- mobile auth, profile dashboard, and business claim onboarding flow
- backend tests for the source listing pipeline, API endpoints, and importer behavior

## What Is Not Built Yet

These parts are not built yet:

- a completed polished mobile app release
- Next.js website UI
- production deployment
- expanded city coverage outside the first 805 launch area
- site-specific extraction rules for every business website I want to support reliably
- a finalized production cache strategy for source fetches and static listing coordinate resolution

## Render Deployment Note

The backend can be hosted on Render, but the current OCR setup has an important limitation on Render's standard non-Docker Python runtime.

- The Python package `pytesseract` is included in `backend/requirements.txt`, but it only talks to the external Tesseract binary.
- Standard Render services should be treated as managed runtimes without normal OS-level package installation during build.
- Because of that, this repo does not assume a standard Render deploy can install Tesseract with `apt-get` or a similar system package command.

What this means in practice:

- business-claim document scoring still works on Render without crashing
- PDF text extraction still works through `pypdf`
- duplicate-file detection and filename/text heuristics still work
- image OCR for scanned or photo-based uploads falls back gracefully if the Tesseract binary is unavailable

So if the backend is deployed to a standard Render service without a Tesseract-capable runtime, claim verification becomes partially OCR-assisted instead of fully OCR-assisted.

If a future Render deployment needs full image OCR, the backend runtime will need access to the `tesseract` executable. The remaining options are:

- switch the backend to a Docker-based Render deployment and install Tesseract there
- bundle a compiled Linux Tesseract binary with the app and point `pytesseract` to it
- move image OCR to an external OCR service

Until then, the current code safely degrades instead of breaking uploads or claim review.

## Automated Image Moderation

User-visible business profile photos, deal images, and business direct-message images are screened before they are stored or displayed. Production uses the local, MIT-licensed NudeNet 320n model bundled with the backend for automated exposed-nudity detection. Image bytes stay on the backend; no per-image moderation API is used.

The production backend should define these Render environment variables:

- `IMAGE_MODERATION_PROVIDER=local_nudenet`
- `IMAGE_MODERATION_BLOCK_SCORE_PERCENT=65`
- `IMAGE_MODERATION_FAIL_CLOSED=true`

The backend normalizes images, caches repeated results, rejects detections at or above the configured score, and refuses new image uploads if the local model cannot run. Local development defaults to moderation disabled so tests and offline work do not need to load the model.

This local detector is automated coverage for explicit nudity, not a guarantee that every harmful image category will be recognized. Text filtering, reporting, blocking, and support review remain the fallback for threats, hate, violence, scams, and false negatives. There is no separate moderation-provider bill, although image inference uses the backend service's CPU and memory.

## Monitoring

The backend already exposes a lightweight health endpoint for uptime checks:

- `GET /api/health/`
- expected response: `200` with `status: "ok"` when PostgreSQL and configured Redis are reachable
- dependency failures return `503` with dependency status fields but no connection strings or provider error details

Recommended monitoring setup:

- UptimeRobot: point it at the Render backend health URL, for example `https://your-render-service.onrender.com/api/health/`
- UptimeRobot notification processor: add a second five-minute HTTP monitor after deploying the preference migration. Point it at `https://your-render-service.onrender.com/api/internal/process-due-happy-hour-notifications/<secret>/` and set the same randomly generated value as Render's `HAPPY_HOUR_NOTIFICATION_SECRET` environment variable.
- Set `HAPPY_HOUR_NOTIFICATION_WINDOW_MINUTES=10` unless a different stale-alert window is intentionally needed. The processor re-reads current deal data, sends eligible happy-hour pushes once, and skips occurrences older than the configured window.
- All-day happy-hour windows use the matching location's operating-hours opening time as their notification start; legacy records with no operating-hours start fall back to their stored happy-hour start time.
- Keep the notification processor monitor separate from `/api/health/`; the health endpoint stays read-only and diagnostic.
- Backend Sentry: set `SENTRY_DSN` in Render to capture Django runtime errors
- Frontend Sentry: set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` in Vercel to capture browser and Next.js server errors

## HTTPS And HSTS

The backend already supports HTTPS redirect and secure cookies on Render. HSTS is also env-driven now, but it defaults to off until the production domain is final.

Recommended Render env vars after HTTPS is confirmed on the final production domain:

- `DJANGO_SECURE_SSL_REDIRECT=true`
- `DJANGO_SESSION_COOKIE_SECURE=true`
- `DJANGO_CSRF_COOKIE_SECURE=true`
- `DJANGO_SECURE_HSTS_SECONDS=31536000`
- `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=true`
- `DJANGO_SECURE_HSTS_PRELOAD=true`

If you want a safer rollout first, start with:

- `DJANGO_SECURE_HSTS_SECONDS=3600`
- `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=false`
- `DJANGO_SECURE_HSTS_PRELOAD=false`

Once that looks good in production, move to the one-year HSTS values above.

Optional Sentry sampling environment variables:

- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`
- `SENTRY_PROFILES_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
- `NEXT_PUBLIC_SENTRY_RELEASE`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`

## Mobile Account Recovery Links

Account recovery emails open the DiningDealz mobile app through its `diningdealz` URL scheme. Set these backend environment variables on the production service so an older web or localhost override cannot be used:

- `PROFILE_USERNAME_RECOVERY_URL_BASE=diningdealz://forgot-username`
- `PROFILE_PASSWORD_RESET_URL_BASE=diningdealz://forgot-password`

The mobile app handles the username reminder screen and the token-based password reset screen. Release the updated mobile binary before testing these links on a device; the backend can continue serving the existing browser reset endpoint for direct web requests.

## Production Rate Limiting

The backend applies scoped DRF throttles to login, signup, verification-code, password-recovery, support, direct-message, favorite, feed-write, and profile mutation endpoints.

For a single local development process, the default in-memory cache is enough. For Render production, set `REDIS_URL` so throttles and cache counters are shared across workers and deploy instances.

When `REDIS_URL` is configured, both Django cache aliases use Redis: the default cache stores throttles and general runtime values, while the `source_fetch` alias stores source responses and normalized listing payloads under a separate key prefix. The listing payload cache does not rebuild on every live-location update; current coordinates are overlaid from PostgreSQL when a cached payload is read.

Recommended production env vars:

- `REDIS_URL=<your-render-redis-internal-url>`
- optional: `CACHE_KEY_PREFIX=happyhourapp-prod`
- optional: `SOURCE_CACHE_KEY_PREFIX=happyhourapp-prod-source`

Throttle rates can be tuned without code changes:

- `THROTTLE_PROFILE_LOGIN` defaults to `10/minute`
- `THROTTLE_PROFILE_SIGNUP` defaults to `300/hour`
- `THROTTLE_PROFILE_EMAIL_VERIFICATION` defaults to `10/minute`
- `THROTTLE_PROFILE_EMAIL_VERIFICATION_RESEND` defaults to `3/minute`
- `THROTTLE_PROFILE_PASSWORD_RECOVERY` defaults to `10/hour`
- `THROTTLE_PROFILE_SUPPORT_CONTACT` defaults to `10/hour`
- `THROTTLE_PROFILE_USER_MUTATION` defaults to `120/minute`
- `THROTTLE_DIRECT_MESSAGE_SEND` defaults to `30/minute`

## Migrating Local SQLite Data To Render Postgres

If I want my admin-edited business rows to survive the move from local development to Render Postgres, I need to migrate both:

- the database schema
- the actual data currently stored in `backend/db.sqlite3`

The backend now supports Postgres through either:

- `DATABASE_URL`
- standard Postgres env vars such as `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGHOST`, and `PGPORT`

For Render, the simplest production setup is usually a single `DATABASE_URL` from the Render Postgres service plus an optional connection lifetime override:

- `DATABASE_URL=<your-render-postgres-internal-database-url>`
- optional: `DATABASE_CONN_MAX_AGE=600`

If you prefer individual env vars instead of `DATABASE_URL`, set:

- `PGDATABASE=<database-name>`
- `PGUSER=<database-user>`
- `PGPASSWORD=<database-password>`
- `PGHOST=<database-host>`
- `PGPORT=5432`
- optional: `PGSSLMODE=require`
- optional: `DATABASE_CONN_MAX_AGE=600`

If none of those are set, it still falls back to local SQLite in [backend/config/settings.py](c:/dev/HappyHourApp/backend/config/settings.py).

### What Will Transfer

These database-backed edits will transfer if I export the SQLite data and load it into Postgres:

- `ListingSnapshot` rows, which should be treated as the durable source of truth for admin-edited business data, including edited names, addresses, phone numbers, `website_url`, `source_url`, `deal_overrides`, and `operating_hour_overrides`
- `BusinessClaim`, `BusinessMembership`, and account workflow data
- deleted-business records stored in the database
- uploaded-file references stored in database fields

### What Will Not Move Just Because Postgres Exists

These need separate handling:

- `backend/config/discovered_places.json` is also file-based, is not moved by a database migration, and should be treated as generated/cache/seed discovery data rather than durable production business data
- local uploaded media under `backend/media` is not copied into Postgres
- file-based caches do not transfer automatically

### First Deploy Versus Later Deploys

This is the most important distinction to keep straight:

- `ListingSnapshot` rows do not get created automatically just because `backend/config/discovered_places.json` exists.
- The first Postgres-backed deploy can bootstrap the runtime discovery JSON file from the committed seed file if the runtime file does not exist yet.
- The first Postgres-backed deploy only gets my durable business edits if I explicitly migrate/import the SQLite database data into Postgres.
- After that first bootstrap, discovery JSON writes should go to the runtime discovery file, not back into the committed repo copy.
- After the first real data migration, Postgres and `ListingSnapshot` should be treated as the authoritative source of truth for admin-edited business data.

### Recommended Migration Order

1. Finish the admin edits locally.
2. Commit any file-based changes that matter in production, especially the current `backend/config/discovered_places.json` seed catalog.
3. Refresh or review the committed `backend/config/discovered_places.json` seed file if I want a clean first-bootstrap discovery snapshot.
4. Set the production Postgres environment variables for the backend service.
5. Create the Render Postgres database and note the internal/external connection string.
6. Take a final SQLite export from the local app.
7. Load that export into Postgres.
8. Point the Render backend service at Postgres.
9. Run a quick verification pass in admin and the API.

### Step 1: Export The Local SQLite Data

For an all-in-one local safety backup before running any admin pull, create a timestamped bundle from the `backend` folder:

```powershell
venv\Scripts\Activate
python manage.py backup_admin_data
```

That command creates `backend/backups/admin-backup-YYYYMMDD-HHMMSS/` with:

- a raw SQLite copy as `db.sqlite3`
- a portable Django fixture as `database-fixture.json`
- a `listing-snapshots.json` export that includes each `ListingSnapshot` row, its admin-managed display fields, and any matching stored discovery record from `discovered_places.json`
- a copy of `discovered_places.json` when it exists

If the admin data gets wiped locally, restoring the copied `db.sqlite3` is the fastest full recovery path.

From the `backend` folder, after all local edits are complete:

```powershell
venv\Scripts\Activate
python manage.py dumpdata --exclude auth.permission --exclude contenttypes --exclude sessions --indent 2 > data-migration.json
```

Why exclude those tables:

- `contenttypes` and `auth.permission` are recreated by migrations
- `sessions` are temporary and not worth migrating

This fixture should contain the business/admin data that matters, including `ListingSnapshot` edits.

### Step 2: Prepare Render Postgres

In Render:

1. Create the Postgres database.
2. Create or update the backend web service.
3. Set either `DATABASE_URL` or the equivalent Postgres env vars on the backend service.
4. Make sure the app can connect to Postgres instead of SQLite.

*Note: put database_url in local env so django can connect to render's postgresql database so you can migrate and load the updated listsnapshot data (and admin) into live prod (first time)

Do not rely on `python manage.py migrate` alone to move the data. That only creates tables.

### Step 3: Run Migrations Against Postgres

Once Django is configured to connect to the Render Postgres database, run:

```powershell
python manage.py migrate
```

That creates the schema in Postgres, but the database will still be empty until the fixture is loaded.

### Step 4: Load The SQLite Export Into Postgres

The safest approach is usually to point a local backend shell at the Render Postgres connection temporarily, then load the fixture from the local machine.

After switching the backend environment to the Render Postgres connection, run:

```powershell
python manage.py loaddata data-migration.json
```

That inserts the exported SQLite rows into Postgres using Django's models instead of hand-written SQL.

This step is what makes the first deployment accurate for my admin-edited business data. The discovery JSON seed file alone is not enough for that.

### Step 5: Verify The Data Before Cutover

Before treating Render as the new source of truth, verify:

- edited business names still appear in admin
- `website_url` and `source_url` edits are still present on `ListingSnapshot`
- manual deal and hours overrides still exist
- deleted businesses and curated catalog data still behave as expected
- `/api/places/` and `/api/places/<slug>/` still reflect the edited snapshot data

If I want the first production runtime discovery cache to be fresher than the committed seed file, I should run a discovery refresh or admin pull flow after deployment.

### Step 6: Handle File-Based Data Separately

For this repo, Postgres is not the whole story.

- Treat `backend/config/discovered_places.json` as seed/cache/generated discovery data only. It can be deployed as a bootstrap snapshot for the runtime discovery file, but it should not be treated as the durable system of record for business edits.
- If local uploads matter, move `backend/media` to production storage separately.

### Practical Cutover Advice

- Avoid editing admin data in both SQLite and Postgres at the same time.
- Take the final `dumpdata` as close to deployment as possible.
- If more local edits are made after the export, take a fresh export instead of trying to merge by hand.
- If I care about the first deployed discovery snapshot, make sure the committed `backend/config/discovered_places.json` seed is reasonably current before the first Postgres-backed deploy.
- After the Render deploy is live, treat Postgres and `ListingSnapshot` as the durable source of truth for business edits.
- Do not treat `backend/config/discovered_places.json` as authoritative production data after Render is live.

## Production Backup And Recovery

The local `backup_admin_data` command is an application-level export. It is useful for Django fixtures and admin review, but it is not a complete PostgreSQL backup and it does not download Supabase Storage objects. Use the production command below for a recoverable bundle containing:

- a custom-format PostgreSQL dump
- every object in the public and private Supabase media buckets
- the runtime discovery file and committed discovery seed

The command writes by default to `%USERPROFILE%\DiningDealzBackups`, outside the repository. Keep these bundles in encrypted external storage and never commit them.

### Create A Production Backup On Windows

Install the PostgreSQL client tools and confirm `pg_dump` is available:

```powershell
pg_dump --version
```

Set `BACKUP_DATABASE_URL` to the **external** Render Postgres URL from the database service's Connect menu. Do not use the internal URL from a local computer, and do not paste the URL into source files:

```powershell
$env:BACKUP_DATABASE_URL = '<external-render-postgresql-url>'
.\backend\scripts\backup-production.ps1
```

The script reads the existing Supabase settings from `backend/.env` or the process environment. The required values are `SUPABASE_STORAGE_BUCKET`, `SUPABASE_PRIVATE_STORAGE_BUCKET`, `SUPABASE_STORAGE_ENDPOINT`, `SUPABASE_STORAGE_ACCESS_KEY`, and `SUPABASE_STORAGE_SECRET_KEY`.

The direct Django command is also available when a different output directory is needed:

```powershell
backend\venv\Scripts\python.exe backend\manage.py backup_production_data --output-dir 'D:\ProtectedBackups'
```

Each completed bundle contains `manifest.json`, `postgresql.dump`, `supabase\public-media`, `supabase\private-media`, and the `discovery` directory. The manifest records object counts, file sizes, SHA-256 checksums, and Supabase object metadata. Verify the database dump after copying it:

```powershell
Get-FileHash 'C:\Users\<you>\DiningDealzBackups\production-backup-YYYYMMDD-HHMMSS\postgresql.dump' -Algorithm SHA256
```

Run this before risky migrations or bulk admin changes, and retain multiple dated copies. Free Render Postgres has no managed PITR or Render logical-export facility, so an independent `pg_dump` copy is required.

### Recovery Track 1: Render PostgreSQL

Pause admin edits, migrations, and other writes if possible. Do not restore over the live database as the first recovery attempt.

For recent accidental deletion or corruption on a paid Render Postgres plan:

1. Open the database service's **Recovery** page in Render.
2. Choose **Restore Database** under Point-in-Time Recovery.
3. Select a recovery time before the incident and give the new database a separate name.
4. Wait for the recovery database to become available.
5. Validate its schema, account data, business claims, `ListingSnapshot` edits, and API responses.
6. Keep the current backend connected to the original database until validation is complete.

Render documents a 3-day recovery window for Hobby and 7 days for Pro or higher. Free Postgres does not provide PITR.

If PITR is unavailable or the required point is outside its window:

1. Create a new empty Render Postgres database.
2. Obtain its external connection URL.
3. Confirm the backup dump checksum with `Get-FileHash`.
4. Restore the custom-format dump into the new database:

```powershell
$env:TARGET_DATABASE_URL = '<external-url-for-new-empty-render-database>'
pg_restore `
	--dbname="$env:TARGET_DATABASE_URL" `
	--verbose `
	--clean `
	--if-exists `
	--no-owner `
	--no-privileges `
	--exit-on-error `
	--format=custom `
	'C:\Users\<you>\DiningDealzBackups\production-backup-YYYYMMDD-HHMMSS\postgresql.dump'
```

5. Validate the recovered database with Django admin, account data, business claims, `ListingSnapshot` edits, and the API.
6. Update the Render backend service's `DATABASE_URL` to the recovered database's **internal** URL.
7. Redeploy or restart the backend and verify the health endpoint, web app, and mobile app.

### Recovery Track 2: Supabase Storage Objects

PostgreSQL restores file references, not the uploaded file bytes. Restore both configured buckets:

- `SUPABASE_STORAGE_BUCKET`: public business profile media
- `SUPABASE_PRIVATE_STORAGE_BUCKET`: private claim, deal, and direct-message media

1. Select the backup bundle that matches the database recovery point.
2. Confirm the current Supabase environment variables point to the intended target project and buckets. Stop if they point to the wrong project.
3. Run a media-only dry run. It verifies archive paths and checksums without uploading:

```powershell
backend\venv\Scripts\python.exe backend\manage.py restore_production_data `
	--backup-dir 'C:\Users\<you>\DiningDealzBackups\production-backup-YYYYMMDD-HHMMSS' `
	--skip-discovery
```

4. Review the public and private object names in the output.
5. Apply the media restore:

```powershell
backend\venv\Scripts\python.exe backend\manage.py restore_production_data `
	--backup-dir 'C:\Users\<you>\DiningDealzBackups\production-backup-YYYYMMDD-HHMMSS' `
	--skip-discovery `
	--apply
```

6. Verify public profile photos, private claim attachments, deal attachments, and direct-message images. Confirm signed URLs work for private objects.

The command upserts archived objects and preserves content type and related metadata. It does not delete extra objects already present in the buckets.

### Recovery Track 3: File-Based Discovery Data

The backup contains the runtime discovery JSON and the committed discovery seed. Restore only these files with a discovery-only dry run first:

```powershell
backend\venv\Scripts\python.exe backend\manage.py restore_production_data `
	--backup-dir 'C:\Users\<you>\DiningDealzBackups\production-backup-YYYYMMDD-HHMMSS' `
	--skip-media
```

1. Confirm the dry run identifies the expected `runtime_discovered_places` and `seed_discovered_places` targets.
2. Apply the discovery restore:

```powershell
backend\venv\Scripts\python.exe backend\manage.py restore_production_data `
	--backup-dir 'C:\Users\<you>\DiningDealzBackups\production-backup-YYYYMMDD-HHMMSS' `
	--skip-media `
	--apply
```

3. Treat the runtime discovery JSON as a cache/bootstrap artifact. Durable admin business edits remain in PostgreSQL `ListingSnapshot` rows.

A Render service's runtime filesystem may be replaced on deploy or restart. If the runtime file is lost after recovery, the backend can bootstrap from the committed seed file according to its configured discovery settings.

### Complete Recovery Order

1. Pause writes and identify the backup timestamp or Render PITR time to use.
2. Recover PostgreSQL into a new Render database and validate it without changing the live backend.
3. Restore Supabase public and private objects into the intended buckets.
4. Restore discovery files, then review and deploy the source-controlled exclusions file.
5. Point the backend service at the recovered database's internal URL and redeploy.
6. Verify admin, account flows, business data, public images, private attachments, web behavior, and mobile behavior.
7. Keep the original database and old backup bundle until the recovery has been accepted and a fresh backup has been taken.

PostgreSQL restoration does not restore Supabase file bytes, and Supabase restoration does not restore PostgreSQL rows. Complete all three recovery tracks before declaring production recovered.

## Media Storage

Uploaded business profile photos use public media storage because they are displayed on business profiles. Sensitive uploads, including business claim attachments and direct-message images, use private media storage with signed URLs.

For local development, no extra setup is required and uploads still use `backend/media`.

### Supabase Bucket Setup

Create two Supabase Storage buckets for app-managed uploads.

Public bucket settings:

- Bucket name: `business-media`
- Public bucket: `Yes`
- File size limit: set this to whatever max upload size you want enforced at the storage layer
- Allowed MIME types: optional, but this bucket only needs public profile image types such as `image/jpeg`, `image/png`, `image/webp`, and `image/heic`

Private bucket settings:

- Bucket name: `business-private-media`
- Public bucket: `No`
- File size limit: set this to whatever max upload size you want enforced at the storage layer
- Allowed MIME types: optional, but include the private file types the app accepts, such as `image/jpeg`, `image/png`, `image/webp`, `image/heic`, and `application/pdf`

Why split buckets: public profile photos need stable public URLs, while claim documents and direct-message images should not be publicly listable or fetchable without a signed URL.

In Supabase, the bucket should end up with public object URLs in this format:

```text
https://<your-project-ref>.supabase.co/storage/v1/object/public/business-media/<path-inside-bucket>
```

### Exact Backend Env Vars

To switch media uploads to Supabase Storage, set these backend environment variables exactly like this:

- `MEDIA_STORAGE_BACKEND=supabase`
- `PRIVATE_MEDIA_STORAGE_BACKEND=supabase`
- `SUPABASE_STORAGE_BUCKET=business-media`
- `SUPABASE_PRIVATE_STORAGE_BUCKET=business-private-media`
- `SUPABASE_STORAGE_ENDPOINT=https://<your-project-ref>.supabase.co/storage/v1/s3`
- `SUPABASE_STORAGE_ACCESS_KEY=<your-supabase-s3-access-key>`
- `SUPABASE_STORAGE_SECRET_KEY=<your-supabase-s3-secret-key>`
- `SUPABASE_STORAGE_PUBLIC_URL_BASE=https://<your-project-ref>.supabase.co/storage/v1/object/public/business-media`
- optional: `SUPABASE_PRIVATE_STORAGE_SIGNED_URL_EXPIRE_SECONDS` (defaults to `3600`)
- optional: `SUPABASE_STORAGE_REGION` (defaults to `us-east-1`)

If you want to set the optional region explicitly, use:

- `SUPABASE_STORAGE_REGION=us-east-1`

### What Each Value Means

- `SUPABASE_STORAGE_BUCKET`: the exact Supabase bucket name
- `SUPABASE_PRIVATE_STORAGE_BUCKET`: the exact private Supabase bucket name for claim attachments and direct-message images
- `SUPABASE_STORAGE_ENDPOINT`: the S3-compatible Supabase storage endpoint, not the public object URL
- `SUPABASE_STORAGE_ACCESS_KEY`: the S3 access key from Supabase
- `SUPABASE_STORAGE_SECRET_KEY`: the S3 secret key from Supabase
- `SUPABASE_STORAGE_PUBLIC_URL_BASE`: the public base URL for objects inside that bucket
- `SUPABASE_PRIVATE_STORAGE_SIGNED_URL_EXPIRE_SECONDS`: how long private media URLs should remain usable after the API returns them

### Example Render Env Block

```text
MEDIA_STORAGE_BACKEND=supabase
PRIVATE_MEDIA_STORAGE_BACKEND=supabase
SUPABASE_STORAGE_BUCKET=business-media
SUPABASE_PRIVATE_STORAGE_BUCKET=business-private-media
SUPABASE_STORAGE_ENDPOINT=https://abcd1234.supabase.co/storage/v1/s3
SUPABASE_STORAGE_ACCESS_KEY=your-s3-access-key
SUPABASE_STORAGE_SECRET_KEY=your-s3-secret-key
SUPABASE_STORAGE_PUBLIC_URL_BASE=https://abcd1234.supabase.co/storage/v1/object/public/business-media
SUPABASE_PRIVATE_STORAGE_SIGNED_URL_EXPIRE_SECONDS=3600
SUPABASE_STORAGE_REGION=us-east-1
```

### Delete Behavior

Once Supabase is configured and enabled, app-managed uploads stored under these paths:

- `business-claim-attachments/...`
- `business-profile-photos/...`
- `direct-message-images/...`

will be deleted from storage when:

- the related `BusinessClaimAttachment` record is deleted
- a `BusinessClaim` is deleted from admin or elsewhere in the backend
- uploaded profile photos are removed from a business profile and no longer referenced
- an expired direct-message image is lazily cleaned up after its 24-hour display window

This cleanup does not apply to external image URLs that were never uploaded by the backend.

The backend also now cleans up app-managed media when claim attachments are deleted, when uploaded profile photos are removed from a claim, and when an entire claim is deleted.

To remove old local orphaned media files that were left behind by earlier test accounts, run this from `backend`:

```powershell
venv\Scripts\python.exe manage.py cleanup_orphaned_media --delete
```

Run it without `--delete` first for a dry run.

## Current Focus

The current focus is tightening the existing mobile + backend loop instead of starting from scratch.

That mainly means:

- improving mobile browse/map polish and gesture behavior
- smoothing browse/profile transitions and map/list interaction polish
- improving source data quality and duplicate-location cleanup
- tightening claim/account flows
- expanding reliable business coverage inside Ventura, Oxnard, and Camarillo
- keeping the README and local workflow notes aligned with the actual codebase state

## How To Run The Backend Locally

From the `backend` folder:

```powershell
venv\Scripts\Activate
python manage.py migrate
python manage.py runserver
```

Or use the helper script from the backend folder:

```powershell
.\start-mobile-dev.ps1
```

Then Django admin should be available at:

```text
http://127.0.0.1:8000/admin/
```

The mobile app reads from the backend API, so the backend needs to be running while testing the Expo app locally.

From the `mobile` folder:

```powershell
npm install
npm start
```

Other useful mobile commands:

```powershell
npm run ios
npm run android
npx tsc --noEmit
```

### iOS Versioning And Upload Workflow

iOS uses two version values:

- **Marketing version**: the user-facing App Store version, such as `1.0.0`. Change this when preparing a new App Store release version.
- **Build number**: the unique integer for each uploaded binary, such as `49`, `50`, or `51`. Do not reuse a build number after Apple has accepted that binary.

#### EAS cloud builds

Production EAS builds use the settings in `mobile/eas.json`:

- `appVersionSource: "remote"` means EAS servers own the canonical build number.
- `autoIncrement: true` means EAS increments that remote number for the next production build.

For a normal EAS production build, do not manually change the build number in Xcode or `mobile/app.json` first. Check the remote value when needed:

```powershell
cd mobile
npx eas-cli@latest build:version:get
```

If the local native project needs to match the value stored on EAS, synchronize it with:

```powershell
npx eas-cli@latest build:version:sync
```

#### Xcode uploads

An archive uploaded directly from Xcode is outside EAS automatic incrementing. Before creating the archive, set the Xcode target's **Build** value, or `CURRENT_PROJECT_VERSION`, to the next unused number. The marketing version stays unchanged unless this is a new App Store version.

For example, if the EAS remote build number is `49` and the next upload will come from Xcode, use build `50`. Do not use `49` again. After the Xcode upload succeeds, update the EAS remote value so the next EAS build starts from the correct number:

```powershell
cd mobile
npx eas-cli@latest build:version:set
```

When prompted, enter the build number that was just uploaded, such as `50`. The next EAS production build will then increment to `51`.

If an EAS build has already uploaded build `50`, the next Xcode archive must use `51` instead. The same unique-number rule applies regardless of whether the binary was uploaded by EAS or Xcode.

#### App Store listing metadata

The local App Store listing source is `mobile/store.config.json`. It can be validated and synchronized with App Store Connect:

```powershell
cd mobile
npx eas-cli@latest metadata:lint
npx eas-cli@latest metadata:pull
npx eas-cli@latest metadata:push
```

`metadata:pull` imports the current App Store Connect listing into the local file. `metadata:push` sends the local file to App Store Connect and can overwrite portal edits. Screenshots, app previews, privacy nutrition labels, age rating, pricing, and availability are still managed in App Store Connect.

## Helpful Backend Commands

Run tests:

```powershell
python manage.py test places
```

Preview the configured source data without writing catalog rows to the database:

```powershell
python manage.py import_source_data --source business_websites
```

Run the focused backend API tests used during recent mobile/data fixes:

```powershell
python manage.py test places.tests.PlaceApiTests places.tests.BusinessWebsiteImporterTests
```

Run the focused admin and discovery workflow tests used during recent data/admin updates:

```powershell
python manage.py test places.tests.ListingSnapshotAdminTests places.tests.DiscoveryJsonStorageTests places.tests.BusinessWebsiteImporterTests
```

Run a broader backend validation pass:

```powershell
python manage.py check
python manage.py test places
```

Run and fill up or take out temporary demo feed data (Home feed for business advertisement)

```powershell
python manage.py cleanup_demo_home_feed to remove demo feed data
python manage.py seed_demo_home_feed to fill it back up again
*Note: seeding businesses into the app will go into the database temporarily and will have the number businesses appear greater than what they actually are. Run the cleanup command to have the business count number return back to normal*
```

## Notes From Me

I am intentionally trying to build this in phases:

1. backend skeleton
2. source-backed and discovery-backed listings
3. working thin mobile app
4. better extraction rules and data cleanup
5. broader city expansion later

I am still learning, so I am keeping the structure practical and understandable instead of trying to make it perfect too early.

This project is mainly about building something real, learning the stack, and creating a strong mobile-first foundation.
