import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Read the DiningDealz privacy policy covering account, location, messaging, business, and website data.",
};

const EFFECTIVE_DATE = "August 30, 2026";
const PRIVACY_CONTACT = "support@diningdealz.com";

type PrivacySectionData = {
  title: string;
  paragraphs: readonly string[];
  items?: readonly string[];
  paragraphsAfter?: readonly string[];
};

const privacySections: readonly PrivacySectionData[] = [
  {
    title: "1. Scope and contact",
    paragraphs: [
      "This Privacy Policy explains how DiningDealz (\"DiningDealz,\" \"we,\" \"us,\" or \"our\") collects, uses, shares, retains, and protects information when you use the DiningDealz mobile app, website, account dashboard, business tools, messaging features, and related services (together, the \"Service\").",
      `The privacy contact for the Service is ${PRIVACY_CONTACT}. Use that address for privacy questions, requests to access or delete information, security concerns, or complaints. We may need to verify your identity before completing a request. Do not email passwords, Social Security numbers, government ID numbers, or unnecessary verification documents.`,
    ],
  },
  {
    title: "2. Information we collect",
    paragraphs: ["The information we collect depends on how you use the Service. It may include the following categories."],
    items: [
      "Account and security information: username, email address, first and last name, account type, password hash/credential, authentication/session tokens, email-verification status, password-reset state, two-factor-authentication state, and account deletion state. DiningDealz does not need your plaintext password to operate the account.",
      "Business and verification information: contact name, job title, work email, work phone, employer or business address, business authority and claim information, business website and social links, business profile details, offers, hours, supporting explanations, verification documents, uploaded-file names and metadata, document-validation or review results, and the date/version of verification consent. Only submit documents you are authorized to provide. Redact unrelated sensitive information whenever possible.",
      "Content you submit: business photos, deal images, profile links, offers, hours, business posts, direct-message text, business-sent direct-message images, content-report reasons and details, and optional report screenshots. Some business profile information and photos are intended to be public; direct messages and report evidence are not public by default.",
      "Preferences and activity: favorite businesses, notification settings, preferred cities, days and time periods, notification delivery history, feed impressions and engagement such as opens or clicks, sponsored-campaign delivery metrics, session keys, request IDs, page/placement/position information, and similar records needed to operate and measure first-party features.",
      "Location information: when a customer grants location permission, the app may use current or last-known device location to calculate nearby results and map context. Ordinary customer browsing location is used by the app for that experience and is not required to create an account. An approved service-area or mobile business may separately enable background live-location features; those features send coordinates, accuracy, timestamps, and address/city information to DiningDealz to update that business's public location. You can turn that feature off in the app or device settings.",
      "Device, browser, and technical information: IP-related request information, browser and operating-system details, app/device identifiers, installation identifiers, push-notification tokens, error and diagnostic information, request logs, and information processed by security, hosting, storage, mapping, email, bot-protection, or monitoring providers. Web sign-in uses an HttpOnly session cookie; the bearer token is not exposed to browser JavaScript or stored in localStorage.",
      "Support and communications information: information in emails or support requests, business-claim review emails, verification messages, password-reset messages, and reports sent to the support team. The web contact form sends entered information to the website endpoint for abuse screening and prepares an email draft; the email is sent to support only if you choose to send it from your email app.",
      "Payment information: DiningDealz does not currently store payment-card numbers in the DiningDealz account system. If a paid feature or external billing portal is enabled, the payment provider shown at checkout or in that portal collects and processes payment information under its own notices and terms.",
    ],
  },
  {
    title: "3. Where information comes from",
    paragraphs: ["We receive information from you, from your device or browser, from other people who use the Service (for example, a direct-message participant or report submitter), from business representatives and authorized reviewers, from public or licensed business-data sources, and from service providers that process information for us. We may also create information from these sources, such as account status, verification results, notification history, feed metrics, safety decisions, and deletion or retention records."],
  },
  {
    title: "4. How we use information",
    paragraphs: ["We use information only for purposes connected with the Service and the purposes described when information is collected. These purposes include:"],
    items: [
      "Providing and personalizing the Service, including account creation, authentication, nearby discovery, favorites, business profiles, deals, happy-hour features, feed placement, direct messaging, and business tools.",
      "Verifying business authority, reviewing claims, checking submitted materials, communicating review decisions, and maintaining an accurate and safe business directory.",
      "Sending account, verification, password-reset, support, direct-message, favorite-business, business-update, and optional offer notifications.",
      "Preventing spam, fraud, abuse, unlawful activity, security incidents, and harmful or objectionable content; processing images with the local NudeNet screening model where enabled; investigating reports; and enforcing the Terms of Service.",
      "Operating, troubleshooting, monitoring, testing, maintaining, and improving the Service, including measuring first-party sponsored placements and engagement. Sponsored placements are not currently based on cross-app behavioral advertising.",
      "Complying with legal obligations, responding to lawful requests, protecting rights and safety, resolving disputes, and establishing or defending legal claims.",
    ],
    paragraphsAfter: ["Depending on the context, our legal basis may be performance of a contract with you, your consent, our legitimate interests in operating a safe and reliable service, or compliance with a legal obligation. You may withdraw permission for optional device features such as notifications or location through the device or app settings, but some Service features may then be unavailable."],
  },
  {
    title: "5. Public profiles, messages, and other disclosures",
    paragraphs: ["Approved business profiles may display business names, locations, addresses or approximate locations, phone numbers, websites, social links, deals, hours, public posts, and selected photos to other users. Some directory information may come from public or licensed source data rather than from the person viewing the profile.", "When you send a direct message, the intended recipient can view it. Messages may be accessed by the participants, reported to us, reviewed for safety or support, and retained as described below. Blocking a participant prevents further direct messaging through the applicable feature; it does not erase information that has already been received or retained by another participant.", "We do not sell personal information as part of the current Service and do not disclose it for cross-context behavioral advertising. We may disclose information to the following recipients or in the following situations:"],
    items: [
      "Service providers that host or secure the app, website, database, private/public media storage, email delivery, bot protection, error monitoring, mapping/geocoding, push notifications, or an enabled billing service. Providers may process technical information under their own privacy notices and contractual instructions.",
      "Authorized DiningDealz personnel, contractors, or reviewers who need access to handle business verification, support, moderation, security, or legal matters. Business claim details and document/file names may be included in support emails used to review a claim.",
      "The configured support inbox when a user submits a report with screenshot evidence or sends a support request. Report screenshots are stored in private media storage before or while they are sent for review.",
      "Other users when you publish content intended to be public or send a message to them.",
      "Authorities, advisors, or other parties when reasonably necessary to comply with law, enforce the Terms, investigate fraud or security issues, protect users or businesses, or handle a merger, acquisition, financing, reorganization, or sale of assets.",
    ],
    paragraphsAfter: ["When automated image screening is enabled, the image bytes for uploaded business profile photos, deal images, and business direct-message images are processed locally on the DiningDealz backend with the bundled NudeNet model for exposed-nudity screening. The current implementation does not send those image bytes to a separate moderation API. This description must be updated if the moderation provider or processing method changes."],
  },
  {
    title: "6. Sale, sharing, advertising, and tracking",
    paragraphs: [`Based on the current Service configuration and operational records reviewed as of ${EFFECTIVE_DATE}, DiningDealz has not sold personal information or shared it for cross-context behavioral advertising in the preceding 12 months. The Service does not currently use an advertising network, data broker, IDFA-based ad measurement, or cross-app behavioral tracking SDK. First-party sponsored campaigns, if enabled, may record impressions, clicks, opens, saves, or shares so that campaign delivery and reporting work; those records are not used to follow you across unrelated apps or websites.`, "If we introduce a practice that qualifies as a sale, sharing, targeted advertising, or tracking under applicable law, we will update this Policy, provide required notices and controls, and request device permission where required before using that practice."],
  },
  {
    title: "7. Retention and deletion",
    paragraphs: ["We keep information only for as long as reasonably necessary for the purpose collected, the Service, safety and fraud prevention, dispute handling, legal obligations, and legitimate operational records. Retention depends on the category and may be longer in provider backups or legal holds."],
    items: [
      "Account and security records are normally kept while the account is active. When an account is deleted, sessions and tokens are revoked and the account is deactivated or anonymized. Limited records may remain for legal, fraud, security, moderation, dispute, audit, or conversation-history purposes.",
      "Business verification documents, claim attachments, claim photos, links, consent records, and review information are normally kept while the claim or account is being handled. Account deletion removes managed verification materials and public business content where the system controls it, subject to limited retention described in this Policy.",
      "Public business content remains available while published. Deletion removes user-managed posts, campaigns, profile photos, attachments, and publication references where applicable; source or directory information supplied by third parties may remain or be republished independently of a deleted account.",
      "Direct-message records may remain for the other participant or for safety, moderation, and dispute purposes. Business direct-message images are designed to disappear from the conversation after about 24 hours and may be deleted from storage after expiry, but timing can be affected by caching, backups, reports, or legal holds.",
      "Reports, screenshots, support emails, review notes, and abuse/security records are kept as needed to investigate and respond, protect users, enforce rules, resolve disputes, and meet legal obligations. Copies in an email provider's inboxes or backups follow that provider's retention processes.",
      "Push-device registrations remain until disabled, replaced, or removed during account deletion. The latest live business location is kept while the feature is enabled or while needed to show the current business pin; the current implementation is not intended to maintain a historical route of customer movements.",
      "Operational logs, diagnostics, and provider records are retained according to operational need, provider policy, security requirements, and applicable law.",
    ],
  },
  {
    title: "8. Your choices and account deletion",
    paragraphs: ["You can edit certain profile information, remove selected files or photos before submitting a claim, manage favorites and notification preferences, block or unblock messaging participants, and control device permissions. You can request account deletion from the in-app Settings flow. Account deletion is intended to remove the account and associated user-managed data that DiningDealz is not required to keep, but it does not erase information already retained by another participant, a public source, a support inbox, or a backup, and limited records may remain for the reasons listed above.", `For privacy questions or a request to access, correct, delete, or otherwise exercise rights, email ${PRIVACY_CONTACT} with the subject \"Privacy Request.\" Tell us whether you are asking about an account, business claim, message, report, or another record. We may ask for reasonable information to verify the request and may deny or limit a request where permitted by law.`],
  },
  {
    title: "9. California privacy rights",
    paragraphs: [`If the California Consumer Privacy Act (CCPA), as amended, applies to DiningDealz and to you, California residents may have rights to know/access, delete, correct, opt out of sale or sharing, limit certain uses of sensitive personal information, and receive equal treatment. To exercise a right, email ${PRIVACY_CONTACT} with the subject \"California Privacy Request.\" We will verify requests, respond within the timelines required by applicable law, and explain any legally permitted exception. You may use an authorized agent where permitted; we may require proof of authorization.`, "For the preceding 12 months, the categories of personal information we may have collected include the following. The examples are not an expansion of the collection described in Section 2."],
    items: [
      "Identifiers and contact information, such as username, name, email, phone, account tokens, IP-related information, and device or installation identifiers.",
      "Commercial and transaction-related information, such as saved businesses, offer or campaign interactions, and billing-access status when applicable.",
      "Internet or other electronic network activity, such as sign-in activity, feed impressions, clicks, opens, request IDs, and app or website diagnostics.",
      "Geolocation information, including customer device location when granted and business live-location updates when enabled.",
      "Professional or employment-related information supplied for business verification, such as role, work contact information, and employer address.",
      "User-generated content and communications, including photos, posts, messages, reports, screenshots, support requests, and review materials.",
      "Inferences or preference information, such as selected cities, days, time periods, notification preferences, and favorite businesses.",
      "Sensitive personal information that may be present in account credentials, precise geolocation, message contents, work information, or submitted verification materials. We use it only as reasonably necessary to provide, secure, verify, support, and administer the Service, and not to infer characteristics about you.",
    ],
    paragraphsAfter: ["We disclose these categories to the service-provider, reviewer, support, public-profile, recipient, legal, and safety categories described in Section 5. We have not sold or shared these categories for cross-context behavioral advertising during the preceding 12 months. We do not currently offer a sale/share opt-out link because that activity does not occur; contact us if that changes or if you believe a request has been mishandled."],
  },
  {
    title: "10. Other regional rights",
    paragraphs: [`If data-protection law in the European Economic Area, United Kingdom, Switzerland, or another jurisdiction applies to you, you may have additional rights such as access, correction, deletion, restriction, objection, portability, withdrawal of consent, and the right to complain to a supervisory authority. We will handle requests under the law that applies to the relevant processing. Service providers may process information in countries other than where you live; where required, we use appropriate transfer safeguards. Contact ${PRIVACY_CONTACT} to make a request or ask about the applicable legal basis for a processing activity.`],
  },
  {
    title: "11. Children",
    paragraphs: [`The Service is for a general audience and is not directed to children under 13. We do not knowingly collect personal information from a child under 13. If we learn that a child under 13 provided personal information, contact ${PRIVACY_CONTACT} and we will take appropriate steps to delete it, subject to legal and safety exceptions. Business accounts and verification submissions must be made by people who are legally able to make the representations they submit.`, `If you are a California registered user under 18 and want content or information that you posted on the Service removed, email ${PRIVACY_CONTACT} with your account username and the specific post, profile, or message location. We will provide instructions or remove the content where applicable. Removal may not eliminate copies retained by another person, a public source, a provider backup, or as required by law.`],
  },
  {
    title: "12. Security",
    paragraphs: [`We use reasonable technical and organizational safeguards appropriate to the information and risk, including authentication controls, access restrictions, private media storage and signed access where configured, upload validation, abuse protection, moderation, and monitoring. No website, app, transmission, or storage system is completely secure, and we cannot promise that unauthorized access will never occur. If you believe there is a security issue, contact ${PRIVACY_CONTACT} promptly and do not publicly disclose sensitive details first.`],
  },
  {
    title: "13. Do-not-track signals and external services",
    paragraphs: ["The Service does not currently respond to browser Do Not Track signals because there is no cross-context advertising or tracking practice for those signals to control. Device operating systems, map components, email providers, app stores, social websites, payment providers, and other linked services may collect information under their own notices. DiningDealz does not control those independent practices. Review a third party's terms and privacy notice before using an external link, sharing content, opening a map, adding a calendar event, or completing payment."],
  },
  {
    title: "14. Changes to this Policy",
    paragraphs: [`We may update this Policy as the Service, providers, or legal requirements change. The \"Last updated\" date above identifies the current version. For a material change, we will provide notice through the Service, by email, or by another legally required method before the change takes effect when required. We will not quietly apply a materially broader use of previously collected information without the notice or consent required by law.`],
  },
] as const;

