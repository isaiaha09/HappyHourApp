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
- Django admin setup so I can manage claims, memberships, deleted businesses, provider usage windows, and snapshots through `/admin`
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
- keep app-owned workflow data in the database while leaving listing data source-backed

## Current Listing Pipeline

The listing APIs are built from source-backed records and normalized for the mobile app.

That currently includes:

- curated business source definitions in `backend/config/business_sources.py`
- discovery data stored in `backend/config/discovered_places.json`
- grouping and deduplication in `backend/places/services/source_listings.py`
- coordinate backfill for records that need geocode resolution before they can appear on the mobile map
- multi-location grouping so one business profile can expose multiple addresses inside the app
- address-quality merging so partial or duplicate records collapse into a better canonical location when possible

The current runtime goal is to keep listings source-backed and normalized while only storing claim/account workflow data permanently in the database.

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
- automatic cleanup of stale daily `tomtom_places` provider usage rows in admin
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
- a finalized production cache strategy for source fetches and geocoding

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

## Media Storage

Business claim attachments and uploaded business profile photos now go through Django's `default_storage`, so media can be switched from local disk to Supabase Storage without changing claim/profile code paths.

For local development, no extra setup is required and uploads still use `backend/media`.

### Supabase Bucket Setup

Create one Supabase Storage bucket for app-managed uploads.

Recommended bucket settings:

- Bucket name: `business-media`
- Public bucket: `Yes`
- File size limit: set this to whatever max upload size you want enforced at the storage layer
- Allowed MIME types: optional, but if you want to restrict it, include common image and document types your app accepts such as `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`

Why public: this backend currently stores public URLs for uploaded business profile photos and serves attachment/profile-photo URLs directly from storage.

In Supabase, the bucket should end up with public object URLs in this format:

```text
https://<your-project-ref>.supabase.co/storage/v1/object/public/business-media/<path-inside-bucket>
```

### Exact Backend Env Vars

To switch media uploads to Supabase Storage, set these backend environment variables exactly like this:

- `MEDIA_STORAGE_BACKEND=supabase`
- `SUPABASE_STORAGE_BUCKET=business-media`
- `SUPABASE_STORAGE_ENDPOINT=https://<your-project-ref>.supabase.co/storage/v1/s3`
- `SUPABASE_STORAGE_ACCESS_KEY=<your-supabase-s3-access-key>`
- `SUPABASE_STORAGE_SECRET_KEY=<your-supabase-s3-secret-key>`
- `SUPABASE_STORAGE_PUBLIC_URL_BASE=https://<your-project-ref>.supabase.co/storage/v1/object/public/business-media`
- optional: `SUPABASE_STORAGE_REGION` (defaults to `us-east-1`)

If you want to set the optional region explicitly, use:

- `SUPABASE_STORAGE_REGION=us-east-1`

### What Each Value Means

- `SUPABASE_STORAGE_BUCKET`: the exact Supabase bucket name
- `SUPABASE_STORAGE_ENDPOINT`: the S3-compatible Supabase storage endpoint, not the public object URL
- `SUPABASE_STORAGE_ACCESS_KEY`: the S3 access key from Supabase
- `SUPABASE_STORAGE_SECRET_KEY`: the S3 secret key from Supabase
- `SUPABASE_STORAGE_PUBLIC_URL_BASE`: the public base URL for objects inside that bucket

### Example Render Env Block

```text
MEDIA_STORAGE_BACKEND=supabase
SUPABASE_STORAGE_BUCKET=business-media
SUPABASE_STORAGE_ENDPOINT=https://abcd1234.supabase.co/storage/v1/s3
SUPABASE_STORAGE_ACCESS_KEY=your-s3-access-key
SUPABASE_STORAGE_SECRET_KEY=your-s3-secret-key
SUPABASE_STORAGE_PUBLIC_URL_BASE=https://abcd1234.supabase.co/storage/v1/object/public/business-media
SUPABASE_STORAGE_REGION=us-east-1
```

### Delete Behavior

Once Supabase is configured and enabled, app-managed uploads stored under these paths:

- `business-claim-attachments/...`
- `business-profile-photos/...`

will be deleted from storage when:

- the related `BusinessClaimAttachment` record is deleted
- a `BusinessClaim` is deleted from admin or elsewhere in the backend
- uploaded profile photos are removed from a business profile and no longer referenced

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
python manage.py test places.tests.ListingSnapshotAdminTests places.tests.ProviderQuotaTests places.tests.ProviderUsageWindowAdminTests places.tests.DiscoveryJsonStorageTests places.tests.HerePlacesImporterTests
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
