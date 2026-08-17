import re


BLOCKED_CONTENT_PATTERNS = (
    re.compile(r'\b(?:i(?:\'m| am)|we(?:\'re| are)|they(?:\'re| are))\s+(?:going to|gonna|will)\s+(?:kill|hurt|harm|shoot|stab|rape)\b', re.IGNORECASE),
    re.compile(r'\b(?:kill|hurt|harm|shoot|stab)\s+(?:yourself|himself|herself|them|you)\b', re.IGNORECASE),
    re.compile(r'\b(?:rape|sexual assault|child porn|csam)\b', re.IGNORECASE),
    re.compile(r'\b(?:n[i1]gg(?:er|a)|f[a@]gg?ot|k[i1]ke|sp[i1]c|tr[a@]nny)\b', re.IGNORECASE),
)

BLOCKED_CONTENT_MESSAGE = 'This content cannot be posted because it appears to contain threats, explicit abuse, or hateful content.'


def get_content_moderation_error(value):
    normalized = str(value or '').strip()
    if not normalized:
        return None

    if any(pattern.search(normalized) for pattern in BLOCKED_CONTENT_PATTERNS):
        return BLOCKED_CONTENT_MESSAGE

    return None
