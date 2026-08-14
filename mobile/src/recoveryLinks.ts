export type RecoveryDeepLink =
  | { kind: 'forgot-password'; token: string }
  | { kind: 'forgot-username' }
  | null;

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseRecoveryDeepLink(value: string): RecoveryDeepLink {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value.trim());
  } catch {
    return null;
  }

  const route = parsedUrl.host.toLowerCase();
  if (route === 'forgot-username') {
    return { kind: 'forgot-username' };
  }

  if (route !== 'forgot-password') {
    return null;
  }

  const pathToken = parsedUrl.pathname.split('/').filter(Boolean)[0] ?? '';
  const token = decodePathSegment(pathToken || parsedUrl.searchParams.get('token') || '');
  return token ? { kind: 'forgot-password', token } : null;
}