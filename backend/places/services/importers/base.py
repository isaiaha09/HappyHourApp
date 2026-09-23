from abc import ABC, abstractmethod
from hashlib import sha256
import ipaddress
import socket
import time
from urllib.parse import urljoin, urlparse

import requests
from django.conf import settings
from django.core.cache import caches
from requests.adapters import HTTPAdapter


class _PinnedHTTPSAdapter(HTTPAdapter):
	"""Connect to one validated address while preserving HTTPS hostname checks."""

	def __init__(self, hostname, address):
		self._pinned_hostname = str(hostname or '').strip().lower()
		self._pinned_address = str(address or '').strip()
		super().__init__(max_retries=0)

	def get_connection_with_tls_context(self, request, verify, proxies=None, cert=None):
		if proxies:
			return super().get_connection_with_tls_context(request, verify, proxies=proxies, cert=cert)
		parsed = urlparse(request.url)
		if parsed.scheme.lower() != 'https' or parsed.hostname != self._pinned_hostname or not self._pinned_address:
			return super().get_connection_with_tls_context(request, verify, proxies=proxies, cert=cert)

		host_params, pool_kwargs = self.build_connection_pool_key_attributes(request, verify, cert)
		host_params = dict(host_params)
		pool_kwargs = dict(pool_kwargs)
		host_params['host'] = self._pinned_address
		pool_kwargs['server_hostname'] = self._pinned_hostname
		pool_kwargs['assert_hostname'] = self._pinned_hostname
		request.headers.setdefault('Host', parsed.netloc)
		return self.poolmanager.connection_from_host(**host_params, pool_kwargs=pool_kwargs)


