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