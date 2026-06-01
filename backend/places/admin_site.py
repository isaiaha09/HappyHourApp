from pathlib import Path

from django.conf import settings
from django.contrib.admin import AdminSite
from django.db import connection


class HappyHourAdminSite(AdminSite):
    site_header = 'HappyHour Administration'
    site_title = 'HappyHour Admin'
    index_title = 'Operations Dashboard'

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
            'name': 'Operations',
            'app_label': 'operations',
            'models': [
                'Provider Usage Windows',
            ],
        },
    ]

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

    def get_total_admin_storage_breakdown(self):
        database_bytes = self.get_database_storage_bytes()
        media_bytes = self.get_path_storage_bytes(settings.MEDIA_ROOT)
        discovery_bytes = self.get_path_storage_bytes(getattr(settings, 'DISCOVERY_JSON_PATH', None))
        total_bytes = database_bytes + media_bytes + discovery_bytes

        return {
            'database_bytes': database_bytes,
            'media_bytes': media_bytes,
            'discovery_bytes': discovery_bytes,
            'total_bytes': total_bytes,
        }

    def format_storage_size(self, total_bytes):
        size = float(total_bytes)
        for unit in ('bytes', 'KB', 'MB', 'GB', 'TB'):
            if size < 1024 or unit == 'TB':
                if unit == 'bytes':
                    return f'{int(size)} {unit}'
                return f'{size:.2f} {unit}'
            size /= 1024

        return '0 bytes'

    def each_context(self, request):
        context = super().each_context(request)
        storage = self.get_total_admin_storage_breakdown()
        total_bytes = storage['total_bytes']
        context['admin_database_storage_bytes'] = storage['database_bytes']
        context['admin_database_storage_display'] = self.format_storage_size(storage['database_bytes'])
        context['admin_media_storage_display'] = self.format_storage_size(storage['media_bytes'])
        context['admin_discovery_storage_display'] = self.format_storage_size(storage['discovery_bytes'])
        context['admin_total_storage_bytes'] = total_bytes
        context['admin_total_storage_display'] = self.format_storage_size(total_bytes)
        context['admin_total_storage_gb'] = f'{total_bytes / (1024 ** 3):.4f}'
        return context


happyhour_admin_site = HappyHourAdminSite(name='happyhour_admin')