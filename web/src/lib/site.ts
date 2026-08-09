export const SITE_NAME = "DiningDealz";
export const SITE_DESCRIPTION =
  "Find local happy hours, food deals, daily specials, and limited-time discounts across Ventura, Oxnard, and Camarillo.";
export const SITE_KEYWORDS = [
  "happy hour",
  "food deals",
  "restaurant deals",
  "drink specials",
  "daily specials",
  "Ventura",
  "Oxnard",
  "Camarillo",
  "local dining",
];
export const SUPPORT_EMAIL = "support@diningdealz.com";
export const SOCIAL_IMAGE_PATH = "/DiningDealz-Logo.png";

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.diningdealz.com";

export const SITE_URL = new URL(configuredSiteUrl);