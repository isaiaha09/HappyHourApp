export type AuthPortal = 'customer' | 'business';

export type ProfileFormState = {
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  first_name: string;
  last_name: string;
  business_slug: string;
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
  social_media_links_text: string;
  offer_entries_text: string;
  hours_of_operation_entries_text: string;
  photo_references_text: string;
  verification_summary: string;
  supporting_details: string;
};

export type LoginFormState = {
  identifier: string;
  password: string;
  two_factor_code: string;
};
