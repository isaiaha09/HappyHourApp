export const LEGAL_EFFECTIVE_DATE = 'September 2, 2026';

export type LegalDocumentSection = {
  title: string;
  body: string;
};

export const privacyPolicySections: ReadonlyArray<LegalDocumentSection> = [
  {
    title: '1. Scope and contact',
    body: 'This Privacy Policy explains how DiningDealz collects, uses, shares, retains, and protects information when you use the DiningDealz app, website, account dashboard, business tools, messaging features, and related services. The privacy contact is support@diningdealz.com. Use that address for privacy questions, access or deletion requests, security concerns, or complaints. We may verify your identity before completing a request. Do not email passwords, Social Security numbers, government ID numbers, or unnecessary verification documents.',
  },
  {
    title: '2. Information we collect',
    body: 'Depending on how you use the Service, we may collect account and security information such as username, email, names, account type, password hash/credential, authentication/session tokens, email verification, password reset, two-factor authentication, and deletion state. DiningDealz does not need your plaintext password to operate the account. Business users may provide contact name, role, work email and phone, employer or business address, authority and claim information, websites, social links, business details, offers, hours, supporting explanations, verification documents, uploaded-file names and metadata, document-validation or review results, and verification-consent date/version. Please provide only documents you are authorized to submit and redact unrelated sensitive information whenever possible.',
  },
  {
    title: '3. Content, preferences, and activity',
    body: 'We may collect business photos, deal images, profile links, offers, hours, public posts, direct-message text, business-sent direct-message images, report reasons and details, and optional report screenshots. We also create service records such as favorites, notification settings and delivery history, preferred cities/days/time periods, session keys, request IDs, account status, verification results, and safety decisions. This release does not offer paid content, subscriptions, purchases, or sponsored campaign features. Public business content is different from direct messages and report evidence, which are not public by default.',
  },
  {
    title: '4. Location, device, and technical information',
    body: 'When a customer grants location permission, the app may use current or last-known device location to calculate nearby results and map context. Ordinary customer browsing location is not required to create an account. An approved service-area or mobile business may enable background live-location features; those features send coordinates, accuracy, timestamps, and address/city information to DiningDealz to update that business’s public location. We may also process IP-related request information, browser and operating-system details, app/device and installation identifiers, push-notification tokens, error diagnostics, request logs, and information processed by hosting, storage, security, mapping, email, bot-protection, or monitoring providers. Web sign-in uses an HttpOnly session cookie; the bearer token is not exposed to browser JavaScript or stored in localStorage.',
  },
  {
    title: '5. Sources and uses',
    body: 'We receive information from you, your device or browser, other users such as a message participant or report submitter, business representatives and reviewers, public or licensed business-data sources, and service providers. We use it to provide accounts, authentication, discovery, favorites, profiles, deals, happy-hour features, messaging, business tools, verification and support; send account and optional notifications; prevent spam, fraud, abuse, security incidents, and harmful content; moderate images with the local NudeNet model where enabled; improve reliability and safety; comply with law; and protect rights. This release does not use information for paid content, subscriptions, purchases, or sponsored campaign features. Depending on context, the legal basis may be contract, consent, legitimate interests, or legal obligation.',
  },
  {
    title: '6. Sharing and public information',
    body: 'Approved business profiles may show business names, locations or approximate locations, addresses, phone numbers, websites, social links, deals, hours, public posts, and selected photos. When you send a direct message, the recipient can view it; messages may be reported, reviewed for safety or support, and retained. We may share information with authorized DiningDealz reviewers and service providers for hosting, databases, private/public media storage, email, bot protection, error monitoring, mapping/geocoding, push notifications, or support. This release does not connect to a payment provider or billing service. Business claim details and file names may be included in review emails. Report screenshots may be stored privately and sent to the configured support inbox. The web contact form sends entered information to the website for abuse screening and prepares an email draft; it is sent to support only if you choose to send it.',
  },
  {
    title: '7. Moderation, sale, and tracking',
    body: 'When automated image screening is enabled, uploaded business profile photos, deal images, and business direct-message images are processed locally on the DiningDealz backend with the bundled NudeNet model for exposed-nudity screening. The current implementation does not send those image bytes to a separate moderation API. Based on the current Service configuration and operational records reviewed as of September 2, 2026, DiningDealz has not sold personal information or shared it for cross-context behavioral advertising in the preceding 12 months. The Service does not currently use an advertising network, data broker, IDFA-based ad measurement, cross-app behavioral tracking SDK, sponsored campaign feature, payment provider, or billing service. This section must be updated if those practices change.',
  },
  {
    title: '8. Retention and deletion',
    body: 'We keep information only as reasonably necessary for the purpose collected, the Service, safety and fraud prevention, disputes, legal obligations, and operational records; provider backups or legal holds may last longer. Account deletion from in-app Settings revokes sessions and removes or anonymizes the account and managed business materials that DiningDealz is not required to keep. Limited records may remain for legal, fraud, security, moderation, audit, dispute, or conversation-history purposes. Public source data may remain independently. Direct-message records may remain for another participant; business direct-message images are designed to disappear after about 24 hours but expiry is not guaranteed to be immediate. Reports, screenshots, support emails, review notes, and operational logs may be retained as needed.',
  },
  {
    title: '9. Choices and privacy requests',
    body: 'You can edit certain profile information, remove selected files or photos before submitting a claim, manage favorites and notification preferences, block or unblock messaging participants, and control device permissions. For access, correction, deletion, or another privacy request, email support@diningdealz.com with the subject “Privacy Request” and identify the account or record involved. We may request reasonable verification and may limit a request where permitted by law. California residents may also have rights to know/access, delete, correct, opt out of sale or sharing, limit certain uses of sensitive personal information, and receive equal treatment if the California Consumer Privacy Act applies. We have not sold or shared information for cross-context behavioral advertising. If applicable law gives you rights in another region, including access, correction, deletion, restriction, objection, portability, withdrawal of consent, or complaint to a supervisory authority, we will handle the request under that law.',
  },
  {
    title: '10. Children',
    body: 'The Service is for a general audience and is not directed to children under 13. We do not knowingly collect personal information from a child under 13. If we learn that a child under 13 provided personal information, contact support@diningdealz.com and we will take appropriate steps to delete it, subject to legal and safety exceptions. Business accounts and verification submissions must be made by people legally able to make the representations they submit. If you are a California registered user under 18 and want content or information that you posted removed, email support@diningdealz.com with your account username and the specific post, profile, or message location. We will provide instructions or remove the content where applicable. Removal may not eliminate copies retained by another person, a public source, a provider backup, or as required by law.',
  },
  {
    title: '11. Security and external services',
    body: 'We use reasonable technical and organizational safeguards appropriate to the information and risk, including authentication controls, access restrictions, private media storage and signed access where configured, upload validation, abuse protection, moderation, and monitoring. No system is completely secure. Device operating systems, maps, email apps, app stores, social websites, and other linked services may collect information under their own notices. DiningDealz does not control those independent practices. The Service does not currently respond to browser Do Not Track signals because it does not use cross-context advertising or tracking.',
  },
  {
    title: '12. Changes',
    body: 'This Policy is effective August 30, 2026. We may update it as the Service, providers, or legal requirements change. The “Last updated” date identifies the current version. For material changes, we will provide notice through the Service, by email, or by another legally required method before the change takes effect when required. We will not quietly apply a materially broader use of previously collected information without the notice or consent required by law.',
  },
];

