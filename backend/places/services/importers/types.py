from dataclasses import dataclass, field


@dataclass
class ImportedHappyHour:
	weekday: int
	start_time: str
	end_time: str
	all_day: bool = False


@dataclass
class ImportedOperatingHour:
	weekday: int
	open_time: str
	close_time: str


@dataclass
class ImportedDeal:
	title: str
	deal_type: str
	description: str = ''
	price_text: str = ''
	terms: str = ''
	is_active: bool = True
	starts_on: str | None = None
	ends_on: str | None = None
	external_id: str = ''
	source_name: str = ''
	source_url: str = ''
	happy_hours: list[ImportedHappyHour] = field(default_factory=list)


@dataclass
class ImportedPlace:
	name: str
	city: str
	venue_type: str
	address_line_1: str
	address_line_2: str = ''
	neighborhood: str = ''
	state: str = 'CA'
	postal_code: str = ''
	geocode_query: str = ''
	phone_number: str = ''
	website_url: str = ''
	image_urls: list[str] = field(default_factory=list)
	profile_name: str = ''
	profile_slug: str = ''
	is_active: bool = True
	external_id: str = ''
	source_name: str = ''
	source_url: str = ''
	deals: list[ImportedDeal] = field(default_factory=list)
	operating_hours: list[ImportedOperatingHour] = field(default_factory=list)