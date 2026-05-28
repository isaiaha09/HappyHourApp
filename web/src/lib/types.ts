export type AccountPortal = "customer" | "business";

export type SignupResponse = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  auth_token: string;
  portal: AccountPortal;
  profile_type: AccountPortal;
  business_status?: string;
  claim_id?: number | null;
  claim_status?: string | null;
  business_name?: string;
  email_verified: boolean;
  email_verification_sent_at?: string | null;
  two_factor_enabled: boolean;
  billing_portal_url?: string;
  approved_businesses?: Array<{
    id: number;
    name: string;
    city: string;
    city_label: string;
    venue_type: string;
    venue_type_label: string;
  }>;
  business_contact?: {
    contact_name?: string;
    job_title?: string;
    work_email?: string;
    work_phone?: string;
    employer_address?: string;
    verification_summary?: string;
  };
  can_access_places?: boolean;
};

export type StoredSession = {
  authToken: string;
  portal: AccountPortal;
};