from os import getenv


def load_env_file(base_dir):
    env_path = base_dir / '.env'
    if not env_path.exists():
        return {}

    values = {}
    for line in env_path.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            continue

        key, raw_value = stripped.split('=', 1)
        key = key.strip()
        if not key:
            continue

        value = raw_value.strip().strip('"').strip("'")
        values[key] = value

    return values


def get_env(name, env_values, default=''):
    return getenv(name, env_values.get(name, default))


def get_int_env(name, env_values, default=0):
    value = get_env(name, env_values, '')
    if value == '':
        return default

    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def get_bool_env(name, env_values, default=False):
    value = str(get_env(name, env_values, '')).strip().lower()
    if value == '':
        return default
    if value in {'1', 'true', 'yes', 'on'}:
        return True
    if value in {'0', 'false', 'no', 'off'}:
        return False
    return default