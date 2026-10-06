---
version: alpha
name: DiningDealz mobile
description: A dark, map-first guide to nearby dining deals with coral actions and legible business details.
colors:
  canvas: "#11141b"
  surface: "#1a1f29"
  raised: "#1b202a"
  accent: "#ff5f68"
  accent-text: "#ff7a70"
  primary-text: "#f5f7fb"
  secondary-text: "#c4ccda"
typography:
  sans:
    fontFamily: "system"
rounded:
  card: "18px"
  sheet: "24px"
  pill: "999px"
spacing:
  card-padding: "14px"
  sheet-card-gap: "12px"
components:
  deal-card: {}
  deal-description: {}
  map-sheet: {}
---

# DiningDealz mobile design context

DiningDealz is a product surface for people scanning nearby deals on an iPhone, often while moving. The map is the orientation layer; the deal sheet is a quick browse layer; the business profile is the detail layer. Keep the existing map-first structure and coral accent rather than introducing a new visual language.

The runtime colors, spacing, and typography are owned by `src/styles/theme.ts`, the screen style modules, and the native SwiftUI sheet. This document records their shared intent; it is not a second source of generated tokens. The current mobile app is English-language and iPhone-oriented.

## Visual hierarchy

- Dark canvas and raised cards separate map controls, deal listings, and full details. Light sheet mode uses the established native/fallback sheet palette, not inverted deal-card colors.
- System type and clear weight changes distinguish titles, prices, day labels, descriptions, and terms. Prices and explicit weekday labels use the accent; body copy remains readable and quiet.
- Deal details are arranged into rows only when the source explicitly contains line breaks, `||`, or weekday prefixes. Never invent a weekday or silently rewrite the business's prices, conditions, or schedule.
- Short copy stays fully visible. Long copy has a labeled, reversible “Show all details” action; shared/calendar text continues to use the unformatted source.

## Interaction and layout

- The happy-hour sheet keeps its existing collapsed and expanded stops. The header and handle are drag surfaces, while the list owns normal scrolling. Pulling down at the top collapses the sheet.
- Deal cards retain a clear action hierarchy: opening the business is primary; calendar, share, and favorite are separate controls. The last card must scroll above the bottom navigation and safe area.
- Motion communicates the sheet's state and should settle promptly. Do not add decorative motion or make deal text animate while scrolling.

## Consistency rules

- Reuse `DealDescription` in public details and owner preview; do not create business-specific formatting exceptions.
- Keep controls labeled for accessibility and usable by tapping as well as dragging.
- Do not scrape or substitute venue photos as part of this UI change. Existing licensed/owner-provided photo behavior stays unchanged.