export const termsOfServiceSections: ReadonlyArray<LegalDocumentSection> = [
  {
    title: '1. Agreement and changes',
    body: 'These Terms of Service and Agreements govern your access to and use of the DiningDealz app, website, account dashboard, business tools, messaging features, and related services. By accessing or using the Service, creating an account, or continuing after an update becomes effective, you agree to these Terms and the Privacy Policy. If you do not agree, do not use the Service. The current DiningDealz release is free to use and does not offer paid content, subscriptions, purchases, checkout, billing portal access, or paid account features. The current version took effect on September 2, 2026.',
  },
  {
    title: '2. Eligibility and authority',
    body: 'The Service is for a general audience and is not directed to children under 13. You may not use it if you are under 13. If you are between 13 and the age of majority where you live, use it only with any permission required from a parent or guardian. Business accounts and claims must be created by an adult legally able to bind or represent the business. You are responsible for complying with laws that apply to you, your business, offers, messages, and device or location features.',
  },
  {
    title: '3. Accounts and security',
    body: 'Provide accurate, current information and keep it updated. You are responsible for your credentials and activity through your account, except to the extent unauthorized activity resulted from DiningDealz’s failure to use reasonable safeguards. Do not share credentials, impersonate another person or business, or create an account without authority. Tell support@diningdealz.com promptly if an account, token, password, claim, or message may be compromised. We may require verification, security checks, or two-factor authentication and may limit access to protect the Service.',
  },
  {
    title: '4. Listings, deals, and merchant relationships',
    body: 'DiningDealz may display listings, locations, hours, deals, happy-hour information, public posts, and notifications from businesses, source data, and providers. Information may be incomplete, delayed, changed, unavailable, or wrong; a map pin or live location may be approximate. DiningDealz does not sell food, drinks, alcohol, products, admissions, reservations, or merchant services and is not a party to your transaction with a business. Confirm prices, hours, restrictions, availability, allergens, taxes, fees, age requirements, and redemption rules directly with the business. Businesses are solely responsible for their listings, offers, services, licenses, taxes, age verification, health and safety, and fulfillment. This release does not offer paid content, subscriptions, purchases, or sponsored placements.',
  },
  {
    title: '5. Business claims and verification',
    body: 'A business user represents that they are authorized to claim, create, or manage the profile and submit the contact information, work details, links, photos, offers, hours, permits, registrations, and other materials provided. Do not submit documents belonging to another person or business without permission. Do not upload Social Security numbers, passport numbers, driver’s-license numbers, payment-card numbers, or other unnecessary sensitive data. DiningDealz may review, validate, request more information about, approve, reject, limit, suspend, or remove a claim or business content. Review does not guarantee ownership, licensing, safety, accuracy, or ongoing eligibility. Businesses must keep public information and live-location updates accurate.',
  },
  {
    title: '6. User content and license',
    body: 'You retain ownership of photos, text, posts, messages, business information, links, offers, hours, reports, and supporting materials you submit (“User Content”). You represent that you have the rights and permissions needed to submit it. You grant DiningDealz a non-exclusive, worldwide, royalty-free license to host, store, reproduce, format, technically adapt, display, publish, transmit, and distribute User Content solely to provide, maintain, secure, moderate, support, and improve the Service and the related profile or conversation. For public content, this includes making it available to other users. The active-system license ends when content or the account is deleted, except for backups, legal or moderation records, reports, messages received by another user, or other limited retention described in the Privacy Policy. DiningDealz does not acquire ownership of User Content.',
  },
  {
    title: '7. Prohibited conduct and content',
    body: 'You may not use the Service for unlawful, unsafe, deceptive, abusive, or rights-violating conduct. This includes false claims, fake offers, impersonation, fraud, harassment, threats, stalking, hate, sexual exploitation, child sexual abuse material, non-consensual intimate content, excessively violent or pornographic material, doxxing, unnecessary identity documents, unlawful surveillance, infringement, malware, spam, scraping, bulk extraction, unauthorized advertising, bypassing authentication or moderation, disrupting or probing the Service without authorization, or using the Service while driving. Do not rely on the Service as an emergency, medical, safety, legal, tax, financial, or professional service.',
  },
  {
    title: '8. Direct messages, reports, and moderation',
    body: 'Direct messages are not a guaranteed private or secure channel. A recipient can read, copy, screenshot, report, or retain a message. DiningDealz may access messages, metadata, and uploaded images for delivery, support, safety, moderation, abuse prevention, legal compliance, or a report. Business direct-message images are intended to disappear after about 24 hours, but expiry is not guaranteed to be immediate and does not remove copies already received, reported, cached, or backed up. The Service provides reporting and blocking tools for supported content and messages. DiningDealz may filter, review, restrict, remove, or preserve content, accounts, or conversations but does not promise to monitor everything. Do not use it to contact emergency services.',
  },
  {
    title: '9. Location, permissions, and safety',
    body: 'Device permissions are optional unless a feature cannot work without them. Customer location may be used to show nearby places and map context. Approved service-area and mobile businesses may opt into background location so a public pin can be updated. You can manage permissions in the app or device settings. Location displays can be stale, approximate, or affected by device, network, map, or source-data errors. Use judgment and verify important information directly; do not visit, purchase from, consume products from, or share sensitive information with a business or user solely because it appears in DiningDealz.',
  },
  {
    title: '10. Notifications and current release availability',
    body: 'DiningDealz may send transactional messages about verification, password resets, support, direct messages, account security, claims, and service changes. Optional push notifications about favorites, offers, business updates, or happy-hour activity can be controlled in the app or device settings. The current release has no paid content, subscriptions, purchases, checkout, billing portal, payment processing, or paid account features. Nothing in the app is unlocked through payment. We will update these Terms before introducing a feature that changes this availability.',
  },
  {
    title: '11. Privacy and third parties',
    body: 'The Privacy Policy explains how information is collected, used, shared, retained, and deleted. The Service may link to or interoperate with app stores, maps, calendars, social platforms, email apps, hosting/storage, notification, security, monitoring, and data-source providers. No payment provider or billing service is connected to the current release. Those parties control their own services and notices. DiningDealz is not responsible for third-party content, availability, security, privacy, or disputes. Review third-party terms before using an external feature.',
  },
  {
    title: '12. Intellectual property and copyright complaints',
    body: 'The Service, including its software, design, text, branding, logos, compilation, features, and DiningDealz materials, is owned by or licensed to DiningDealz. You receive only a limited, revocable, non-exclusive, non-transferable license to use it for its intended personal or internal business purpose. You may not copy, sell, sublicense, frame, modify, distribute, reverse engineer, or create derivative works except where law does not allow that restriction. For a copyright complaint, email support@diningdealz.com with identification of the work, the Service URL or location, contact information, a good-faith statement, an accuracy/authority statement under penalty of perjury, and a physical or electronic signature.',
  },
  {
    title: '13. Suspension, termination, and deletion',
    body: 'DiningDealz may suspend, restrict, or terminate access, remove content, disable messaging or location features, or decline a claim when reasonably necessary to protect users, businesses, the Service, or the public; enforce these Terms; respond to legal process; investigate fraud or security; or address risky conduct. You may request account deletion from in-app Settings. Deletion is intended to remove the account and user-managed content DiningDealz is not legally required to keep. It does not erase copies retained by another user, a public source, a support inbox, provider backup, legal hold, report, or conversation needed for another participant. Ownership, disclaimers, liability limits, indemnity, and other provisions that should survive termination remain effective.',
  },
  {
    title: '14. Disclaimers and liability limits',
    body: 'TO THE FULLEST EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” DININGDEALZ DISCLAIMS WARRANTIES NOT EXPRESSLY PROVIDED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS, TITLE, NON-INFRINGEMENT, ACCURACY, RELIABILITY, AND AVAILABILITY. DiningDealz does not promise that any listing, deal, location, message, public post, business, notification, moderation decision, or third-party service will be accurate, current, uninterrupted, secure, safe, lawful, or available. To the fullest extent permitted by law, DiningDealz and its owners, affiliates, officers, employees, contractors, service providers, and licensors are not liable for indirect, incidental, special, consequential, exemplary, or punitive damages or lost profits, revenue, data, goodwill, or business interruption. Total liability for claims related to the Service or Terms will not exceed US$100. Nothing limits liability or rights that applicable law does not permit to be limited.',
  },
  {
    title: '15. Indemnification and general terms',
    body: 'To the extent permitted by law, you agree to defend, indemnify, and hold harmless DiningDealz and its owners, affiliates, officers, employees, contractors, service providers, and licensors from claims, losses, liabilities, damages, costs, and reasonable attorneys’ fees arising from your User Content, business claim, offer, service, representation, use or misuse of the Service, violation of these Terms or another person’s rights, or violation of law. Before a formal dispute, please contact support@diningdealz.com with the issue and requested resolution. Mandatory law where you live controls non-waivable rights and remedies. These Terms and the Privacy Policy are the current agreement unless a separate written agreement applies. If a provision is unenforceable, it will be limited or severed and the rest will remain effective. A failure to enforce is not a waiver. Electronic notices and records satisfy writing requirements where permitted. Questions, notices, copyright complaints, privacy requests, and support issues may be sent to support@diningdealz.com.',
  },
];
