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
- keyword search across names, venue types, cities, and addresses
- place detail cards with photos, deal sections, hours, phone numbers, and map previews
- login and account creation flows
- profile dashboard flow with animated transitions between auth, browse, and dashboard screens
- business claim flow with consolidated business results and per-location address selection before verification
- map marker rendering based on backend-provided or resolved coordinates
- native map boundary handling for built apps, with a JS fallback for Expo Go

### Current Backend Models

The backend currently includes data models for:

- `ListingSnapshot`
- `BusinessClaim`
- `BusinessMembership`

This lets the project store claim and ownership workflow data without keeping a long-lived restaurant/store catalog in the database.

Legacy catalog models for `Place`, `Deal`, `HappyHour`, and `ImportRun` have been removed from the active schema.

### Current API Direction

The backend now builds listing responses from source records instead of serving a long-lived `Place` catalog out of the database.

That means the current direction is:

- pull curated business website records and discovery records from configured sources
- normalize and group them at request time through the backend service layer
- expose them through API endpoints that the mobile app consumes directly
- keep app-owned workflow data in the database while leaving listing data source-backed

## Current Listing Pipeline

The listing APIs now build responses from a mix of curated website-backed businesses and stored discovery records.

That currently includes:

- curated business source definitions in `backend/config/business_sources.py`
- discovery data stored in `backend/config/discovered_places.json`
- grouping and deduplication in `backend/places/services/source_listings.py`
- coordinate backfill for records that need geocode resolution before they can appear on the mobile map
- multi-location grouping so one business profile can expose multiple addresses inside the app
- address-quality merging so partial or duplicate discovery records collapse into a better canonical location when possible

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
- Expo mobile browse UI with list and map modes
- mobile search, city filtering, and venue filtering
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

## Current Focus

The current focus is tightening the existing mobile + backend loop instead of starting from scratch.

That mainly means:

- improving mobile browse/map polish and gesture behavior
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

Then Django admin should be available at:

```text
http://127.0.0.1:8000/admin/
```

The mobile app reads from the backend API, so the backend needs to be running while testing the Expo app locally.

From the `mobile` folder:

```powershell
npm install
npx expo start
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

## Notes From Me

I am intentionally trying to build this in phases:

1. backend skeleton
2. source-backed and discovery-backed listings
3. working thin mobile app
4. better extraction rules and data cleanup
5. broader city expansion later

I am still learning, so I am keeping the structure practical and understandable instead of trying to make it perfect too early.

This project is mainly about building something real, learning the stack, and creating a strong mobile-first foundation.
