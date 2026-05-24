from django.contrib.admin import AdminSite


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
                'Listing Snapshots',
                'Business Claims',
                'Business Memberships',
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


happyhour_admin_site = HappyHourAdminSite(name='happyhour_admin')