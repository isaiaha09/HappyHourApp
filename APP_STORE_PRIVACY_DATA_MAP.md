# App Store Privacy Data Map

This file maps the current DiningDealz implementation to the App Store Connect App Privacy questionnaire. It is an implementation reference, not a substitute for reviewing the current App Store Connect questions before submission.

## Business Verification

| Data category | Examples | Collection purpose | Linked to user | Used for tracking |
| --- | --- | --- | --- | --- |
| Contact Info | Name, email address, work email, work phone, business address | Account creation, verification, support, and business claim review | Yes | No |
| User Content | Business registration files, permits, proof of authority, address-control files, social links, website links, business photos, deal images, direct-message images, supporting details, deals, hours, business posts, content reports, report screenshots, and report details | Business verification, automated and staff moderation, profile creation, direct messaging, and public business profile display where applicable | Yes | No |
| Identifiers | Username, account identifiers, authentication tokens, verification status, Terms acceptance version/timestamp | Account access, authentication, security, and recording the version accepted at signup | Yes | No |
| Location | Business location updates for approved businesses that enable live location | Business map pin and location-based business features | Yes | No |
| Diagnostics | Error reports, request metadata, device or app identifiers, IP-related security information | Security, abuse prevention, reliability, and support | May be linked | No |

## Customer Accounts and App Use

| Data category | Examples | Collection purpose | Linked to user | Used for tracking |
| --- | --- | --- | --- | --- |
| Contact Info | Name, email address | Account creation, authentication, verification, support, and account recovery | Yes | No |
| Identifiers | Username, account identifiers, authentication/session tokens, push-notification token, Terms acceptance version/timestamp | Account access, notifications, security, and recording the accepted Terms version | Yes | No |
| Location | Current or last-known customer location when permission is granted; approximate map context | Nearby discovery and map features | May be linked | No |
| User Content | Direct-message text, business-sent direct-message images, content reports, optional report screenshots, favorites, and preferences | Messaging, safety review, personalization, and requested features | Yes | No |
| Usage Data | Feed impressions, opens, clicks, saved businesses, notification delivery history, request IDs, and page/placement/position data | First-party feature operation, reliability, safety, and sponsored-campaign reporting | May be linked | No |
| Diagnostics | Error reports, device/browser/app details, installation identifiers, IP-related request information, and logs | Authentication, abuse prevention, security, troubleshooting, and reliability | May be linked | No |

## Website and Support

| Data category | Examples | Collection purpose | Linked to user | Used for tracking |
| --- | --- | --- | --- | --- |
| Contact Info | Name, email address, subject, and support message | Abuse screening, preparing a contact email, and responding when the user sends it | May be linked | No |
| Diagnostics | Cloudflare Turnstile token and request/network information | Bot protection and abuse prevention | May be linked | No |

The categories above summarize the current implementation and must be reconciled with the production configuration and App Store Connect questionnaire before release. Service-provider handling does not change the collection purpose or the requirement to answer App Store Connect based on the app and its third parties.

## Handling Rules

- Verification documents are collected directly from the business user through the app's document picker.
- Business verification documents are stored in private media storage and are available only to authorized review and service operations.
- Selected profile photos, links, deals, and hours may become public business profile content after approval.
- Business verification materials are retained until account deletion.
- Account deletion clears claim attachments, uploaded profile photos, verification references, related business profile materials, and business-verification consent metadata from managed storage and the database. A versioned Terms acceptance record may remain as a limited legal/audit record.
- Limited records may remain only when needed for legal obligations, fraud or security investigations, dispute resolution, or read-only direct-message history for another participant.
- The business verification consent version recorded by the backend is `2026-08-16`.
- The Terms acceptance version recorded for new account/profile submissions is `2026-08-30`; older accounts may not have an acceptance record.
- DiningDealz does not use these business verification materials for advertising tracking.
- Content reports are reviewed by authorized DiningDealz staff and may be retained as moderation, security, dispute, or legal records. Optional report screenshots are stored in private media storage, attached to the support review email, and deleted when the reporting account is deleted.
- User-visible business profile photos, deal images, and business direct-message images are screened locally by the bundled MIT-licensed NudeNet model before storage or display. Production blocks exposed-nudity detections at the configured score threshold and fails closed if the local model cannot run.
- Image bytes used by the local moderation model remain on the DiningDealz backend and are not sent to a separate moderation provider. Server CPU, memory, storage, and hosting remain ordinary app infrastructure costs.
- Customers and businesses can block or unblock the other participant in direct messages. A block prevents new messages in that thread until it is removed.
- When a business account is deleted, its business-authored posts and sponsored campaigns are deleted, its business claim materials are cleared, and its business profile is suppressed from public map and detail results. Read-only direct-message history may remain for the other participant as described in the privacy policy.

## Submission Checks

Before App Store submission, verify that:

- The App Store Connect privacy policy URL is the production privacy policy URL.
- The App Privacy answers match production providers, including hosting, database, private media storage, email, bot protection, monitoring, mapping, and push notification services.
- The production private storage bucket is not public and does not use an unrestricted public URL.
- Account deletion has been tested against production storage, not only the local database.
- The App Review notes explain how to reach the business registration screen and provide a working reviewer account or approved demo path.
