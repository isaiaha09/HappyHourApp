export type RecoveryDeepLink =
  | { kind: 'forgot-password'; token: string }
  | { kind: 'forgot-username' }
  | { kind: 'business-profile'; slug: string }
  | { kind: 'business-claim-retry'; token: string }
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
  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
  const isDiningDealzWebProfile = (route === 'diningdealz.com' || route === 'www.diningdealz.com')
    && (pathSegments[0]?.toLowerCase() === 'place' || pathSegments[0]?.toLowerCase() === 'places');
  const isDiningDealzSharedProfile = (
    route === 'www.diningdealz.com'
    || route === 'diningdealz.com'
    || route === 'backend.diningdealz.com'
    || route === 'link.diningdealz.com'
  )
    && pathSegments[0]?.toLowerCase() === 'share'
    && (pathSegments[1]?.toLowerCase() === 'place' || pathSegments[1]?.toLowerCase() === 'places');
  if (route === 'place' || route === 'places' || isDiningDealzWebProfile || isDiningDealzSharedProfile) {
    const slug = decodePathSegment(
      (isDiningDealzSharedProfile ? pathSegments[2] : isDiningDealzWebProfile ? pathSegments[1] : pathSegments[0])
        ?? parsedUrl.searchParams.get('slug')
        ?? '',
    ).trim();
    return slug ? { kind: 'business-profile', slug } : null;
  }

  if (route === 'forgot-username') {
    return { kind: 'forgot-username' };
  }

  if (route === 'business-claim-retry') {
    const token = decodePathSegment(pathSegments[0] || parsedUrl.searchParams.get('token') || '').trim();
    return token ? { kind: 'business-claim-retry', token } : null;
  }

  const isDiningDealzBusinessClaimRetry = (
    route === 'www.diningdealz.com'
    || route === 'diningdealz.com'
    || route === 'backend.diningdealz.com'
    || route === 'link.diningdealz.com'
  ) && pathSegments[0]?.toLowerCase() === 'business-claim-retry';
  if (isDiningDealzBusinessClaimRetry) {
    const token = decodePathSegment(pathSegments[1] || parsedUrl.searchParams.get('token') || '').trim();
    return token ? { kind: 'business-claim-retry', token } : null;
  }

  if (route !== 'forgot-password') {
    return null;
  }

  const pathToken = parsedUrl.pathname.split('/').filter(Boolean)[0] ?? '';
  const token = decodePathSegment(pathToken || parsedUrl.searchParams.get('token') || '');
  return token ? { kind: 'forgot-password', token } : null;
}