class BaseHtmlImporter(ABC):
	source_name = ''
	source_url = ''
	_REDIRECT_STATUSES = {301, 302, 303, 307, 308}
	_USER_AGENT = 'HappyHourAppBot/0.1 (+local development import pipeline)'

	def __init__(self, session=None):
		self.session = session or requests.Session()
		if session is None:
			# Do not let ambient proxy/netrc settings redirect server-side imports.
			self.session.trust_env = False

	def fetch_html(self, url=None, use_cache=True):
		target_url = url or self.source_url
		if not target_url:
			raise ValueError('Importer source_url is required when no URL is provided.')

		if not use_cache:
			return self._fetch_html_uncached(target_url)

		cache = caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')]
		cache_key = self.get_cache_key(target_url)
		cached_html = cache.get(cache_key)
		if cached_html is not None:
			return cached_html

		html = self._fetch_html_uncached(target_url)
		timeout = getattr(settings, 'SOURCE_FETCH_CACHE_TIMEOUT', 300)
		if timeout and timeout > 0:
			cache.set(cache_key, html, timeout=timeout)
		return html

	def fetch_binary(self, url=None, use_cache=True):
		target_url = url or self.source_url
		if not target_url:
			raise ValueError('Importer source_url is required when no URL is provided.')

		if not use_cache:
			return self._fetch_binary_uncached(target_url)

		cache = caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')]
		cache_key = f'{self.get_cache_key(target_url)}:binary'
		cached_bytes = cache.get(cache_key)
		if cached_bytes is not None:
			return cached_bytes

		content = self._fetch_binary_uncached(target_url)
		timeout = getattr(settings, 'SOURCE_FETCH_CACHE_TIMEOUT', 300)
		if timeout and timeout > 0:
			cache.set(cache_key, content, timeout=timeout)
		return content

	def get_cache_key(self, url):
		cache_input = f'{self.__class__.__module__}.{self.__class__.__name__}:{self.source_name}:{url}'
		digest = sha256(cache_input.encode('utf-8')).hexdigest()
		return f'source-html:{digest}'

	def _fetch_html_uncached(self, url):
		return self._fetch_remote(url, binary=False)

	def _fetch_binary_uncached(self, url):
		return self._fetch_remote(url, binary=True)

	def _fetch_remote(self, url, binary=False):
		current_url = str(url or '').strip()
		try:
			max_redirects = max(0, int(getattr(settings, 'SOURCE_FETCH_MAX_REDIRECTS', 3) or 3))
		except (TypeError, ValueError):
			max_redirects = 3
		deadline = time.monotonic() + self._get_timeout_seconds()

		for _ in range(max_redirects + 1):
			remaining_seconds = deadline - time.monotonic()
			if remaining_seconds <= 0:
				raise TimeoutError('Source fetch timed out.')
			resolved_addresses = self._validate_source_url(current_url)
			pinned_address = resolved_addresses[0] if resolved_addresses else None
			response = self._request_source_url(current_url, timeout_seconds=remaining_seconds, pinned_address=pinned_address)
			try:
				status_code = int(getattr(response, 'status_code', 200) or 200)
				if status_code in self._REDIRECT_STATUSES:
					location = str((getattr(response, 'headers', {}) or {}).get('Location') or '').strip()
					if not location:
						raise ValueError('Source redirect did not include a destination.')
					current_url = urljoin(current_url, location)
					continue

				response.raise_for_status()
				if binary:
					return self._read_response_bytes(response, self._get_response_limit('SOURCE_FETCH_MAX_BINARY_BYTES', 16 * 1024 * 1024), deadline=deadline)
				content = self._read_response_bytes(response, self._get_response_limit('SOURCE_FETCH_MAX_HTML_BYTES', 2 * 1024 * 1024), deadline=deadline)
				encoding = getattr(response, 'encoding', None) or 'utf-8'
				return content.decode(encoding, errors='replace')
			finally:
				close = getattr(response, 'close', None)
				if callable(close):
					close()

		raise ValueError('Source redirected too many times.')

	def _get_timeout_seconds(self):
		try:
			timeout_seconds = max(1, float(getattr(settings, 'SOURCE_FETCH_TIMEOUT_SECONDS', 20) or 20))
		except (TypeError, ValueError):
			timeout_seconds = 20
		return timeout_seconds

	def _request_source_url(self, url, timeout_seconds=None, pinned_address=None):
		if pinned_address and isinstance(self.session, requests.Session):
			hostname = urlparse(url).hostname
			if hostname:
				self.session.mount(f'https://{hostname.lower()}/', _PinnedHTTPSAdapter(hostname, pinned_address))
		request_kwargs = {
			'headers': {'User-Agent': self._USER_AGENT},
			'timeout': timeout_seconds or self._get_timeout_seconds(),
		}
		if isinstance(self.session, requests.Session):
			request_kwargs.update({'allow_redirects': False, 'stream': True})
		return self.session.get(url, **request_kwargs)

	def _validate_source_url(self, url):
		if len(url) > self._get_response_limit('SOURCE_FETCH_MAX_URL_LENGTH', 2048):
			raise ValueError('Source URL is too long.')

		try:
			parsed = urlparse(url)
			hostname = parsed.hostname
			parsed.port
		except ValueError as exc:
			raise ValueError('Source URL is invalid.') from exc

		if parsed.scheme != 'https' or not hostname or parsed.username or parsed.password:
			raise ValueError('Source URL must be a credential-free HTTPS URL.')

		normalized_hostname = hostname.rstrip('.').lower()
		if normalized_hostname in {'localhost', 'localhost.localdomain'} or normalized_hostname.endswith(('.local', '.internal', '.lan')):
			raise ValueError('Source URL must resolve to a public host.')

		if isinstance(self.session, requests.Session):
			try:
				port = parsed.port or 443
				addresses = {
					str(result[4][0])
					for result in socket.getaddrinfo(normalized_hostname, port, type=socket.SOCK_STREAM)
				}
			except (OSError, ValueError) as exc:
				raise ValueError('Source host could not be resolved.') from exc
			if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
				raise ValueError('Source URL must resolve only to public IP addresses.')
			return tuple(sorted(addresses))

		try:
			literal_address = ipaddress.ip_address(normalized_hostname)
		except ValueError:
			return
		if not literal_address.is_global:
			raise ValueError('Source URL must resolve to a public host.')
		return (normalized_hostname,)

	def _get_response_limit(self, setting_name, fallback):
		try:
			return max(1, int(getattr(settings, setting_name, fallback) or fallback))
		except (TypeError, ValueError):
			return fallback

	def _read_response_bytes(self, response, max_bytes, deadline=None):
		headers = getattr(response, 'headers', {}) or {}
		try:
			declared_length = int(headers.get('Content-Length', 0) or 0)
		except (TypeError, ValueError):
			declared_length = 0
		if declared_length > max_bytes:
			raise ValueError('Source response is too large.')

		iter_content = getattr(response, 'iter_content', None)
		if callable(iter_content):
			chunks = []
			total_bytes = 0
			for chunk in iter_content(chunk_size=64 * 1024):
				if deadline is not None and time.monotonic() >= deadline:
					raise TimeoutError('Source fetch timed out.')
				if not chunk:
					continue
				chunk = bytes(chunk)
				total_bytes += len(chunk)
				if total_bytes > max_bytes:
					raise ValueError('Source response is too large.')
				chunks.append(chunk)
			return b''.join(chunks)

		content = getattr(response, 'content', b'')
		if isinstance(content, str):
			content = content.encode('utf-8')
		content = bytes(content or b'')
		if len(content) > max_bytes:
			raise ValueError('Source response is too large.')
		return content

	def load_records(self, html=None):
		return self.parse_html(html if html is not None else self.fetch_html())

	@abstractmethod
	def parse_html(self, html):
		raise NotImplementedError
