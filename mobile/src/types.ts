export type HappyHourWindow = {
  id: number;
  weekday: number;
  weekday_label: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
};

export type OperatingHourWindow = {
  id: number;
  weekday: number;
  weekday_label: string;
  open_time: string;
  close_time: string;
  open_24_hours?: boolean;
  group_id?: string | null;
  group_rank?: number | null;
};

export type Deal = {
  id: number;
  title: string;
  description: string;
  deal_type: string;
  deal_type_label: string;
  custom_deal_type_label?: string;
  price_text: string;
  terms: string;
  is_active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  happy_hours: HappyHourWindow[];
};

export type BusinessDealHappyHourOverride = {
  id?: string;
  weekdays?: number[];
  weekday: number;
  start_time: string;
  end_time: string;
  all_day: boolean;
};

export type BusinessOperatingHourOverride = {
  id?: string;
  group_id?: string;
  group_rank?: number;
  weekdays?: number[];
  weekday: number;
  open_time: string;
  close_time: string;
  open_24_hours?: boolean;
};

export type BusinessDealOverride = {
  id?: string;
  title: string;
  description: string;
  deal_type: string;
  custom_deal_type_label?: string;
  price_text: string;
  terms: string;
  happy_hours: BusinessDealHappyHourOverride[];
};

export type PlaceLocation = {
  id: number;
  name: string;
  slug: string;
  city: string;
  city_label: string;
  venue_type: string;
  venue_type_label: string;
  address_line_1: string;
  address_line_2: string;
  neighborhood: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  phone_number: string;
  website_url: string;
  image_urls: string[];
  operating_hours: OperatingHourWindow[];
  is_active: boolean;
  has_deals: boolean;
  deal_count: number;
  operating_weekdays: number[];
  deal_weekdays: number[];
  is_verified: boolean;
};

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'website';

export type SocialProfile = {
  url: string;
  username: string;
};

export type SocialProfiles = Partial<Record<SocialPlatform, SocialProfile>>;

export type PlaceLocationDetail = PlaceLocation & {
  deals: Deal[];
};

export type PlaceListItem = PlaceLocation & {
  is_claimed: boolean;
  is_informal?: boolean;
  social_profiles?: SocialProfiles;
  deal_overrides?: BusinessDealOverride[] | null;
  operating_hour_overrides?: BusinessOperatingHourOverride[] | null;
  social_media_links?: string[];
  offer_entries?: string[];
  hours_of_operation_entries?: string[];
  photo_references?: string[];
  supporting_details?: string;
  locations: PlaceLocation[];
};

export type PlaceDetail = Omit<PlaceListItem, 'locations'> & {
  deals: Deal[];
  locations: PlaceLocationDetail[];
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type FeedItemType = 'special' | 'announcement' | 'event' | 'blog' | 'sponsored';

export type FeedItem = {
  id: string;
  item_type: FeedItemType;
  is_sponsored: boolean;
  post_id: number;
  campaign_id: number | null;
  business_name: string;
  business_slug: string;
  city: string;
  city_label: string;
  venue_type: string;
  venue_type_label: string;
  title: string;
  summary: string;
  body: string;
  hero_image_url: string;
  cta_label: string;
  cta_url: string;
  published_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sponsor_label: string;
};

export type FeedImpressionRequest = {
  feed_item_id: string;
  post: number;
  campaign?: number | null;
  placement_type: 'organic' | 'sponsored';
  session_key?: string;
  request_id?: string;
  page_number: number;
  position: number;
};

export type FeedEngagementRequest = {
  feed_item_id: string;
  post: number;
  campaign?: number | null;
  impression?: number | null;
  event_type: 'click' | 'open' | 'save' | 'share';
  session_key?: string;
  destination_url?: string;
  page_number: number;
  position: number;
};

export type SignupResponse = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  detail?: string;
  auth_token: string;
  portal: 'customer' | 'business';
  profile_type: 'customer' | 'business';
  business_status?: string;
  claim_id?: number | null;
  claim_status?: string | null;
  claim_pathway?: string | null;
  claim_review_pending?: boolean;
  claim_review_message?: string;
  business_name?: string;
  email_verified: boolean;
  email_verification_sent_at?: string | null;
  two_factor_enabled: boolean;
  two_factor_pending_setup?: boolean;
  billing_portal_url?: string;
  approved_businesses?: Array<{
    id: number;
    slug: string;
    name: string;
    city: string;
    city_label: string;
    venue_type: string;
    venue_type_label: string;
    address_line_1?: string;
    website_url?: string;
  }>;
  sponsored_campaigns?: Array<{
    id: number;
    name: string;
    status: string;
    status_label: string;
    is_currently_active: boolean;
    billing_model: string;
    billing_model_label: string;
    weekly_price_cents: number;
    weekly_impression_quota: number;
    impressions_last_7_days: number;
    clicks_last_7_days: number;
    click_through_rate_percent: number;
    remaining_impressions: number | null;
    starts_at: string;
    ends_at?: string | null;
    last_served_at?: string | null;
    target_cities?: string[];
    target_venue_types?: string[];
    post: {
      id: number;
      title: string;
      content_type: string;
      content_type_label: string;
      summary: string;
    };
  }>;
  favorite_businesses?: Array<{
    slug: string;
    name: string;
    city: string;
    city_label: string;
    venue_type: string;
    venue_type_label: string;
    address_line_1: string;
    website_url: string;
  }>;
  business_contact?: {
    contact_name?: string;
    job_title?: string;
    work_email?: string;
    work_phone?: string;
    employer_address?: string;
    business_website_url?: string;
    social_profiles?: SocialProfiles;
    deal_overrides?: BusinessDealOverride[] | null;
    operating_hour_overrides?: BusinessOperatingHourOverride[] | null;
    deals?: Deal[];
    operating_hours?: OperatingHourWindow[];
    social_media_links?: string[];
    offer_entries?: string[];
    hours_of_operation_entries?: string[];
    photo_references?: string[];
    supporting_details?: string;
    verification_summary?: string;
  };
  business_location_tracking_available?: boolean;
  business_location_tracking_enabled?: boolean;
  requires_business_location_tracking?: boolean;
  tracked_business_location?: {
    latitude?: number | null;
    longitude?: number | null;
    accuracy_meters?: number | null;
    updated_at?: string | null;
  };
  can_access_places?: boolean;
};

