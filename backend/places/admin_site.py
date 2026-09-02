import logging
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib import messages
from django.core.cache import cache
from django.core.paginator import Paginator
from django.db import connection
from django.http import HttpResponseForbidden, HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.http import url_has_allowed_host_and_scheme
from unfold.sites import UnfoldAdminSite

from .services.admin_operations import (
    get_audit_timeline,
    get_catalog_health,
    get_claim_review_queryset,
    get_content_report_queue_queryset,
    get_cached_analytics_data,
)
from .admin_security import (
    AdminAuthenticationForm,
    AdminMFACodeForm,
    authenticate_admin_mfa,
    build_admin_mfa_qr_data_uri,
    emit_admin_security_event,
    mark_admin_mfa_verified,
    mark_admin_session_active,
)
from .services.account_profiles import get_or_create_account_profile
from .services.render_storage import fetch_render_storage


class HappyHourAdminSite(UnfoldAdminSite):
    site_header = 'DiningDealz Administration'
    site_title = 'DiningDealz Admin'
    index_title = 'Operations Dashboard'
    login_form = AdminAuthenticationForm

    section_groups = [
        {
            'name': 'Administration',
            'app_label': 'administration',
            'models': [
                'Users',
                'Groups',
            ],
        },
        {
            'name': 'Accounts and Claims',
            'app_label': 'accounts_and_claims',
            'models': [
                'Customer Accounts',
                'Business Accounts',
                'Business Claims',
            ],
        },
        {
            'name': 'Memberships',
            'app_label': 'memberships',
            'models': [
                'Business Memberships',
            ],
        },
        {
            'name': 'Businesses',
            'app_label': 'businesses',
            'models': [
                'List of Businesses',
                'Deleted Businesses',
            ],
        },
        {
            'name': 'Growth and Analytics',
            'app_label': 'growth_and_analytics',
            'models': [
                'Business posts',
                'Sponsored campaigns',
                'Feed impressions',
                'Feed engagements',
            ],
        },
        {
            'name': 'Trust and Safety',
            'app_label': 'trust_and_safety',
            'models': [
                'Content Reports',
                'Business direct message threads',
                'Business direct messages',
            ],
        },
        {
            'name': 'Customer Engagement',
            'app_label': 'customer_engagement',
            'models': [
                'Favorite businesss',
                'Favorite business notifications',
            ],
        },
    ]

    def login(self, request, extra_context=None):
        response = super().login(request, extra_context=extra_context)
        if getattr(request, '_admin_login_success', False) and hasattr(request, 'session'):
            mark_admin_session_active(
                request,
                mfa_verified=not getattr(request, '_admin_login_requires_mfa', False),
                start_session=True,
                user=getattr(request, 'user', None),
            )
        return response

    def get_urls(self):
        operation_urls = [
            path('mfa/', self.admin_view(self.mfa_view), name='mfa'),
            path('security/', self.admin_view(self.security_view), name='security'),
            path('operations/claim-review/', self.admin_view(self.claim_review_queue_view), name='operations_review_queue'),
            path('operations/content-reports/', self.admin_view(self.content_report_queue_view), name='operations_report_queue'),
            path('operations/catalog-health/', self.admin_view(self.catalog_health_view), name='operations_catalog_health'),
            path('operations/analytics/', self.admin_view(self.analytics_view), name='operations_analytics'),
            path('operations/audit/', self.admin_view(self.audit_timeline_view), name='operations_audit_timeline'),
            path('operations/storage/', self.admin_view(self.storage_view), name='operations_storage'),
        ]
        return operation_urls + super().get_urls()

    def _safe_admin_next_url(self, request):
        candidate = str(request.POST.get('next') or request.GET.get('next') or '').strip()
        if not candidate:
            return reverse('happyhour_admin:index')

        parsed = urlsplit(candidate)
        admin_path = str(settings.ADMIN_URL_PATH or 'admin').strip('/')
        admin_prefix = f'/{admin_path}/'
        if parsed.scheme or parsed.netloc or not parsed.path.startswith(admin_prefix):
            return reverse('happyhour_admin:index')
        if not url_has_allowed_host_and_scheme(
            candidate,
            allowed_hosts={request.get_host()},
            require_https=request.is_secure(),
        ):
            return reverse('happyhour_admin:index')
        return candidate

    def mfa_view(self, request):
        profile = get_or_create_account_profile(request.user)
        next_url = self._safe_admin_next_url(request)
        if not profile.admin_two_factor_enabled:
            mark_admin_mfa_verified(request, request.user)
            return HttpResponseRedirect(next_url)
        if not profile.admin_two_factor_secret:
            emit_admin_security_event(request, 'admin_mfa_misconfigured', actor=request.user, log_level=logging.ERROR)
            return HttpResponseForbidden('Admin two-factor authentication is enabled but not configured correctly.')

        form = AdminMFACodeForm(request.POST or None)
        if request.method == 'POST' and form.is_valid():
            result = authenticate_admin_mfa(request, request.user, form.cleaned_data['otp_code'])
            if result == 'success':
                return HttpResponseRedirect(next_url)
            if result == 'rate_limited':
                form.add_error(None, 'Too many authenticator attempts. Try again later.')
            else:
                form.add_error('otp_code', 'The authenticator code is invalid or expired.')

        context = {
            **self.each_context(request),
            'title': 'Admin verification',
            'form': form,
            'next': next_url,
        }
        return TemplateResponse(request, 'admin/mfa.html', context)

    def security_view(self, request):
        profile = get_or_create_account_profile(request.user)
        form = AdminMFACodeForm(request.POST or None)
        action = str(request.POST.get('action') or '').strip().lower() if request.method == 'POST' else ''

        if action in {'begin', 'rotate'}:
            if profile.admin_two_factor_enabled and action == 'begin':
                messages.warning(request, 'Admin 2FA is already enabled. Use rotate to replace the authenticator.')
            else:
                profile.begin_admin_two_factor_setup()
                emit_admin_security_event(request, 'admin_mfa_enrollment_started', actor=request.user)
                messages.success(request, 'Scan the QR code with your authenticator app, then confirm it below.')
        elif action == 'confirm':
            if form.is_valid() and profile.admin_two_factor_pending_secret and profile.verify_admin_two_factor_code(form.cleaned_data['otp_code'], use_pending=True):
                profile.enable_admin_two_factor()
                mark_admin_mfa_verified(request, request.user)
                emit_admin_security_event(request, 'admin_mfa_enabled', actor=request.user, log_level=logging.WARNING)
                messages.success(request, 'Admin 2FA is now enabled for your account.')
            elif request.method == 'POST':
                emit_admin_security_event(request, 'admin_mfa_enrollment_failure', actor=request.user, log_level=logging.WARNING)
                form.add_error('otp_code', 'The authenticator code is invalid or expired.')
        elif action == 'disable':
            if form.is_valid() and profile.admin_two_factor_enabled and profile.verify_admin_two_factor_code(form.cleaned_data['otp_code']):
                profile.disable_admin_two_factor()
                mark_admin_mfa_verified(request, request.user)
                emit_admin_security_event(request, 'admin_mfa_disabled', actor=request.user, log_level=logging.WARNING)
                messages.warning(request, 'Admin 2FA is disabled for your account.')
            elif request.method == 'POST':
                emit_admin_security_event(request, 'admin_mfa_failure', actor=request.user, log_level=logging.WARNING)
                form.add_error('otp_code', 'The authenticator code is invalid or expired.')

        profile.refresh_from_db()
        pending_uri = profile.get_admin_two_factor_provisioning_uri(use_pending=True)
        context = {
            **self.each_context(request),
            'title': 'Admin security',
            'profile': profile,
            'form': form,
            'security_url': request.path,
            'pending_qr_code': build_admin_mfa_qr_data_uri(pending_uri),
        }
        return TemplateResponse(request, 'admin/security.html', context)

    def claim_review_queue_view(self, request):
        context = {
            **self.each_context(request),
            'title': 'Claim Review Queue',
            'claim_queue': get_claim_review_queryset(),
        }
        return TemplateResponse(request, 'admin/operations/claim_review_queue.html', context)

    def content_report_queue_view(self, request):
        context = {
            **self.each_context(request),
            'title': 'Content Report Queue',
            'report_queue': get_content_report_queue_queryset(),
        }
        return TemplateResponse(request, 'admin/operations/content_report_queue.html', context)

    def catalog_health_view(self, request):
        issue_filter = str(request.GET.get('issue') or '').strip()
        catalog_health = get_catalog_health(limit=None)
        attention = list(catalog_health.get('attention') or [])
        if issue_filter:
            attention = [
                item for item in catalog_health['attention']
                if issue_filter in {issue['code'] for issue in item['issues']}
            ]
        sort_defaults = {
            'business': 'asc',
            'city': 'asc',
            'issues': 'desc',
            'last_saved': 'desc',
        }
        sort_key = request.GET.get('sort', 'business')
        if sort_key not in sort_defaults:
            sort_key = 'business'
        direction = request.GET.get('direction')
        if direction not in {'asc', 'desc'}:
            direction = sort_defaults[sort_key]

        def sort_value(item):
            snapshot = item['snapshot']
            name = str(snapshot.name or '').casefold()
            city = str(snapshot.get_city_display() or snapshot.city or '').casefold()
            issue_count = len(item['issues'])
            updated_at = snapshot.updated_at.timestamp() if snapshot.updated_at else float('-inf')
            return {
                'business': (name, city, snapshot.pk),
                'city': (city, name, snapshot.pk),
                'issues': (issue_count, name, snapshot.pk),
                'last_saved': (updated_at, name, snapshot.pk),
            }[sort_key]

        attention.sort(key=sort_value, reverse=direction == 'desc')

        try:
            page_size = max(int(getattr(settings, 'ADMIN_CATALOG_HEALTH_PAGE_SIZE', 50)), 1)
        except (TypeError, ValueError):
            page_size = 50
        paginator = Paginator(attention, page_size)
        page = paginator.get_page(request.GET.get('page') or 1)
        catalog_health = {**catalog_health, 'attention': page.object_list}

        def sort_url(header_key):
            query = request.GET.copy()
            query['sort'] = header_key
            query.pop('page', None)
            if header_key == sort_key:
                query['direction'] = 'desc' if direction == 'asc' else 'asc'
            else:
                query['direction'] = sort_defaults[header_key]
            return f'?{query.urlencode()}'

        sort_headers = [
            {'key': 'business', 'label': 'Business', 'url': sort_url('business')},
            {'key': 'city', 'label': 'City', 'url': sort_url('city')},
            {'key': 'issues', 'label': 'Issues', 'url': sort_url('issues')},
            {'key': 'last_saved', 'label': 'Last saved', 'url': sort_url('last_saved')},
        ]
        for header in sort_headers:
            header['active'] = header['key'] == sort_key
            header['arrow'] = '↑' if direction == 'asc' else '↓'

        def issue_url(issue_code):
            query = request.GET.copy()
            query['issue'] = issue_code
            query.pop('page', None)
            return f'?{query.urlencode()}'

        for issue in catalog_health['issues']:
            issue['url'] = issue_url(issue['code'])
            issue['active'] = issue['code'] == issue_filter

        clear_issue_query = request.GET.copy()
        clear_issue_query.pop('issue', None)
        clear_issue_query.pop('page', None)
        clear_issue_url = f'?{clear_issue_query.urlencode()}' if clear_issue_query else '?'

        def page_url(page_number):
            query = request.GET.copy()
            query['page'] = page_number
            return f'?{query.urlencode()}'

        context = {
            **self.each_context(request),
            'title': 'Catalog Health',
            'catalog_health': catalog_health,
            'issue_filter': issue_filter,
            'filtered_attention_count': len(attention) if issue_filter else catalog_health['attention_count'],
            'sort_headers': sort_headers,
            'sort_key': sort_key,
            'sort_direction': direction,
            'clear_issue_url': clear_issue_url,
            'catalog_page': page,
            'catalog_previous_page_url': page_url(page.previous_page_number()) if page.has_previous() else '',
            'catalog_next_page_url': page_url(page.next_page_number()) if page.has_next() else '',
        }
        return TemplateResponse(request, 'admin/operations/catalog_health.html', context)

    def analytics_view(self, request):
        try:
            days = 30 if int(request.GET.get('days', 7)) >= 30 else 7
        except (TypeError, ValueError):
            days = 7
        context = {
            **self.each_context(request),
            'title': 'Analytics',
            'analytics': get_cached_analytics_data(days=days),
        }
        return TemplateResponse(request, 'admin/operations/analytics.html', context)

    def audit_timeline_view(self, request):
        context = {
            **self.each_context(request),
            'title': 'Audit Timeline',
            'audit_events': get_audit_timeline(limit=200),
        }
        return TemplateResponse(request, 'admin/operations/audit_timeline.html', context)

    def storage_view(self, request):
        storage = self.get_total_admin_storage_breakdown()
        render_storage = self.get_render_storage()
        context = {
            **self.each_context(request),
            'title': 'Storage and Health Status',
            'storage': storage,
            'storage_display': {
                key: self.format_storage_size(value)
                for key, value in storage.items()
                if key.endswith('_bytes')
            },
            'render_storage': render_storage,
            'render_storage_usage_display': self.format_optional_storage_size(render_storage.get('usage_bytes')),
            'render_storage_capacity_display': self.format_optional_storage_size(render_storage.get('capacity_bytes')),
            'render_storage_percent_display': self.format_storage_percent(render_storage.get('usage_percent')),
            'catalog_health': get_catalog_health(limit=12),
        }
        return TemplateResponse(request, 'admin/operations/storage.html', context)

    def get_app_list(self, request, app_label=None):
        original_app_list = super().get_app_list(request, app_label)
        all_models = []

        for app in original_app_list:
            for model in app['models']:
                model_copy = model.copy()
                model_copy['_source_app_label'] = app['app_label']
                all_models.append(model_copy)

        grouped_app_list = []
        consumed_model_names = set()

        for section in self.section_groups:
            section_models = []
            for model_name in section['models']:
                model = next(
                    (
                        candidate
                        for candidate in all_models
                        if candidate['name'] == model_name and candidate['name'] not in consumed_model_names
                    ),
                    None,
                )
                if model is None:
                    continue

                consumed_model_names.add(model['name'])
                section_models.append(model)

            if not section_models:
                continue

            grouped_app_list.append(
                {
                    'name': section['name'],
                    'app_label': section['app_label'],
                    'app_url': section_models[0].get('admin_url', ''),
                    'has_module_perms': True,
                    'models': section_models,
                }
            )

        for app in original_app_list:
            remaining_models = [
                model for model in app['models']
                if model['name'] not in consumed_model_names
            ]
            if not remaining_models:
                continue

            fallback_app = app.copy()
            fallback_app['models'] = remaining_models
            grouped_app_list.append(fallback_app)

        return grouped_app_list

    def get_path_storage_bytes(self, path_value):
        if not path_value:
            return 0

        path = Path(path_value)
        if not path.exists():
            return 0
        if path.is_file():
            return path.stat().st_size
        if path.is_dir():
            return sum(file_path.stat().st_size for file_path in path.rglob('*') if file_path.is_file())
        return 0

    def get_database_storage_bytes(self):
        try:
            if connection.vendor == 'sqlite':
                database_name = connection.settings_dict.get('NAME')
                if not database_name or str(database_name) == ':memory:':
                    return 0

                database_path = Path(database_name)
                sidecar_bytes = sum(
                    self.get_path_storage_bytes(database_path.with_name(f'{database_path.name}{suffix}'))
                    for suffix in ('-journal', '-wal', '-shm')
                )
                return self.get_path_storage_bytes(database_path) + sidecar_bytes

            if connection.vendor == 'postgresql':
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_database_size(current_database())')
                    row = cursor.fetchone()
                return int(row[0] or 0) if row else 0

            if connection.vendor == 'mysql':
                database_name = connection.settings_dict.get('NAME')
                if not database_name:
                    return 0

                with connection.cursor() as cursor:
                    cursor.execute(
                        '''
                        SELECT COALESCE(SUM(data_length + index_length), 0)
                        FROM information_schema.tables
                        WHERE table_schema = %s
                        ''',
                        [database_name],
                    )
                    row = cursor.fetchone()
                return int(row[0] or 0) if row else 0
        except Exception:
            return 0

        return 0

    def get_total_admin_storage_breakdown(self, allow_compute=True):
        cache_key = 'admin-storage-breakdown'
        cache_timeout = getattr(settings, 'ADMIN_STORAGE_CACHE_TIMEOUT', 60)
        try:
            cache_timeout = max(int(cache_timeout), 0)
        except (TypeError, ValueError):
            cache_timeout = 60

        if cache_timeout > 0:
            try:
                cached_storage = cache.get(cache_key)
            except Exception:
                cached_storage = None
            if cached_storage is not None:
                return cached_storage

        if not allow_compute:
            return {
                'database_bytes': 0,
                'media_bytes': 0,
                'discovery_bytes': 0,
                'total_bytes': 0,
            }

        database_bytes = self.get_database_storage_bytes()
        media_bytes = self.get_path_storage_bytes(settings.MEDIA_ROOT)
        discovery_bytes = self.get_path_storage_bytes(getattr(settings, 'DISCOVERY_JSON_PATH', None))
        total_bytes = database_bytes + media_bytes + discovery_bytes

        storage = {
            'database_bytes': database_bytes,
            'media_bytes': media_bytes,
            'discovery_bytes': discovery_bytes,
            'total_bytes': total_bytes,
        }
        if cache_timeout > 0:
            try:
                cache.set(cache_key, storage, cache_timeout)
            except Exception:
                pass
        return storage

    def get_render_storage(self, allow_compute=True):
        enabled = bool(getattr(settings, 'RENDER_STORAGE_ENABLED', True))
        resource_id = str(getattr(settings, 'RENDER_POSTGRES_ID', '') or '').strip()
        cache_key = f'admin-render-postgres-storage:{int(enabled)}:{resource_id or "unconfigured"}'
        cache_timeout = getattr(settings, 'RENDER_STORAGE_CACHE_TIMEOUT', 300)
        try:
            cache_timeout = max(int(cache_timeout), 0)
        except (TypeError, ValueError):
            cache_timeout = 300

        if cache_timeout > 0:
            try:
                cached_storage = cache.get(cache_key)
            except Exception:
                cached_storage = None
            if cached_storage is not None:
                return cached_storage

        configured = enabled and bool(
            str(getattr(settings, 'RENDER_API_KEY', '') or '').strip()
            and str(getattr(settings, 'RENDER_POSTGRES_ID', '') or '').strip()
        )
        unavailable_storage = {
            'configured': configured,
            'available': False,
            'usage_bytes': None,
            'capacity_bytes': None,
            'usage_percent': None,
            'usage_timestamp': None,
            'capacity_timestamp': None,
        }
        if not allow_compute or not enabled:
            return unavailable_storage

        storage = fetch_render_storage()
        if cache_timeout > 0:
            try:
                cache.set(cache_key, storage, cache_timeout)
            except Exception:
                pass
        return storage

    def format_storage_size(self, total_bytes):
        size = float(total_bytes)
        for unit in ('bytes', 'KB', 'MB', 'GB', 'TB'):
            if size < 1024 or unit == 'TB':
                if unit == 'bytes':
                    return f'{int(size)} {unit}'
                return f'{size:.2f} {unit}'
            size /= 1024

        return '0 bytes'

    def format_optional_storage_size(self, total_bytes):
        if total_bytes is None:
            return 'Unavailable'
        return self.format_storage_size(total_bytes)

    def format_storage_percent(self, percentage):
        if percentage is None:
            return '—'
        return f'{percentage:.2f}%'

    def each_context(self, request):
        context = super().each_context(request)
        storage = self.get_total_admin_storage_breakdown(
            allow_compute=bool(getattr(request.user, 'is_authenticated', False)),
        )
        render_storage = self.get_render_storage(
            allow_compute=bool(getattr(request.user, 'is_authenticated', False)),
        )
        total_bytes = storage['total_bytes']
        context['admin_database_storage_bytes'] = storage['database_bytes']
        context['admin_database_storage_display'] = self.format_storage_size(storage['database_bytes'])
        context['admin_media_storage_display'] = self.format_storage_size(storage['media_bytes'])
        context['admin_discovery_storage_display'] = self.format_storage_size(storage['discovery_bytes'])
        context['admin_total_storage_bytes'] = total_bytes
        context['admin_total_storage_display'] = self.format_storage_size(total_bytes)
        context['admin_total_storage_gb'] = f'{total_bytes / (1024 ** 3):.4f}'
        context['admin_render_storage_configured'] = render_storage['configured']
        context['admin_render_storage_available'] = render_storage['available']
        context['admin_render_storage_display'] = self.format_optional_storage_size(render_storage.get('usage_bytes'))
        context['admin_render_storage_capacity_display'] = self.format_optional_storage_size(render_storage.get('capacity_bytes'))
        context['admin_render_storage_percent_display'] = self.format_storage_percent(render_storage.get('usage_percent'))
        return context


happyhour_admin_site = HappyHourAdminSite(name='happyhour_admin')
