# HappyHourApp

This is my first pass at building HappyHourApp, a mobile-first app for finding happy hour spots, food deals, and other discounts in Ventura, Oxnard, and Camarillo, California.

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

- Expo / React Native for the mobile app
- Django for the backend
- Next.js for the website
- Vercel for hosting the website later
- Render for hosting the backend later
- Render Postgres for the production database later

Right now, the backend is the part that is furthest along because I wanted the mobile app to be built against real API endpoints instead of fake UI-only data.

## What I Have Built So Far

### Phase 1: Backend Skeleton

So far I have built the first backend foundation using Django.

Current backend work includes:

- Django project setup inside the `backend` folder
- a `places` app for the core happy hour data
- models for claims, memberships, and listing snapshots
- Django admin setup so I can manage the data through `/admin`
- API endpoints for health, places, place details, and deals
- local virtual environment and backend requirements file
- passing migrations and tests

### Current Backend Models

The backend currently includes data models for:

- `ListingSnapshot`
- `BusinessClaim`
- `BusinessMembership`

This lets the project store claim and ownership workflow data without keeping a long-lived restaurant/store catalog in the database.

Legacy catalog models for `Place`, `Deal`, `HappyHour`, and `ImportRun` have been removed from the active schema.

### Current API Direction

The backend now reads listing data directly from configured business websites and only keeps short-lived cache entries in memory.

That means the plan is:

- fetch listing data from business websites
- normalize it at request time through the backend
- expose it through API endpoints
- build the mobile UI against those endpoints
- keep the app thin and simple while storing only app-owned data in the database

## Phase 2 Progress: Source-Backed Listings

The listing APIs now pull directly from configured business websites instead of storing a full place/deal catalog in the database.

That means I now have:

- a live website importer that fetches business pages directly
- short-lived Django local-memory caching for fetched source HTML
- API endpoints that normalize website data into the app response shape
- claims and memberships stored separately from the live listing catalog

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

Right now, these parts are ready:

- backend project structure
- Django admin
- base API endpoints
- live source-backed listing fetches
- local-memory cache for source HTML
- snapshot-based business claim workflow
- tests passing for the backend

## What Is Not Built Yet

These parts are not built yet:

- Expo mobile UI
- Next.js website UI
- production deployment
- expanded city coverage outside the first 805 launch area
- site-specific extraction rules for every business website I want to support reliably

## Current Focus

The next major step is building the Expo mobile app against the backend endpoints and live source-backed listing data.

I want to start simple and only build screens that match the actual backend data that already exists.

That will probably start with:

- place list screen
- place detail screen
- basic city filtering
- deal display from the live backend

## How To Run The Backend Locally

From the `backend` folder:

```powershell
venv\Scripts\Activate
python manage.py migrate
python manage.py runserver
```

Then Django admin should be available at:

```text
http://127.0.0.1:8000/admin/
```

## Helpful Backend Commands

Run tests:

```powershell
python manage.py test places
```

Preview the configured live website sources without writing catalog rows to the database:

```powershell
python manage.py import_source_data --source business_websites
```

## Notes From Me

I am intentionally trying to build this in phases:

1. backend skeleton
2. live source-backed listings
3. thin mobile app
4. better site-specific extraction rules
5. broader city expansion later

I am still learning, so I am keeping the structure practical and understandable instead of trying to make it perfect too early.

This project is mainly about building something real, learning the stack, and creating a strong mobile-first foundation.