export type EmailVerificationChallengeResponse = SignupResponse & {
  detail?: string;
  email_verification_required?: boolean;
  verification_code_expires_at?: string | null;
  verification_code_ttl_seconds?: number;
};

export type ProfileDashboardUpdateRequest = {
  portal?: 'customer' | 'business';
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  contact_name?: string;
  job_title?: string;
  work_email?: string;
  work_phone?: string;
  employer_address?: string;
  business_website_url?: string;
  social_profiles?: SocialProfiles;
  deal_overrides?: BusinessDealOverride[];
  operating_hour_overrides?: BusinessOperatingHourOverride[];
  social_media_links_text?: string;
  offer_entries_text?: string;
  hours_of_operation_entries_text?: string;
  photo_references_text?: string;
  supporting_details?: string;
};

export type SupportContactRequest = {
  portal?: 'customer' | 'business';
  subject?: string;
  message: string;
};

export type FavoriteBusinessToggleRequest = {
  slug: string;
  favorited: boolean;
  portal?: 'customer' | 'business';
};

export type LoginRequest = {
  portal: 'customer' | 'business';
  identifier: string;
  password: string;
  two_factor_code?: string;
};

export type EmailVerificationCodeRequest = {
  username: string;
  code: string;
  portal?: 'customer' | 'business';
};

export type ResendEmailVerificationCodeRequest = {
  username: string;
  portal?: 'customer' | 'business';
};

export type TwoFactorSetupResponse = {
  detail: string;
  manual_entry_key: string;
  otpauth_url: string;
  issuer: string;
  account_name: string;
};

export type CustomerSignupRequest = {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export type BusinessVerificationDocuments = {
  business_registration: string[];
  health_permit: string[];
  abc_license: string[];
  proof_of_address_control: string[];
};

export type BusinessAttachmentKind =
  | 'social_media'
  | 'business_registration'
  | 'health_permit'
  | 'abc_license'
  | 'proof_of_address_control'
  | 'proof_of_authority';

export type BusinessAttachmentDraft = {
  id: string;
  name: string;
  uri: string;
  mimeType: string | null;
  size: number | null;
};

export type BusinessAttachmentBuckets = Record<BusinessAttachmentKind, BusinessAttachmentDraft[]>;

type SharedBusinessDetails = {
  business_website_url: string;
  social_profiles?: SocialProfiles;
  deal_overrides?: BusinessDealOverride[];
  operating_hour_overrides?: BusinessOperatingHourOverride[];
  social_media_links: string[];
  offer_entries: string[];
  hours_of_operation_entries: string[];
  photo_references: string[];
  photo_uploads?: BusinessAttachmentDraft[];
};

export type BusinessSignupRequest = CustomerSignupRequest & SharedBusinessDetails & {
  attachments?: BusinessAttachmentBuckets;
  business_slug: string;
  contact_name: string;
  job_title: string;
  work_email: string;
  work_phone: string;
  employer_address: string;
  address_not_applicable: boolean;
  verification_documents: BusinessVerificationDocuments;
  supporting_details: string;
};

export type ManualBusinessSignupRequest = CustomerSignupRequest & SharedBusinessDetails & {
  attachments?: BusinessAttachmentBuckets;
  business_name: string;
  business_city: string;
  business_venue_type: string;
  business_website_url: string;
  contact_name: string;
  job_title: string;
  work_email: string;
  work_phone: string;
  employer_address: string;
  address_not_applicable: boolean;
  verification_documents: BusinessVerificationDocuments;
  supporting_details: string;
};

export type InformalBusinessSignupRequest = CustomerSignupRequest & SharedBusinessDetails & {
  attachments?: BusinessAttachmentBuckets;
  business_name: string;
  business_city: string;
  business_venue_type: string;
  supporting_details: string;
};

export type BusinessLocationUpdateRequest = {
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
};

export type BusinessLocationTrackingPreferenceRequest = {
  enabled: boolean;
};