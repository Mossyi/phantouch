import os
import re
from pathlib import Path
from urllib.parse import quote


LOCAL_ENV_PATH = Path(__file__).with_name('.env.yolo.local')


def load_local_camera_env(path=LOCAL_ENV_PATH, environ=None):
    """Load local camera settings without overriding process environment values."""
    target = os.environ if environ is None else environ
    path = Path(path)
    if not path.exists():
        return False

    for raw_line in path.read_text(encoding='utf-8-sig').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        target.setdefault(key, value)
    return True


def parse_camera_source(value):
    value = str(value).strip()
    return int(value) if value.isdigit() else value


def build_camera_source(environ=None):
    env = os.environ if environ is None else environ
    explicit_source = env.get('YOLO_CAMERA_SOURCE', '').strip()
    if explicit_source:
        return parse_camera_source(explicit_source)

    host = env.get('YOLO_CAMERA_HOST', '').strip()
    if not host:
        return 0

    protocol = env.get('YOLO_CAMERA_PROTOCOL', 'rtsp').strip().lower()
    if protocol not in {'rtsp', 'http', 'https'}:
        raise ValueError('YOLO_CAMERA_PROTOCOL must be rtsp, http, or https')

    port = env.get('YOLO_CAMERA_PORT', '').strip()
    path = env.get('YOLO_CAMERA_PATH', '/stream1').strip() or '/stream1'
    if not path.startswith('/'):
        path = f'/{path}'

    username = env.get('YOLO_CAMERA_USERNAME', '').strip()
    password = env.get('YOLO_CAMERA_PASSWORD', '')
    if password and not username:
        raise ValueError('YOLO_CAMERA_USERNAME is required when a camera password is set')

    auth = ''
    if username:
        auth = quote(username, safe='')
        if password:
            auth += f':{quote(password, safe="")}'
        auth += '@'

    port_segment = f':{port}' if port else ''
    return f'{protocol}://{auth}{host}{port_segment}{path}'


def describe_camera_source(source):
    """Return a log-safe source string with credentials and sensitive query values hidden."""
    description = re.sub(r'(?<=//)[^/@]+(?=@)', '***', str(source))
    return re.sub(
        r'(?i)(password|passwd|pwd|token|key)=([^&\s]+)',
        r'\1=***',
        description,
    )
