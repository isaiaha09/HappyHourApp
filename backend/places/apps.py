from django.apps import AppConfig


class PlacesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'places'
    verbose_name = 'HappyHour'

    def ready(self):
        from . import signals  # noqa: F401