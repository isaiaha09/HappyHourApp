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
  portal: 'customer' | 'business';
  profile_type: 'customer' | 'business';
  business_status?: string;
  claim_id?: number | null;
  claim_status?: string | null;
  business_name?: string;
};

export type LoginRequest = {
  portal: 'customer' | 'business';
  identifier: string;
  password: string;
};

export type CustomerSignupRequest = {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export type BusinessSignupRequest = CustomerSignupRequest & {
  business_slug: string;
  contact_name: string;
  job_title: string;
  work_email: string;
  work_phone: string;
  employer_address: string;
  address_not_applicable: boolean;
  verification_summary: string;
  supporting_details: string;
};

export type ManualBusinessSignupRequest = CustomerSignupRequest & {
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
  verification_summary: string;
  supporting_details: string;
};