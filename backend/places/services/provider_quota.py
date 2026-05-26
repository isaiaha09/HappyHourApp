from dataclasses import dataclass
from datetime import date

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from places.models import ProviderUsageWindow


@dataclass(frozen=True)
class ProviderQuotaPolicy:
	provider_name: str
	window_kind: str
	limit_setting: str
	reserve_setting: str
	api_key_setting: str

	@property
	def transaction_limit(self):
		return int(getattr(settings, self.limit_setting, 0) or 0)

	@property
	def reserve_threshold(self):
		return int(getattr(settings, self.reserve_setting, 0) or 0)

	@property
	def api_key(self):
		return str(getattr(settings, self.api_key_setting, '') or '').strip()


DISCOVERY_PROVIDER_POLICIES = (
	ProviderQuotaPolicy('here_places', ProviderUsageWindow.WindowKind.MONTH, 'HERE_MONTHLY_LIMIT', 'HERE_MONTHLY_RESERVE', 'HERE_API_KEY'),
	ProviderQuotaPolicy('tomtom_places', ProviderUsageWindow.WindowKind.DAY, 'TOMTOM_DAILY_LIMIT', 'TOMTOM_DAILY_RESERVE', 'TOMTOM_API_KEY'),
)


def get_provider_policy(provider_name):
	for policy in DISCOVERY_PROVIDER_POLICIES:
		if policy.provider_name == provider_name:
			return policy
	return None


def select_discovery_provider():
	for policy in DISCOVERY_PROVIDER_POLICIES:
		if not policy.api_key:
			continue
		if has_provider_budget(policy.provider_name):
			return policy.provider_name
	return 'openstreetmap_places'


def has_provider_budget(provider_name):
	policy = get_provider_policy(provider_name)
	if policy is None or not policy.api_key:
		return False

	usage_window = _get_or_create_usage_window(policy)
	return usage_window.consumed_transactions < _budget_cutoff(policy)


def consume_provider_transaction(provider_name):
	policy = get_provider_policy(provider_name)
	if policy is None or not policy.api_key:
		return False

	with transaction.atomic():
		usage_window = _get_or_create_usage_window(policy, for_update=True)
		if usage_window.consumed_transactions >= _budget_cutoff(policy):
			return False

		usage_window.consumed_transactions += 1
		usage_window.transaction_limit = policy.transaction_limit
		usage_window.reserve_threshold = policy.reserve_threshold
		usage_window.save(update_fields=['consumed_transactions', 'transaction_limit', 'reserve_threshold', 'updated_at'])
		return True


def get_provider_usage_statuses():
	statuses = []
	for policy in DISCOVERY_PROVIDER_POLICIES:
		window = _get_or_create_usage_window(policy)
		budget_cutoff = _budget_cutoff(policy)
		statuses.append({
			'provider_name': policy.provider_name,
			'configured': bool(policy.api_key),
			'window_kind': policy.window_kind,
			'window_start': window.window_start,
			'consumed_transactions': window.consumed_transactions,
			'transaction_limit': window.transaction_limit,
			'reserve_threshold': window.reserve_threshold,
			'budget_cutoff': budget_cutoff,
			'remaining_transactions': max(0, window.transaction_limit - window.consumed_transactions),
			'remaining_before_reserve': max(0, budget_cutoff - window.consumed_transactions),
			'available': bool(policy.api_key) and window.consumed_transactions < budget_cutoff,
		})
	return statuses


def _get_or_create_usage_window(policy, for_update=False):
	window_start = _window_start_for_policy(policy)
	queryset = ProviderUsageWindow.objects
	if for_update:
		queryset = queryset.select_for_update()

	usage_window = queryset.filter(
		provider_name=policy.provider_name,
		window_kind=policy.window_kind,
		window_start=window_start,
	).first()
	if usage_window is not None:
		if usage_window.transaction_limit != policy.transaction_limit or usage_window.reserve_threshold != policy.reserve_threshold:
			usage_window.transaction_limit = policy.transaction_limit
			usage_window.reserve_threshold = policy.reserve_threshold
			usage_window.save(update_fields=['transaction_limit', 'reserve_threshold', 'updated_at'])
		return usage_window

	return ProviderUsageWindow.objects.create(
		provider_name=policy.provider_name,
		window_kind=policy.window_kind,
		window_start=window_start,
		consumed_transactions=0,
		transaction_limit=policy.transaction_limit,
		reserve_threshold=policy.reserve_threshold,
	)


def _window_start_for_policy(policy):
	today = timezone.localdate()
	if policy.window_kind == ProviderUsageWindow.WindowKind.MONTH:
		return date(today.year, today.month, 1)
	return today


def _budget_cutoff(policy):
	return max(0, policy.transaction_limit - policy.reserve_threshold)