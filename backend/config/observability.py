import os


def init_sentry() -> None:
    dsn = os.environ.get('SENTRY_DSN', '').strip()
    if not dsn:
        return

    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    environment = os.environ.get('SENTRY_ENVIRONMENT', '').strip() or os.environ.get('RENDER_ENVIRONMENT', '').strip() or os.environ.get('DJANGO_ENV', '').strip() or 'production'
    release = os.environ.get('SENTRY_RELEASE', '').strip() or os.environ.get('RENDER_GIT_COMMIT', '').strip() or None

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release,
        integrations=[DjangoIntegration()],
        send_default_pii=False,
        traces_sample_rate=float(os.environ.get('SENTRY_TRACES_SAMPLE_RATE', '0').strip() or '0'),
        profiles_sample_rate=float(os.environ.get('SENTRY_PROFILES_SAMPLE_RATE', '0').strip() or '0'),
    )