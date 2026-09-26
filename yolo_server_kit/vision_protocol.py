import json


MAX_CONTROL_MESSAGE_BYTES = 256


def parse_video_subscription(message):
    """Return the requested video state, or None for an invalid control message."""
    if not isinstance(message, str) or len(message.encode('utf-8')) > MAX_CONTROL_MESSAGE_BYTES:
        return None
    try:
        payload = json.loads(message)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(payload, dict) or payload.get('type') != 'video':
        return None
    enabled = payload.get('enabled')
    return enabled if isinstance(enabled, bool) else None
