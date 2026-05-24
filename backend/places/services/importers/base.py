from abc import ABC, abstractmethod
from hashlib import sha256

import requests
from django.conf import settings
from django.core.cache import caches


class BaseHtmlImporter(ABC):
	source_name = ''
	source_url = ''

	def __init__(self, session=None):
		self.session = session or requests.Session()

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
		response = self.session.get(
			url,
			headers={'User-Agent': 'HappyHourAppBot/0.1 (+local development import pipeline)'},
			timeout=20,
		)
		response.raise_for_status()
		return response.text

	def _fetch_binary_uncached(self, url):
		response = self.session.get(
			url,
			headers={'User-Agent': 'HappyHourAppBot/0.1 (+local development import pipeline)'},
			timeout=20,
		)
		response.raise_for_status()
		return response.content

	def load_records(self, html=None):
		return self.parse_html(html if html is not None else self.fetch_html())

	@abstractmethod
	def parse_html(self, html):
		raise NotImplementedError