export default function PrivacyPage() {
  return (
    <main className="dd-site-shell px-6 py-10 lg:px-10 lg:py-14">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffd35a]">
          <span className="h-2 w-2 rounded-full bg-[#ff5c3c] shadow-[0_0_16px_#ff5c3c]" />
          Back to DiningDealz
        </Link>

        <section className="dd-panel gap-6 p-6 sm:p-8 lg:p-10">
          <div className="space-y-3">
            <p className="dd-kicker">Privacy Policy</p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">How DiningDealz collects and uses information.</h1>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ffb100]">Last updated: {EFFECTIVE_DATE}</p>
            <p className="text-base leading-8 text-[#f6d6c5]">
              This Privacy Policy explains what information DiningDealz collects, how that information is used, when it may be shared, how long it is kept, and what choices users have when using the DiningDealz app, website, and related services.
            </p>
          </div>

          {privacySections.map((section) => (
            <PrivacySection key={section.title} title={section.title} paragraphs={section.paragraphs} items={section.items} paragraphsAfter={section.paragraphsAfter} />
          ))}

          <div className="border-t border-white/10 pt-5 text-sm leading-7 text-[#f6d6c5]">
            <p>
              Privacy contact: <a className="font-semibold text-[#ffd35a] hover:text-white" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function PrivacySection({
  items,
  paragraphs,
  paragraphsAfter,
  title,
}: PrivacySectionData) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold text-[#ffe7d8]">{title}</h2>
      {paragraphs.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-[#f6d6c5]">{paragraph}</p>)}
      {items ? (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#f6d6c5]">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {paragraphsAfter?.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-[#f6d6c5]">{paragraph}</p>)}
    </section>
  );
}
