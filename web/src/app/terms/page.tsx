import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Read the DiningDealz terms governing customer, business, and website use of the service.",
};

const EFFECTIVE_DATE = "September 2, 2026";
const SUPPORT_EMAIL = "support@diningdealz.com";

type TermsSectionData = {
  title: string;
  paragraphs: readonly string[];
  items?: readonly string[];
  paragraphsAfter?: readonly string[];
};

const termsSections: readonly TermsSectionData[] = [
  {
    title: "1. Agreement and changes",
    paragraphs: [
      "These Terms of Service and Agreements (\"Terms\") govern your access to and use of the DiningDealz mobile app, website, account dashboard, business tools, messaging features, and related services (together, the \"Service\"). DiningDealz is a discovery and communication platform for customers and businesses.",
      "By accessing or using the Service, creating an account, or continuing to use the Service after an update becomes effective, you agree to these Terms and the Privacy Policy. If you do not agree, do not access or use the Service. The current DiningDealz release is free to use and does not offer paid content, subscriptions, purchases, checkout, billing portal access, or paid account features.",
      `The current version took effect on ${EFFECTIVE_DATE}. We may change these Terms as the Service or law changes. We will post the updated version and, for material changes, provide notice through the Service, by email, or by another method required by law before the change takes effect.`,
    ],
  },
  {
    title: "2. Eligibility and authority",
    paragraphs: [
      "The Service is for a general audience and is not directed to children under 13. You may not use it if you are under 13. If you are between 13 and the age of majority where you live, use the Service only with any permission required from a parent or guardian. Business accounts and business claims must be created by an adult who is legally able to bind the business or who has authority to represent it.",
      "You are responsible for complying with laws that apply to you, your business, your offers, your messages, and your use of location or device features. DiningDealz does not provide legal, licensing, tax, medical, financial, or food-safety advice.",
    ],
  },
  {
    title: "3. Accounts and security",
    paragraphs: [
      "You must provide accurate, current information and keep it updated. You are responsible for your account credentials and for activity conducted through your account, except to the extent unauthorized activity resulted from DiningDealz's failure to use reasonable safeguards. Do not share credentials, impersonate another person or business, or create an account for someone without authority.",
      `Tell us promptly at ${SUPPORT_EMAIL} if you believe an account, token, password, business claim, or message has been compromised. We may require email verification, additional security checks, or two-factor authentication and may refuse, limit, or revoke access when needed to protect the Service.`,
    ],
  },
  {
    title: "4. Listings, deals, and merchant relationships",
    paragraphs: [
      "DiningDealz may display business listings, locations, hours, deals, happy-hour information, public posts, and notifications from businesses, source data, and other providers. Information can be incomplete, delayed, changed, unavailable, or wrong. A map pin or live business location may be approximate and is not a guarantee that a business is open or present at that location.",
      "DiningDealz is not the restaurant, bar, shop, vendor, or other merchant shown in a listing. DiningDealz does not sell food, drinks, alcohol, products, admissions, reservations, or other merchant services and is not a party to the transaction between you and a business. Confirm current prices, hours, restrictions, availability, age requirements, allergens, taxes, fees, and redemption rules directly with the business before relying on a listing or offer.",
      "Businesses are solely responsible for the truthfulness, legality, availability, pricing, terms, redemption, licensing, taxes, age verification, health and safety, and fulfillment of their listings, offers, services, and public content. The current release does not offer paid content, subscriptions, purchases, or sponsored placements.",
    ],
  },
  {
    title: "5. Business accounts, claims, and verification",
    paragraphs: [
      "A business user represents that they are authorized to claim, create, or manage the business profile and to submit the contact information, work details, links, photos, offers, hours, permits, registrations, and other verification materials they provide. Business users must not submit documents belonging to another person or business without permission and should redact unrelated sensitive information. Do not upload Social Security numbers, passport numbers, driver's-license numbers, payment-card numbers, or other unnecessary sensitive data.",
      "DiningDealz may review, validate, request more information about, approve, reject, limit, suspend, or remove a claim or business content. Review does not guarantee ownership, licensing, safety, accuracy, or ongoing eligibility. The business remains responsible for its legal and commercial obligations after approval.",
      "Businesses must keep public business information, offers, hours, links, photos, and live-location updates accurate and must promptly correct or remove information that is no longer true. A business using live location represents that it has permission and authority to send the location and must not use the feature to track a person or vehicle unlawfully.",
    ],
  },
  {
    title: "6. User content and license",
    paragraphs: [
      "You retain ownership of content you submit, including photos, text, posts, messages, business information, links, offers, hours, reports, and supporting materials (\"User Content\"). You represent that you have the rights and permissions needed to submit it and that it does not violate law, another person's rights, or these Terms.",
      "You grant DiningDealz a non-exclusive, worldwide, royalty-free license to host, store, reproduce, format, adapt as technically necessary, display, publish, transmit, and distribute your User Content solely to provide, maintain, secure, moderate, support, and improve the Service and the related business profile or conversation for which it was submitted. For content intended to be public, this includes making it available to other Service users. The license ends for active systems when you delete the content or account, except for copies retained in backups, legal records, moderation records, reports, messages received by another user, or other limited situations described in the Privacy Policy.",
      "You allow DiningDealz to use your name, username, business name, and the context of User Content as needed to display it in the Service. DiningDealz does not acquire ownership of your User Content and does not use private verification documents or direct-message content for unrelated advertising or generative-AI training under this Policy.",
    ],
  },
  {
    title: "7. Prohibited conduct and content",
    paragraphs: ["You may not use the Service to do anything unlawful, unsafe, deceptive, abusive, or that interferes with another person's rights or with the Service. Prohibited conduct includes:"],
    items: [
      "Submitting false business claims, fake offers, impersonation, fraud, phishing, or misleading information; or claiming a business without authority.",
      "Harassing, threatening, stalking, intimidating, exploiting, or targeting another person; posting hate, sexual exploitation, child sexual abuse material, non-consensual intimate content, or excessively violent or pornographic material.",
      "Doxxing, exposing private information, uploading unnecessary identity documents, or using messages, reports, or location features to facilitate harm or unlawful surveillance.",
      "Uploading content that infringes copyright, trademark, privacy, publicity, confidentiality, or other rights; or using content without the permissions required by law.",
      "Sending spam, malware, harmful code, automated requests, scraping or bulk extraction, unauthorized advertising, or messages intended to deceive, manipulate, or distribute prohibited material.",
      "Attempting to bypass authentication, rate limits, moderation, upload checks, access controls, or account restrictions; reverse engineering or disrupting the Service; or probing it for vulnerabilities without authorization.",
      "Using the Service while driving or in a way that distracts from traffic, food, alcohol, business, or personal safety; or relying on the Service as an emergency, medical, safety, or professional service.",
    ],
  },
  {
    title: "8. Direct messages, reports, and moderation",
    paragraphs: [
      "Direct messages are not a guaranteed private or secure channel. A recipient can read, copy, screenshot, report, or retain a message. DiningDealz may access messages, message metadata, and uploaded images when needed for delivery, support, safety, moderation, abuse prevention, legal compliance, or a report. Business direct-message images are intended to disappear from the conversation after about 24 hours, but expiry is not guaranteed to be immediate and does not remove copies already received, reported, cached, or backed up.",
      `The Service provides reporting and blocking tools for supported business content and direct messages. You should use them for abuse or safety concerns and contact ${SUPPORT_EMAIL} when you need help. DiningDealz may filter, review, restrict, remove, or preserve User Content, accounts, or conversations, but does not promise to monitor everything or remove every objectionable item. Do not use the Service to contact emergency services; call the appropriate emergency number instead.`,
    ],
  },
  {
    title: "9. Location, device permissions, and safety",
    paragraphs: [
      "Device permissions are optional unless a feature cannot work without them. Customer location may be used by the app to show nearby places and map context. Approved service-area and mobile businesses may opt into background location so their public business pin can be updated. You can manage permissions through the app or device settings. Location displays can be stale, approximate, or affected by device, network, map, or source-data errors.",
      "You are responsible for using the Service safely and for protecting your own personal information. Do not meet, visit, purchase from, consume products from, or share sensitive information with a business or user solely because it appears in DiningDealz. Use independent judgment and verify important information directly.",
    ],
  },
  {
    title: "10. Notifications and current release availability",
    paragraphs: [
      "DiningDealz may send transactional or account messages about verification, password resets, support, direct messages, account security, claims, and service changes. Push notifications about favorites, offers, business updates, or happy-hour activity are optional and can be controlled in the app or device settings.",
      "The current release has no paid content, subscriptions, purchases, checkout, billing portal, payment processing, or paid account features. Nothing in the Service is unlocked through payment. We will update these Terms before introducing a feature that changes this availability.",
    ],
  },
  {
    title: "11. Privacy and third-party services",
    paragraphs: ["Our Privacy Policy explains how information is collected, used, shared, retained, and deleted. By using the Service, you acknowledge that the practices described there apply to you.", "The Service may link to or interoperate with third-party websites, app-store services, map components, calendars, social platforms, email apps, hosting/storage providers, notification providers, security services, monitoring tools, and data sources. No payment provider or billing service is connected to the current release. Those parties control their own services and terms. DiningDealz is not responsible for third-party content, availability, security, privacy practices, or disputes. Review third-party terms before using an external feature."],
  },
  {
    title: "12. DiningDealz intellectual property",
    paragraphs: ["The Service, including its software, design, text, branding, logos, compilation, features, and materials created by DiningDealz, is owned by or licensed to DiningDealz and protected by intellectual-property laws. Subject to these Terms, DiningDealz grants you a limited, revocable, non-exclusive, non-transferable license to use the Service for its intended personal or internal business purpose. You may not copy, sell, sublicense, frame, modify, distribute, reverse engineer, or create derivative works from the Service except where law does not allow that restriction.", "If you send suggestions or feedback, you grant DiningDealz a perpetual, irrevocable, worldwide, royalty-free right to use it without compensation or attribution, provided we do not identify private verification or message content as feedback without permission."],
  },
  {
    title: "13. Copyright complaints",
    paragraphs: [`If you believe User Content infringes your copyright, email ${SUPPORT_EMAIL} with: (1) identification of the copyrighted work; (2) the Service URL or other location of the allegedly infringing material; (3) your contact information; (4) a good-faith statement that the use is not authorized; (5) a statement, under penalty of perjury, that the information is accurate and that you are authorized to act; and (6) your physical or electronic signature. We may remove content, restrict access, or terminate repeat infringers where appropriate. This reporting email is not a substitute for any formal notice address that applicable law requires the operator to designate.`],
  },
  {
    title: "14. Suspension, termination, and account deletion",
    paragraphs: [
      "DiningDealz may suspend, restrict, or terminate your account or access, remove User Content, disable messaging or location features, or decline a business claim when reasonably necessary to protect users, businesses, the Service, or the public; enforce these Terms; respond to legal process; investigate fraud or security; or address conduct that creates risk. We may take action without advance notice where delay would create harm, subject to any notice or appeal rights required by law.",
      "You may request account deletion from the in-app Settings flow. Deletion is intended to remove the account and user-managed content that DiningDealz is not legally required to keep. It does not erase copies retained by another user, a public or licensed source, a support inbox, a provider backup, a legal hold, a report, or a conversation needed for another participant. Terms that by their nature should continue—including ownership, disclaimers, liability limits, indemnity, and dispute provisions—survive termination.",
    ],
  },
  {
    title: "15. Disclaimers",
    paragraphs: [
      "TO THE FULLEST EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED \"AS IS\" AND \"AS AVAILABLE.\" DININGDEALZ DISCLAIMS WARRANTIES NOT EXPRESSLY PROVIDED IN THESE TERMS, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, RELIABILITY, AND AVAILABILITY.",
      "DiningDealz does not promise that the Service or any listing, deal, location, message, public post, business, source data, notification, moderation decision, or third-party service will be accurate, current, uninterrupted, secure, safe, suitable, lawful, or available. DiningDealz is not responsible for a business's conduct, products, services, food, alcohol, allergens, permits, prices, hours, offer redemption, location, employment practices, or interactions with you. You use the Service and interact with other users and businesses at your own judgment and risk.",
      "Nothing in these Terms excludes or limits a warranty, right, remedy, or liability that applicable law does not permit us to exclude or limit.",
    ],
  },
  {
    title: "16. Limitation of liability",
    paragraphs: [
      "TO THE FULLEST EXTENT PERMITTED BY LAW, DININGDEALZ AND ITS OWNERS, AFFILIATES, OFFICERS, EMPLOYEES, CONTRACTORS, SERVICE PROVIDERS, AND LICENSORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS INTERRUPTION, ARISING FROM OR RELATED TO THE SERVICE OR THESE TERMS, EVEN IF ADVISED OF THE POSSIBILITY.",
      "TO THE FULLEST EXTENT PERMITTED BY LAW, THE TOTAL LIABILITY OF DININGDEALZ AND THOSE PARTIES FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE OR THESE TERMS WILL NOT EXCEED US$100. This limit does not apply where prohibited by law and does not limit liability that cannot legally be limited.",
    ],
  },
  {
    title: "17. Indemnification",
    paragraphs: [`To the extent permitted by law, you agree to defend, indemnify, and hold harmless DiningDealz and its owners, affiliates, officers, employees, contractors, service providers, and licensors from claims, losses, liabilities, damages, costs, and reasonable attorneys' fees arising from or related to: (a) your User Content; (b) your business claim, offer, service, or representation; (c) your use or misuse of the Service; (d) your violation of these Terms or another person's rights; or (e) your violation of applicable law. DiningDealz may assume control of the defense of a matter subject to indemnification, and you agree to reasonably cooperate. You may not settle a claim in a way that admits fault by or imposes obligations on DiningDealz without our written consent.`],
  },
  {
    title: "18. Disputes, general terms, and contact",
    paragraphs: [
      `Before pursuing a formal dispute, please contact ${SUPPORT_EMAIL} with a clear description of the issue and the resolution you want so we have an opportunity to address it. Mandatory law where you live controls rights and remedies that cannot be waived. Nothing in these Terms prevents you from contacting a regulator, reporting a safety issue, or using a non-waivable legal remedy. These Terms do not currently require arbitration or waive a jury or class right; any such provision would need to be presented in a separate, legally valid notice or agreement.`,
      "These Terms and the Privacy Policy are the current agreement about the Service unless a separate written agreement applies. If a provision is unenforceable, it will be limited or severed to the minimum extent necessary and the rest will remain effective. A failure to enforce a provision is not a waiver. DiningDealz may assign these Terms in connection with a reorganization, financing, merger, acquisition, or sale of assets; you may not assign them without written consent. Events outside reasonable control may delay performance. Electronic notices and records satisfy writing requirements where permitted by law.",
      `Questions, notices, copyright complaints, privacy requests, and support issues may be sent to ${SUPPORT_EMAIL}.`,
    ],
  },
] as const;

