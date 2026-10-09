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
  deal-editor: {}
  account-page: {}
---

# DiningDealz mobile design context

DiningDealz is a product surface for people scanning nearby deals on an iPhone, often while moving. The map is the orientation layer; the deal sheet is a quick browse layer; the business profile is the detail layer. Keep the existing map-first structure and coral accent rather than introducing a new visual language.

The runtime colors, spacing, and typography are owned by `src/styles/theme.ts`, the screen style modules, and the native SwiftUI sheet. This document records their shared intent; it is not a second source of generated tokens. The current mobile app is English-language and iPhone-oriented.

## Visual hierarchy

- Dark canvas and raised cards separate map controls, deal listings, and full details. Light sheet mode uses the established native/fallback sheet palette, not inverted deal-card colors.
- System type and clear weight changes distinguish titles, prices, day labels, descriptions, and terms. Prices and explicit weekday labels use the accent; body copy remains readable and quiet.
- Deal details use rows for explicit line breaks, `||`, and written weekday prefixes, as well as clearly identifiable item/price entries (including inline menus separated by complete parenthesized descriptions or clear punctuation). Ambiguous prose stays intact. Never invent a weekday or silently rewrite the business's prices, conditions, or schedule.
- Short copy stays fully visible. Long copy has a labeled, reversible “Show all details” action; shared/calendar text continues to use the unformatted source.
- Public business profiles use a full-width page with 16-point content gutters and a safe-area-aware, sticky navigation bar. Keep the existing section order. Profile actions are evenly distributed across the top row; the city and category share the next row, followed by the business name. Favorite guidance is quiet text rather than another callout box.
- Use one restrained `theme.bgElevated` (`#161a22`) panel per deal on the app canvas. Keep calendar/share controls left and deal type right, then align the title with its coral price. Preserve every word, price, term, and schedule. Explicit weekday descriptions and operating hours use aligned label/value rows. Clearly written menu entries align the item name and price, with their original parenthesized description beneath. Sort comparable, explicitly priced items from cheapest to most expensive within each menu section, preserving ties and keeping discounts in their original slots. Do not compare discount amounts, ranges, add-ons, ambiguous offers, or weekday-specific rows as ordinary purchase prices, and do not sort across headings, notes, or schedule boundaries. This is presentation only, and sharing/calendar content continues to use the original source. Supporting copy uses dividers rather than nested cards. Social links remain an evenly spaced two-column layout, with the full handle allowed to wrap; TikTok uses its actual brand icon.
- Section headings, compact spacing, and quiet rules define the profile hierarchy. Contact details, reviews, ownership controls, supporting details, and correction reporting flow directly on the page. The map and supplied business photos retain a modest rounded media frame. Prices and key actions use the existing coral tokens (`#ff5f68` / `#ff7a70`); body text stays `#f5f7fb` or the established secondary text token.
- Profile photo cards use only business images already supplied to the app. When none exist, omit the Photos section entirely so it leaves no placeholder or reserved space. Business editing and account pages share the profile's dark/coral language, with quiet section dividers instead of a large outer card.

## Interaction and layout

- The happy-hour sheet keeps its existing collapsed and expanded stops. The header and handle are drag surfaces, while the list owns normal scrolling. Pulling down at the top collapses the sheet.
- Deal cards retain a clear action hierarchy: opening the business is primary; calendar, share, and favorite are separate controls. The last card must scroll above the bottom navigation and safe area.
- Motion communicates the sheet's state and should settle promptly. Do not add decorative motion or make deal text animate while scrolling.
- Public profile photos page horizontally with a visible position counter when multiple images exist. Long profile descriptions use a short native layout transition when expanded or collapsed; disable that transition when Reduce Motion is enabled. Avoid separate entrance animations for every section.

## Consistency rules

- Customer signup, business search, claim/create forms, and their verification/status screens use the public profile's dark/coral language with 16-point page gutters. Content flows directly on the page, without the old light outer card and doubled padding. Coral-marked headings and quiet rules distinguish account details, names, business contact, socials, deals, hours, photos, and verification documents. Keep existing field/section order, copy, conditional requirements, consent, uploads, and navigation unchanged. These are visual groups on the same scrollable form, not new wizard steps or disclosures. The shared deal/hours editors accept an optional heading style in claims and dashboard editing; their behavior stays unchanged.
- Login, username/password recovery, customer/business dashboards, and their business-profile, favorites, notification, and account-settings pages reuse `src/styles/accountStyles.ts` and the visual-only `AccountSection` primitive. Use the same page gutters, compact intro, coral-marked headings, dark inputs, and field spacing as onboarding. Dashboard action buttons fill the available width; individual saved businesses, notifications, QR codes, and setup keys keep their purposeful surfaces. Preserve all existing controls, information order, account-type conditions, save payloads, authentication/recovery behavior, and destructive-action safeguards. Support and legal document pages retain their existing styling.
- Onboarding and logged-in dashboard, business-profile, and account-settings fields share `AutoScrollTextInput` and `useAutoScrollForm`. Forward focus and blur callbacks together with the form's scroll ref; dashboard field wrappers require that complete controller contract. Keep the established 140-point keyboard clearance. Typing alone must not retrigger scrolling, and blur, keyboard dismissal, or a manual drag cancels pending focus scrolling.
- Reuse `DealDescription` in public details and owner preview; do not create business-specific formatting exceptions.
- Business owners and admins can enter menu items as repeatable name, price, and detail fields; keep the optional general description available for existing notes. Preview those entries with the same `DealDescription` formatter used on public profiles so legacy free-text deals remain untouched.
- Each menu item can use either a separate price column or a weekday label. Weekday mode uses explicitly selected days on the left and the complete offer (including any entered price) on the right, never a third price column. Switching layouts preserves names, prices, and details. Weekday rows stay in entry order instead of being price-sorted; day labels do not replace the deal's overall availability schedule. Existing items without selected days retain their current price layout, and legacy descriptions are not rewritten. Keep this choice consistent in claims, dashboard editing, admin overrides, and previews.
- Dashboard and claim deal editing share `BusinessDealsEditor`; claimed and unclaimed admin deal editing share the structured deal widget. Use numbered sections (not a gated wizard): promotion heading/type, what customers get, availability/restrictions, optional mobile attachments, and review. The deal title names the whole promotion; only menu-item fields name individual food or drinks. Keep headline pricing and the single-offer/general-note fields in independent optional disclosures that open for existing values. Collapsing them never clears data. Align field labels and examples across mobile and admin.
- Deal forms use `theme.bgRaised` for the outer card, quiet dividers for sections/items, `theme.bgInput` for inputs, persistent labels, 14–16-point field spacing, and 44-point minimum action targets. Avoid another nested card around every item. The admin widget's scoped `--deal-editor-*` roles mirror `src/styles/theme.ts` and are shared by deal and operating-hour editors; do not change the surrounding admin or other widgets. Its deal-type dropdown stays browser-owned. Deal and hours previews follow the same dark/coral profile hierarchy and update while values are entered. Item ordering, validation, attachment limits, save/claim submission, schedule grouping, and existing public-profile formatting retain their established behavior. No data conversion or migration is part of this form refresh.
- Keep controls labeled for accessibility and usable by tapping as well as dragging.
- Do not scrape or substitute venue photos as part of this UI change. Existing licensed/owner-provided photo behavior stays unchanged.
