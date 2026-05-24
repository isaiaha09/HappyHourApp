import json
import logging
import re
from html import escape
from io import BytesIO
from hashlib import sha256
from urllib.parse import unquote, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup
from django.conf import settings

from places.models import City, DealType, VenueType, Weekday
from places.services.importers.base import BaseHtmlImporter
from places.services.importers.types import ImportedDeal, ImportedHappyHour, ImportedOperatingHour, ImportedPlace


logger = logging.getLogger(__name__)


class BusinessWebsiteImporter(BaseHtmlImporter):
	source_name = 'business_websites'
	source_url = ''

	PREFERRED_IMAGE_TOKENS = {
		'food', 'foods', 'dish', 'dishes', 'menu', 'meal', 'meals', 'happy', 'hour', 'happy-hour', 'happyhour', 'deal', 'deals',
		'cocktail', 'cocktails', 'drink', 'drinks', 'beer', 'beers', 'wine', 'wines', 'burger', 'burgers',
		'taco', 'tacos', 'pizza', 'pizzas', 'appetizer', 'appetizers', 'fries', 'nachos', 'platter', 'plate',
	}

	DEPRIORITIZED_IMAGE_TOKENS = {
		'logo', 'icon', 'sprite', 'favicon', 'avatar', 'interior', 'exterior', 'building', 'team', 'staff', 'map',
		'location', 'banner', 'background', 'pattern', 'badge', 'brandmark',
	}

	CITY_MAP = {
		'ventura': City.VENTURA,
		'oxnard': City.OXNARD,
		'camarillo': City.CAMARILLO,
	}

	VENUE_TYPE_MAP = {
		'restaurant': VenueType.RESTAURANT,
		'fast_food': VenueType.FAST_FOOD,
		'bar': VenueType.BAR,
		'cafe': VenueType.CAFE,
		'shop': VenueType.SHOP,
		'attraction': VenueType.ATTRACTION,
		'other': VenueType.OTHER,
	}

	DEAL_TYPE_PATTERNS = [
		(DealType.HAPPY_HOUR, re.compile(r'\bhappy hour\b|late night happy hour', re.IGNORECASE)),
		(DealType.DAILY_SPECIAL, re.compile(r'\bdaily special\b|\blunch special\b|\btaco tuesday\b|\bcombo\b', re.IGNORECASE)),
		(DealType.DISCOUNT, re.compile(r'\$\d|\b\d+% off\b|\b\$\d+(?:\.\d+)? off\b|\bdiscount\b|\boff\b', re.IGNORECASE)),
		(DealType.LIMITED_TIME, re.compile(r'\blimited time\b|\bseasonal\b|\bthis month\b|\btoday\b', re.IGNORECASE)),
	]

	WEEKDAY_PATTERNS = [
		('monday', Weekday.MONDAY),
		('tuesday', Weekday.TUESDAY),
		('wednesday', Weekday.WEDNESDAY),
		('thursday', Weekday.THURSDAY),
		('friday', Weekday.FRIDAY),
		('saturday', Weekday.SATURDAY),
		('sunday', Weekday.SUNDAY),
	]

	WEEKDAY_ALIASES = {
		'monday': Weekday.MONDAY,
		'mon': Weekday.MONDAY,
		'tuesday': Weekday.TUESDAY,
		'tue': Weekday.TUESDAY,
		'tues': Weekday.TUESDAY,
		'wednesday': Weekday.WEDNESDAY,
		'wed': Weekday.WEDNESDAY,
		'thursday': Weekday.THURSDAY,
		'thu': Weekday.THURSDAY,
		'thur': Weekday.THURSDAY,
		'thurs': Weekday.THURSDAY,
		'friday': Weekday.FRIDAY,
		'fri': Weekday.FRIDAY,
		'saturday': Weekday.SATURDAY,
		'sat': Weekday.SATURDAY,
		'sunday': Weekday.SUNDAY,
		'sun': Weekday.SUNDAY,
	}

	WEEKDAY_REGEX = r'mon(?:day)?s?|tue(?:s|sday)?s?|wed(?:nesday)?s?|thu(?:r|rs|rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?'

	TIME_RANGE_PATTERN = re.compile(
		r'(?P<start>\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to)\s*(?P<end>(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?)|close)',
		re.IGNORECASE,
	)

	PRICE_PATTERN = re.compile(r'(\$\d+(?:\.\d{2})?(?:\s*(?:off|for))?)', re.IGNORECASE)

	PROMOTION_PATTERNS = [
		re.compile(r'\bhappy hour\b', re.IGNORECASE),
		re.compile(r'\bspecial\b', re.IGNORECASE),
		re.compile(r'\bdiscount\b', re.IGNORECASE),
		re.compile(r'\boff\b', re.IGNORECASE),
		re.compile(r'\btaco tuesday\b', re.IGNORECASE),
		re.compile(r'\blunch\b', re.IGNORECASE),
		re.compile(r'\bcombo\b', re.IGNORECASE),
	]

	def __init__(self, session=None, business_sources=None):
		super().__init__(session=session)
		self.business_sources = list(business_sources if business_sources is not None else getattr(settings, 'BUSINESS_SOURCE_PAGES', []))
		self.allowed_cities = tuple(getattr(settings, 'BUSINESS_SOURCE_ALLOWED_CITIES', tuple(self.CITY_MAP.values())))
		self.strict_errors = getattr(settings, 'BUSINESS_SOURCE_STRICT_ERRORS', False)
		self.load_errors = []

	def load_records(self, html=None):
		if html is not None:
			raise ValueError('BusinessWebsiteImporter fetches live business pages and does not accept a single HTML payload.')

		records = []
		for source in self.business_sources:
			if not source.get('enabled', True):
				continue
			try:
				records.append(self._load_business_record(source))
			except Exception as exc:
				error = {
					'name': source.get('name') or source.get('source_url', 'unknown source'),
					'source_url': source.get('source_url', ''),
					'error': str(exc),
				}
				self.load_errors.append(error)
				logger.warning('Skipping business source %s (%s): %s', error['name'], error['source_url'], error['error'])
				if self.strict_errors:
					raise
		return records

	def parse_html(self, html):
		raise NotImplementedError('BusinessWebsiteImporter parses multiple live business pages, not a single HTML document.')

	def _load_business_record(self, source):
		source_documents = self._build_source_documents(source)
		page_url = source['source_url']
		identity_document = self._first_document_for_role(source_documents, 'identity') or source_documents[0]
		deal_documents = self._documents_for_role(source_documents, 'deals') or [identity_document]
		image_documents = self._documents_for_role(source_documents, 'images') or source_documents

		identity = self._extract_identity(source, identity_document['soup'])
		operating_hours = self._extract_operating_hours(source, source_documents)
		operating_hours_lookup = self._operating_hours_lookup(operating_hours)
		deals = self._extract_deals(
			source,
			[document['soup'] for document in deal_documents],
			[document['url'] for document in deal_documents],
			operating_hours=operating_hours_lookup,
		)

		return ImportedPlace(
			name=identity['name'],
			profile_name=source.get('profile_name', identity['name']),
			profile_slug=source.get('profile_slug', ''),
			city=identity['city'],
			venue_type=identity['venue_type'],
			address_line_1=identity['address_line_1'],
			address_line_2=identity['address_line_2'],
			neighborhood=identity['neighborhood'],
			state=identity['state'],
			postal_code=identity['postal_code'],
			geocode_query=source.get('geocode_query', ''),
			phone_number=identity['phone_number'],
			website_url=identity['website_url'],
			image_urls=self._extract_image_urls(
				source,
				[document['soup'] for document in image_documents],
				[document['url'] for document in image_documents],
			),
			external_id=source.get('external_id', self._default_external_id(page_url)),
			source_name=self.source_name,
			source_url=page_url,
			deals=deals,
			operating_hours=operating_hours,
		)

	def _build_source_documents(self, source):
		documents = []
		for index, document in enumerate(self._configured_source_documents(source)):
			roles = self._normalize_document_roles(document.get('roles'))
			url = self._normalize_whitespace(document.get('url', ''))
			text = document.get('text')
			html = document.get('html')
			document_format = self._normalize_document_format(document.get('format'), url)

			if text is not None:
				html = self._document_text_to_html(text)
			elif html is None:
				if not url:
					continue
				if document_format == 'pdf':
					html = self._document_text_to_html(self._extract_pdf_text(self.fetch_binary(url=url)))
				else:
					html = self.fetch_html(url=url)

			resolved_url = url or source.get('source_url', '')
			documents.append({
				'key': document.get('key') or f'doc-{index}',
				'url': resolved_url,
				'roles': roles,
				'soup': BeautifulSoup(html, 'html.parser'),
			})

		return documents

	def _normalize_document_format(self, configured_format, url):
		format_value = self._normalize_whitespace(str(configured_format or '')).lower()
		if format_value:
			return format_value
		if str(url or '').lower().endswith('.pdf'):
			return 'pdf'
		return 'html'

	def _document_text_to_html(self, text):
		return f'<html><body><pre>{escape(str(text or ""))}</pre></body></html>'

	def _extract_pdf_text(self, pdf_bytes):
		try:
			from pypdf import PdfReader
		except ImportError as exc:
			raise RuntimeError('pypdf is required to parse PDF source documents.') from exc

		try:
			reader = PdfReader(BytesIO(pdf_bytes))
		except Exception as exc:
			raise RuntimeError('Unable to read PDF source document.') from exc

		pages = []
		for page in reader.pages:
			text = self._normalize_whitespace(page.extract_text() or '')
			if text:
				pages.append(text)

		return '\n'.join(pages)

	def _configured_source_documents(self, source):
		documents = source.get('source_documents')
		if documents:
			return documents

		legacy_documents = [
			{
				'key': 'primary',
				'url': source['source_url'],
				'roles': ['identity', 'deals', 'images'],
			},
		]
		for index, url in enumerate(source.get('deal_urls', []), start=1):
			legacy_documents.append({
				'key': f'deals-{index}',
				'url': url,
				'roles': ['deals', 'images'],
			})
		hours_url = source.get('hours_url')
		if hours_url:
			legacy_documents.append({
				'key': 'hours',
				'url': hours_url,
				'roles': ['hours'],
			})
		for index, text in enumerate(source.get('deal_texts', []), start=1):
			legacy_documents.append({
				'key': f'deal-text-{index}',
				'text': text,
				'roles': ['deals'],
			})
		return legacy_documents

	def _normalize_document_roles(self, roles):
		if not roles:
			return {'identity', 'deals', 'images'}
		if isinstance(roles, str):
			roles = [roles]
		return {
			self._normalize_whitespace(str(role)).lower()
			for role in roles
			if self._normalize_whitespace(str(role))
		}

	def _documents_for_role(self, documents, role):
		return [document for document in documents if role in document['roles']]

	def _first_document_for_role(self, documents, role):
		for document in documents:
			if role in document['roles']:
				return document
		return None

	def _extract_image_urls(self, source, soups, page_urls):
		candidates = {}
		for configured_url in source.get('image_urls', []):
			self._append_image_candidate(candidates, configured_url, page_urls[0], source='configured', score_bonus=100)

		for soup, page_url in zip(soups, page_urls):
			for meta in soup.select('meta[property="og:image"], meta[name="twitter:image"], meta[itemprop="image"]'):
				self._append_image_candidate(candidates, meta.get('content', ''), page_url, source='meta', score_bonus=12)

			for selector in source.get('image_selectors', []):
				for node in soup.select(selector):
					self._append_node_image_candidates(candidates, node, page_url, source='selector', score_bonus=35)

			for node in soup.select('img, source'):
				self._append_node_image_candidates(candidates, node, page_url, source='node')

		ranked_candidates = sorted(
			candidates.values(),
			key=lambda candidate: (-candidate['score'], candidate['order'], candidate['url']),
		)
		return [candidate['url'] for candidate in ranked_candidates[:6]]

	def _append_node_image_candidates(self, candidates, node, page_url, source='node', score_bonus=0):
		context = self._image_context(node)
		if not self._is_likely_preview_image_node(node, context):
			return

		for attribute in ['src', 'data-src', 'data-original', 'srcset', 'data-srcset']:
			value = node.get(attribute, '')
			if not value:
				continue
			if 'srcset' in attribute:
				for candidate in value.split(','):
					parts = candidate.strip().split()
					if parts:
						self._append_image_candidate(candidates, parts[0], page_url, source=source, context=context, score_bonus=score_bonus)
			else:
				self._append_image_candidate(candidates, value, page_url, source=source, context=context, score_bonus=score_bonus)

	def _append_image_candidate(self, candidates, candidate_url, page_url, source='node', context='', score_bonus=0):
		resolved_url = self._resolve_image_url(candidate_url, page_url)
		if not resolved_url:
			return
		if not self._is_likely_preview_image(resolved_url):
			return

		identity_key = self._image_identity_key(resolved_url)
		score = self._score_image_candidate(resolved_url, context=context, source=source) + score_bonus
		existing = candidates.get(identity_key)
		if existing is None:
			candidates[identity_key] = {
				'url': resolved_url,
				'score': score,
				'order': len(candidates),
			}
			return

		if score > existing['score']:
			existing['score'] = score
			existing['url'] = resolved_url

	def _resolve_image_url(self, candidate_url, page_url):
		candidate = self._normalize_whitespace(str(candidate_url or ''))
		if not candidate or candidate.startswith('data:'):
			return ''
		return urljoin(page_url, candidate)

	def _is_likely_preview_image(self, candidate_url):
		parsed = urlparse(candidate_url)
		if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
			return False
		value = candidate_url.lower()
		if any(token in value for token in ['logo', 'icon', 'sprite', 'favicon', 'avatar']):
			return False
		if value.endswith('.svg'):
			return False
		return True

	def _image_identity_key(self, candidate_url):
		parsed = urlparse(candidate_url)
		path = parsed.path.lower()
		path = re.sub(r'-(?:\d{2,4})x(?:\d{2,4})(?=\.[a-z0-9]+$)', '', path)
		path = re.sub(r'_(?:\d{2,4})x(?:\d{2,4})(?=\.[a-z0-9]+$)', '', path)
		normalized = parsed._replace(path=path, query='', fragment='')
		return urlunparse(normalized)

	def _is_likely_preview_image_node(self, node, context):
		width = self._numeric_attribute_value(node, 'width')
		height = self._numeric_attribute_value(node, 'height')
		if width is not None and width < 120:
			return False
		if height is not None and height < 120:
			return False
		if 'logo' in context and 'food' not in context and 'drink' not in context:
			return False
		return True

	def _image_context(self, node):
		parts = [
			node.get('alt', ''),
			node.get('title', ''),
			node.get('aria-label', ''),
			node.get('class', []),
			node.get('id', ''),
			node.parent.get('class', []) if node.parent else [],
			node.parent.get('id', '') if node.parent else '',
		]
		flattened_parts = []
		for part in parts:
			if isinstance(part, list):
				flattened_parts.extend(part)
			else:
				flattened_parts.append(part)
		return self._normalize_whitespace(' '.join(str(part) for part in flattened_parts if part)).lower()

	def _score_image_candidate(self, candidate_url, context='', source='node'):
		combined = f'{candidate_url.lower()} {context}'.strip()
		tokens = set(re.findall(r'[a-z0-9]+', combined))
		score = 0
		if source == 'configured':
			score += 50
		elif source == 'selector':
			score += 18
		elif source == 'meta':
			score += 4

		score += sum(8 for token in tokens if token in self.PREFERRED_IMAGE_TOKENS)
		score -= sum(6 for token in tokens if token in self.DEPRIORITIZED_IMAGE_TOKENS)
		return score

	def _numeric_attribute_value(self, node, attribute):
		value = self._normalize_whitespace(str(node.get(attribute, '')))
		match = re.match(r'^(\d+)', value)
		if not match:
			return None
		return int(match.group(1))

	def _extract_identity(self, source, soup):
		structured = self._find_structured_business_data(soup)
		city = self._resolve_city(source.get('city'), structured.get('addressLocality'), source.get('source_url', ''))
		page_contact = self._extract_page_contact_details(soup, city)
		address_line_1 = self._coalesce(source.get('address_line_1'), structured.get('streetAddress'), page_contact.get('address_line_1'), '')
		postal_code = self._coalesce(source.get('postal_code'), structured.get('postalCode'), page_contact.get('postal_code'))
		return {
			'name': self._coalesce(source.get('name'), structured.get('name'), self._title_fallback(soup)),
			'city': city,
			'venue_type': self._resolve_venue_type(source.get('venue_type'), structured.get('@type')),
			'address_line_1': '' if self._looks_like_url(address_line_1) else address_line_1,
			'address_line_2': source.get('address_line_2', ''),
			'neighborhood': source.get('neighborhood', ''),
			'state': self._normalize_state_value(self._coalesce(source.get('state'), structured.get('addressRegion'), page_contact.get('state'), 'CA')),
			'postal_code': postal_code or '',
			'phone_number': self._coalesce(source.get('phone_number'), structured.get('telephone'), page_contact.get('phone_number'), ''),
			'website_url': self._coalesce(source.get('website_url'), structured.get('url'), source['source_url']),
		}

	def _extract_deals(self, source, soups, page_urls, operating_hours=None):
		selectors = source.get('deal_selectors', [])
		candidates = []
		for soup, page_url in zip(soups, page_urls):
			selector_candidates = self._candidate_nodes_from_soup(soup, selectors)
			candidates.extend(selector_candidates)
			if not selector_candidates:
				candidates.extend(self._candidate_lines_from_soup(soup))

		deals = []
		seen = set()
		for candidate in candidates:
			cleaned = self._normalize_whitespace(candidate)
			cleaned = self._city_scoped_deal_text(cleaned, source.get('city'))
			if len(cleaned) < 12:
				continue
			if not any(pattern.search(cleaned) for pattern in self.PROMOTION_PATTERNS):
				continue
			if cleaned.lower() in seen:
				continue
			seen.add(cleaned.lower())
			deal = self._build_deal_from_text(cleaned, page_url, operating_hours=operating_hours)
			if deal is not None:
				self._merge_deal_candidate(deals, deal)

		return deals[: source.get('max_deals', 8)]

	def _merge_deal_candidate(self, deals, candidate):
		candidate_signature = self._deal_signature(candidate)
		for index, existing in enumerate(deals):
			if self._deal_signature(existing) != candidate_signature:
				continue
			if self._descriptions_overlap(existing.description, candidate.description):
				deals[index] = self._preferred_deal(existing, candidate)
				return

		deals.append(candidate)

	def _deal_signature(self, deal):
		return (
			deal.title.strip().lower(),
			deal.deal_type,
			deal.price_text.strip().lower(),
			tuple(
				(hour.weekday, hour.start_time, hour.end_time, hour.all_day)
				for hour in deal.happy_hours
			),
		)

	def _descriptions_overlap(self, first, second):
		first_normalized = self._normalize_whitespace(first).lower()
		second_normalized = self._normalize_whitespace(second).lower()
		if not first_normalized or not second_normalized:
			return False
		return first_normalized in second_normalized or second_normalized in first_normalized

	def _preferred_deal(self, first, second):
		first_description = self._normalize_whitespace(first.description)
		second_description = self._normalize_whitespace(second.description)
		if len(second_description) < len(first_description):
			return second
		return first

	def _candidate_nodes_from_soup(self, soup, selectors):
		nodes = []
		for selector in selectors:
			for node in soup.select(selector):
				nodes.append(node.get_text(' ', strip=True))

		if nodes:
			return nodes

		fallback_selectors = [
			'[class*="happy" i]',
			'[id*="happy" i]',
			'[class*="special" i]',
			'[id*="special" i]',
			'[class*="promo" i]',
			'[id*="promo" i]',
			'article',
			'section',
		]
		for selector in fallback_selectors:
			for node in soup.select(selector):
				text = node.get_text(' ', strip=True)
				if text:
					nodes.append(text)
		return nodes

	def _candidate_lines_from_soup(self, soup):
		text = soup.get_text('\n', strip=True)
		return [line for line in text.splitlines() if line.strip()]

	def _city_scoped_deal_text(self, value, city):
		city_label = self._city_label(city)
		text = self._normalize_whitespace(value)
		if not city_label or not text:
			return text

		location_match = re.search(rf'\b{re.escape(city_label)}\s+LOCATION\b', text, re.IGNORECASE)
		city_match = location_match or re.search(rf'\b{re.escape(city_label)}\b', text, re.IGNORECASE)
		if not city_match:
			return text

		start_index = city_match.start()
		promotion_prefix = list(re.finditer(r'happy hour|late night', text[:start_index], re.IGNORECASE))
		if promotion_prefix:
			start_index = promotion_prefix[-1].start()

		end_index = len(text)
		blocked_location_tokens = {
			'happy', 'hour', 'late', 'night', 'new', 'close', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
		}
		for match in re.finditer(r'\b(?P<label>[A-Za-z]+(?:\s+[A-Za-z]+){0,2})\s+LOCATION\b', text[city_match.end():], re.IGNORECASE):
			label = self._normalize_whitespace(match.group('label'))
			label_tokens = {token.lower() for token in label.split()}
			if city_label.lower() == label.lower() or label_tokens & blocked_location_tokens:
				continue
			end_index = city_match.end() + match.start()
			break
		return text[start_index:end_index].strip()

	def _build_deal_from_text(self, text, page_url, operating_hours=None):
		deal_type = self._infer_deal_type(text)
		if deal_type is None:
			return None

		happy_hours = self._extract_happy_hours(
			text,
			operating_hours=operating_hours,
			prefer_pm=deal_type == DealType.HAPPY_HOUR,
		)
		title = self._build_title(text, deal_type)
		price_match = self.PRICE_PATTERN.search(text)
		return ImportedDeal(
			title=title,
			deal_type=deal_type,
			description=text[:400],
			price_text=price_match.group(1) if price_match else '',
			terms='',
			external_id=self._default_external_id(f'{page_url}#{title}#{self._normalize_whitespace(text)}'),
			source_name=self.source_name,
			source_url=page_url,
			happy_hours=happy_hours,
		)

	def _extract_happy_hours(self, text, operating_hours=None, prefer_pm=False):
		happy_hours = []
		matches = list(self.TIME_RANGE_PATTERN.finditer(text))

		if not matches:
			return happy_hours

		cursor = 0
		for match in matches:
			start = self._normalize_time(match.group('start'), prefer_pm=prefer_pm)
			if not start:
				cursor = match.end()
				continue

			weekday_context = text[cursor:match.start()]
			weekdays = self._extract_weekdays_from_text(weekday_context)
			if not weekdays:
				weekdays = [weekday for _, weekday in self.WEEKDAY_PATTERNS[:5]]

			for weekday in weekdays:
				end = self._normalize_end_time(match.group('end'), weekday, operating_hours or {}, prefer_pm=prefer_pm)
				if not end:
					continue
				happy_hours.append(ImportedHappyHour(weekday=weekday, start_time=start, end_time=end))
			cursor = match.end()
		return happy_hours[:14]

	def _normalize_end_time(self, value, weekday, operating_hours, prefer_pm=False):
		cleaned = self._normalize_whitespace(value).lower().replace('.', '')
		if cleaned == 'close':
			return operating_hours.get(weekday) or '23:59'
		return self._normalize_time(value, prefer_pm=prefer_pm)

	def _extract_operating_hours(self, source, source_documents=None):
		hours_documents = self._documents_for_role(source_documents or [], 'hours')
		if not hours_documents:
			return []

		text = self._normalize_whitespace(hours_documents[0]['soup'].get_text(' ', strip=True))
		text = self._city_scoped_hours_text(text, source.get('city'))
		return self._parse_operating_hours(text)

	def _operating_hours_lookup(self, operating_hours):
		return {window.weekday: window.close_time for window in operating_hours}

	def _city_scoped_hours_text(self, text, city):
		city_label = self._city_label(city)
		if not city_label:
			return text

		start_match = re.search(rf'\b{re.escape(city_label)}\s+Hours\b', text, re.IGNORECASE)
		if not start_match:
			return text

		end_index = len(text)
		for match in re.finditer(r'\b(?P<label>[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+Hours\b', text[start_match.end():], re.IGNORECASE):
			label = self._normalize_whitespace(match.group('label'))
			if label.lower() == city_label.lower() or label.lower() == 'tasting room':
				continue
			end_index = start_match.end() + match.start()
			break

		return text[start_match.start():end_index].strip()

	def _parse_operating_hours(self, text):
		operating_hours = {}
		for match in re.finditer(
			rf'(?P<days>(?:{self.WEEKDAY_REGEX})(?:\s*(?:-|to)\s*(?:{self.WEEKDAY_REGEX}))?)\s*:\s*(?P<open>\d{{1,2}}(?::\d{{2}})?\s*(?:am|pm)?)\s*(?:-|to)\s*(?P<close>\d{{1,2}}(?::\d{{2}})?\s*(?:am|pm)?)',
			text,
			re.IGNORECASE,
		):
			weekdays = self._extract_weekdays_from_text(match.group('days'))
			open_time = self._normalize_time(match.group('open'))
			close_time = self._normalize_time(match.group('close'))
			if not weekdays or not open_time or not close_time:
				continue
			for weekday in weekdays:
				operating_hours[weekday] = ImportedOperatingHour(
					weekday=weekday,
					open_time=open_time,
					close_time=close_time,
				)
		return [operating_hours[weekday] for _, weekday in self.WEEKDAY_PATTERNS if weekday in operating_hours]

	def _extract_weekdays_from_text(self, value):
		text = self._normalize_whitespace(value).lower()
		if not text:
			return []

		weekdays = []
		used_tokens = []
		range_pattern = re.compile(rf'(?P<start>{self.WEEKDAY_REGEX})\s*(?:-|to)\s*(?P<end>{self.WEEKDAY_REGEX})', re.IGNORECASE)
		for match in range_pattern.finditer(text):
			start_day = self._weekday_alias_value(match.group('start'))
			end_day = self._weekday_alias_value(match.group('end'))
			if start_day is None or end_day is None:
				continue
			weekdays.extend(self._expand_weekday_range(start_day, end_day))
			used_tokens.extend([match.group('start').lower(), match.group('end').lower()])

		single_pattern = re.compile(rf'\b({self.WEEKDAY_REGEX})\b', re.IGNORECASE)
		for match in single_pattern.finditer(text):
			token = match.group(1).lower()
			if token in used_tokens:
				continue
			weekday = self._weekday_alias_value(token)
			if weekday is not None:
				weekdays.append(weekday)

		return list(dict.fromkeys(weekdays))

	def _weekday_alias_value(self, token):
		normalized = token.lower().strip()
		weekday = self.WEEKDAY_ALIASES.get(normalized)
		if weekday is not None:
			return weekday
		if normalized.endswith('s'):
			return self.WEEKDAY_ALIASES.get(normalized[:-1])
		return None

	def _expand_weekday_range(self, start_day, end_day):
		sequence = [weekday for _, weekday in self.WEEKDAY_PATTERNS]
		start_index = sequence.index(start_day)
		end_index = sequence.index(end_day)
		if start_index <= end_index:
			return sequence[start_index:end_index + 1]
		return sequence[start_index:] + sequence[:end_index + 1]

	def _build_title(self, text, deal_type):
		sentences = re.split(r'[.!?]\s+', text)
		first_sentence = sentences[0].strip(' -:') if sentences else text
		if deal_type == DealType.HAPPY_HOUR and re.search(r'\blate night happy hour\b', first_sentence, re.IGNORECASE):
			return 'Late Night Happy Hour'
		if deal_type == DealType.HAPPY_HOUR and re.search(self.WEEKDAY_REGEX, first_sentence, re.IGNORECASE):
			return 'Happy Hour'
		if len(first_sentence) <= 80:
			return first_sentence
		fallback_titles = {
			DealType.HAPPY_HOUR: 'Happy Hour',
			DealType.DAILY_SPECIAL: 'Daily Special',
			DealType.DISCOUNT: 'Discount Offer',
			DealType.LIMITED_TIME: 'Limited-Time Offer',
		}
		return fallback_titles.get(deal_type, 'Website Promotion')

	def _infer_deal_type(self, text):
		for deal_type, pattern in self.DEAL_TYPE_PATTERNS:
			if pattern.search(text):
				return deal_type
		return None

	def _find_structured_business_data(self, soup):
		for script in soup.find_all('script', attrs={'type': 'application/ld+json'}):
			content = script.string or script.get_text(strip=True)
			if not content:
				continue
			try:
				payload = json.loads(content)
			except json.JSONDecodeError:
				continue
			for candidate in self._flatten_json_ld(payload):
				candidate_type = candidate.get('@type')
				if isinstance(candidate_type, list):
					candidate_type = ' '.join(candidate_type)
				if candidate_type and any(token in str(candidate_type).lower() for token in ['restaurant', 'bar', 'cafe', 'foodestablishment', 'localbusiness']):
					address = candidate.get('address') if isinstance(candidate.get('address'), dict) else {}
					return {
						'name': candidate.get('name', ''),
						'url': candidate.get('url', ''),
						'telephone': candidate.get('telephone', ''),
						'streetAddress': address.get('streetAddress', ''),
						'addressLocality': address.get('addressLocality', ''),
						'addressRegion': address.get('addressRegion', ''),
						'postalCode': address.get('postalCode', ''),
						'@type': candidate_type,
					}
		return {}

	def _flatten_json_ld(self, payload):
		if isinstance(payload, list):
			for item in payload:
				yield from self._flatten_json_ld(item)
		elif isinstance(payload, dict):
			yield payload
			for key in ['@graph', 'mainEntity', 'itemListElement']:
				if key in payload:
					yield from self._flatten_json_ld(payload[key])

	def _extract_page_contact_details(self, soup, city):
		details = {'address_line_1': '', 'postal_code': '', 'state': '', 'phone_number': ''}
		html = str(soup)
		self._merge_contact_details(details, self._extract_contact_details_from_html(html, city))
		self._merge_contact_details(details, self._extract_contact_details_from_links(soup, city))
		return details

	def _extract_contact_details_from_html(self, html, city):
		fragment = self._city_scoped_contact_fragment(html, city)
		plain_text = self._normalize_whitespace(BeautifulSoup(fragment, 'html.parser').get_text(' ', strip=True))
		details = {
			'address_line_1': self._first_match(
				fragment,
				[
					r'"streetAddress":"([^"]+)"',
					r'"addressLine1":"([^"]+)"',
					r'"address_street_1":"([^"]+)"',
				],
			),
			'postal_code': self._first_match(
				fragment,
				[
					r'"postalCode":"([^"]+)"',
					r'"post_code":"([^"]+)"',
				],
			),
			'state': self._first_match(
				fragment,
				[
					r'"addressRegion":"([^"]+)"',
					r'"state":"([^"]+)"',
				],
			),
			'phone_number': self._first_match(
				fragment,
				[
					r'"telephone":"([^"]+)"',
					r'"phone":"([^"]+)"',
				],
			),
		}
		self._merge_contact_details(details, self._extract_details_from_address_block(plain_text, city))
		return details

	def _extract_contact_details_from_links(self, soup, city):
		details = {'address_line_1': '', 'postal_code': '', 'state': '', 'phone_number': ''}
		for anchor in soup.find_all('a', href=True):
			href = self._normalize_whitespace(unquote(anchor['href']).replace('+', ' '))
			text = self._normalize_whitespace(anchor.get_text(' ', strip=True))

			if not details['phone_number']:
				phone_match = re.search(r'tel:([^?#]+)', href, re.IGNORECASE)
				if phone_match:
					details['phone_number'] = phone_match.group(1)

			self._merge_contact_details(details, self._extract_details_from_address_block(text, city))
			self._merge_contact_details(details, self._extract_details_from_address_block(href, city))
		return details

	def _extract_details_from_address_block(self, value, city):
		city_label = self._city_label(city)
		if not value or not city_label:
			return {'address_line_1': '', 'postal_code': '', 'state': '', 'phone_number': ''}

		match = re.search(
			rf'(?P<address_line_1>\d{{1,5}}\s+[^,|]+?)\s*(?:,|\||\s)+(?P<city>{re.escape(city_label)})\s*,?\s*(?P<state>CA|California)\s*(?P<postal_code>\d{{5}})?',
			value,
			re.IGNORECASE,
		)
		if not match:
			return {'address_line_1': '', 'postal_code': '', 'state': '', 'phone_number': ''}

		return {
			'address_line_1': self._normalize_whitespace(match.group('address_line_1').replace(' ,', ',')),
			'postal_code': match.group('postal_code') or '',
			'state': match.group('state') or '',
			'phone_number': '',
		}

	def _city_scoped_fragment(self, html, city):
		city_label = self._city_label(city)
		for token in [f'"city":"{city_label}"', f'"addressLocality":"{city_label}"', city_label]:
			index = html.lower().find(token.lower())
			if index != -1:
				return html[max(0, index - 300): index + 1800]
		return html

	def _city_scoped_contact_fragment(self, html, city):
		city_label = self._city_label(city)
		for pattern in [
			rf'\{{[^{{}}]{{0,1200}}"city":"{re.escape(city_label)}"[^{{}}]{{0,1200}}\}}',
			rf'\{{[^{{}}]{{0,1200}}"addressLocality":"{re.escape(city_label)}"[^{{}}]{{0,1200}}\}}',
		]:
			match = re.search(pattern, html, re.IGNORECASE)
			if match:
				return match.group(0)
		return self._city_scoped_fragment(html, city)

	def _merge_contact_details(self, base, extra):
		for key, value in extra.items():
			if value and not base.get(key):
				base[key] = value

	def _first_match(self, value, patterns):
		for pattern in patterns:
			match = re.search(pattern, value, re.IGNORECASE)
			if match:
				return self._normalize_whitespace(match.group(1).replace('\\/', '/'))
		return ''

	def _resolve_city(self, configured_value, structured_value, source_url=''):
		configured_city = self._normalize_city_value(configured_value)
		structured_city = self._normalize_city_value(structured_value)

		if configured_city and configured_city not in self.allowed_cities:
			raise ValueError(f'Unsupported city for business source: {configured_city}')
		if structured_city and structured_city not in self.allowed_cities:
			raise ValueError(f'Business source resolved outside supported cities: {structured_city}')
		if configured_city and structured_city and configured_city != structured_city:
			raise ValueError(
				f'Business source city mismatch for {source_url or "configured source"}: expected {configured_city}, got {structured_city}'
			)

		resolved_city = configured_city or structured_city or City.VENTURA
		if resolved_city not in self.allowed_cities:
			raise ValueError(f'Unsupported city for business source: {resolved_city}')
		return resolved_city

	def _normalize_city_value(self, value):
		if not value:
			return None
		key = value.strip().lower()
		return self.CITY_MAP.get(key, key)

	def _city_label(self, city):
		labels = {
			City.VENTURA: 'Ventura',
			City.OXNARD: 'Oxnard',
			City.CAMARILLO: 'Camarillo',
		}
		return labels.get(city, '')

	def _normalize_state_value(self, value):
		if not value:
			return ''
		return 'CA' if value.strip().lower() == 'california' else value

	def _looks_like_url(self, value):
		return value.strip().lower().startswith(('http://', 'https://')) if value else False

	def _resolve_venue_type(self, configured_value, structured_value):
		if configured_value:
			return configured_value
		structured_key = (structured_value or '').strip().lower()
		if 'restaurant' in structured_key:
			return VenueType.RESTAURANT
		if 'bar' in structured_key:
			return VenueType.BAR
		if 'cafe' in structured_key:
			return VenueType.CAFE
		return VenueType.OTHER

	def _normalize_time(self, value, prefer_pm=False):
		cleaned = value.strip().lower().replace('.', '')
		if cleaned == 'close':
			return '23:59'
		if ':' not in cleaned:
			cleaned = cleaned.replace('am', ':00am').replace('pm', ':00pm')
		match = re.match(r'(?P<hour>\d{1,2}):(?P<minute>\d{2})(?P<meridiem>am|pm)?', cleaned)
		if not match:
			return None
		hour = int(match.group('hour'))
		minute = match.group('minute')
		meridiem = match.group('meridiem')
		if meridiem is None and prefer_pm and 1 <= hour <= 11:
			meridiem = 'pm'
		if meridiem == 'pm' and hour != 12:
			hour += 12
		if meridiem == 'am' and hour == 12:
			hour = 0
		return f'{hour:02d}:{minute}'

	def _title_fallback(self, soup):
		title = soup.title.string.strip() if soup.title and soup.title.string else ''
		return title.split('|')[0].strip() if title else 'Business Listing'

	def _default_external_id(self, value):
		parsed = urlparse(value)
		base = parsed.netloc + parsed.path if parsed.netloc else value
		normalized_base = re.sub(r'[^a-z0-9]+', '-', base.lower()).strip('-') or 'listing'
		digest = sha256(value.encode('utf-8')).hexdigest()[:12]
		prefix = normalized_base[:100].rstrip('-') or 'listing'
		return f'{prefix}-{digest}'[:150]

	def _normalize_whitespace(self, value):
		return re.sub(r'\s+', ' ', value).strip()

	def _coalesce(self, *values):
		for value in values:
			if value:
				return value
		return ''