export default function TermsPage() {
  return (
    <main className="dd-site-shell px-6 py-10 lg:px-10 lg:py-14">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffd35a]">
          <span className="h-2 w-2 rounded-full bg-[#ff5c3c] shadow-[0_0_16px_#ff5c3c]" />
          Back to DiningDealz
        </Link>

        <section className="dd-panel gap-6 p-6 sm:p-8 lg:p-10">
          <div className="space-y-3">
            <p className="dd-kicker">Terms of Service &amp; Agreements</p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">Rules for using DiningDealz services.</h1>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ffb100]">Effective: {EFFECTIVE_DATE}</p>
            <p className="text-base leading-8 text-[#f6d6c5]">
              These Terms of Service and Agreements govern use of the DiningDealz app, website, and related services by customers, business users, and other visitors.
            </p>
          </div>

          {termsSections.map((section) => (
            <LegalSection key={section.title} title={section.title} paragraphs={section.paragraphs} items={section.items} paragraphsAfter={section.paragraphsAfter} />
          ))}

          <div className="border-t border-white/10 pt-5 text-sm leading-7 text-[#f6d6c5]">
            <p>
              Terms contact: <a className="font-semibold text-[#ffd35a] hover:text-white" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function LegalSection({
  items,
  paragraphs,
  paragraphsAfter,
  title,
}: TermsSectionData) {
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
