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
};

export type Deal = {
  id: number;
  title: string;
  description: string;
  deal_type: string;
  deal_type_label: string;
  price_text: string;
  terms: string;
  is_active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  happy_hours: HappyHourWindow[];
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

export type PlaceLocationDetail = PlaceLocation & {
  deals: Deal[];
};

export type PlaceListItem = PlaceLocation & {
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
    name: string;
    city: string;
    city_label: string;
    venue_type: string;
    venue_type_label: string;
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
  social_media_links: string[];
  offer_entries: string[];
  hours_of_operation_entries: string[];
  photo_references: string[];
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