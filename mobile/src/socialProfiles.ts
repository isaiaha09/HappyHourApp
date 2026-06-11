import type { SocialPlatform, SocialProfile, SocialProfiles } from './types';

export const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'tiktok', 'youtube', 'website'];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  website: 'Website',
};

const SOCIAL_PLATFORM_DOMAINS: Record<SocialPlatform, string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  website: [],
};

export type SocialProfileInputValues = Record<SocialPlatform, string>;

export function emptySocialProfileInputs(): SocialProfileInputValues {
  return {
    instagram: '',
    facebook: '',
    tiktok: '',
    youtube: '',
    website: '',
  };
}

export function socialProfilesToInputs(profiles?: SocialProfiles, fallbackWebsiteUrl?: string): SocialProfileInputValues {
  const nextInputs = emptySocialProfileInputs();
  const normalizedProfiles = normalizeSocialProfiles(profiles, fallbackWebsiteUrl);

  SOCIAL_PLATFORMS.forEach((platform) => {
    if (platform === 'website') {
      nextInputs.website = normalizedProfiles.website?.url ?? fallbackWebsiteUrl ?? '';
      return;
    }

    nextInputs[platform] = normalizedProfiles[platform]?.url ?? '';
  });

  return nextInputs;
}

export function normalizeSocialProfiles(profiles?: SocialProfiles, fallbackWebsiteUrl = ''): SocialProfiles {
  const nextProfiles: SocialProfiles = {};

  SOCIAL_PLATFORMS.forEach((platform) => {
    const rawProfile = profiles?.[platform];
    const rawValue = rawProfile?.url || rawProfile?.username || (platform === 'website' ? fallbackWebsiteUrl : '');
    const normalizedProfile = normalizeSocialProfileInput(platform, rawValue);
    if (normalizedProfile) {
      nextProfiles[platform] = normalizedProfile;
    }
  });

  return nextProfiles;
}

export function buildSocialProfilesFromInputs(inputs: Partial<SocialProfileInputValues>): SocialProfiles {
  const nextProfiles: SocialProfiles = {};

  SOCIAL_PLATFORMS.forEach((platform) => {
    const normalizedProfile = normalizeSocialProfileInput(platform, inputs[platform] ?? '');
    if (normalizedProfile) {
      nextProfiles[platform] = normalizedProfile;
    }
  });

  return nextProfiles;
}

export function getSocialProfileValidationMessage(platform: SocialPlatform, value: string) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return null;
  }

  try {
    normalizeSocialProfileInput(platform, normalizedValue);
    return null;
  } catch {
    return `Enter a valid ${SOCIAL_PLATFORM_LABELS[platform]} profile URL${platform === 'website' ? '' : ' or username'}.`;
  }
}

export function getSocialProfilePreview(platform: SocialPlatform, value: string) {
  try {
    const profile = normalizeSocialProfileInput(platform, value);
    if (!profile) {
      return '';
    }
    return formatSocialProfileUsername(platform, profile.username);
  } catch {
    return '';
  }
}

export function getSocialProfilesForDisplay(profiles?: SocialProfiles, fallbackWebsiteUrl?: string) {
  const normalizedProfiles = normalizeSocialProfiles(profiles, fallbackWebsiteUrl);
  return SOCIAL_PLATFORMS.flatMap((platform) => {
    const profile = normalizedProfiles[platform];
    if (!profile?.url || !profile.username) {
      return [];
    }

    return [{
      platform,
      url: profile.url,
      username: profile.username,
    } satisfies SocialProfile & { platform: SocialPlatform }];
  });
}

export function formatSocialProfileUsername(platform: SocialPlatform, username: string) {
  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername) {
    return '';
  }
  if (platform === 'website') {
    return normalizedUsername;
  }
  return `@${normalizedUsername.replace(/^@+/, '')}`;
}

export function normalizeSocialProfileInput(platform: SocialPlatform, value: string): SocialProfile | null {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return null;
  }

  if (platform === 'website') {
    const normalizedUrl = normalizeAbsoluteUrl(rawValue);
    const parsed = safeParseUrl(normalizedUrl);
    const hostname = normalizeHostname(parsed?.hostname ?? '');
    if (!hostname) {
      throw new Error('Invalid website URL');
    }
    return {
      url: normalizedUrl,
      username: hostname,
    };
  }

  if (looksLikeUrl(rawValue)) {
    const normalizedUrl = normalizeAbsoluteUrl(rawValue);
    const parsed = safeParseUrl(normalizedUrl);
    const hostname = normalizeHostname(parsed?.hostname ?? '');
    if (!matchesPlatformHostname(platform, hostname)) {
      throw new Error('Invalid platform URL');
    }

    const username = extractPlatformUsername(platform, parsed);
    if (!username) {
      throw new Error('Invalid profile URL');
    }

    return {
      url: buildPlatformUrl(platform, username),
      username,
    };
  }

  const username = normalizeUsername(platform, rawValue);
  if (!username) {
    throw new Error('Invalid username');
  }

  return {
    url: buildPlatformUrl(platform, username),
    username,
  };
}

function looksLikeUrl(value: string) {
  return value.includes('.') || value.includes('/') || value.startsWith('http://') || value.startsWith('https://');
}

function normalizeAbsoluteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value.replace(/^\/+/, '')}`;
}

function safeParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeHostname(value: string) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

function matchesPlatformHostname(platform: SocialPlatform, hostname: string) {
  return SOCIAL_PLATFORM_DOMAINS[platform].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function normalizeUsername(platform: SocialPlatform, value: string) {
  const trimmed = String(value || '').trim().replace(/^@+/, '').replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return '';
  }
  if (platform === 'youtube' && trimmed.startsWith('@')) {
    return trimmed.slice(1);
  }
  return trimmed;
}

function extractPlatformUsername(platform: SocialPlatform, parsed: URL | null) {
  if (!parsed) {
    return '';
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const query = parsed.searchParams;

  if (platform === 'instagram') {
    if (!segments.length || ['p', 'reel', 'reels', 'stories', 'explore'].includes(segments[0])) {
      return '';
    }
    return normalizeUsername(platform, segments[0]);
  }

  if (platform === 'facebook') {
    if (!segments.length) {
      return normalizeUsername(platform, query.get('id') ?? '');
    }
    if (segments[0] === 'profile.php') {
      return normalizeUsername(platform, query.get('id') ?? '');
    }
    if (segments[0] === 'people') {
      if (segments.length < 2) {
        return '';
      }
      return normalizeUsername(platform, segments.slice(0, 3).join('/'));
    }
    if (['groups', 'events', 'watch', 'marketplace', 'gaming'].includes(segments[0])) {
      return '';
    }
    return normalizeUsername(platform, segments[0]);
  }

  if (platform === 'tiktok') {
    if (!segments.length || ['discover', 'tag', 'music'].includes(segments[0])) {
      return '';
    }
    return normalizeUsername(platform, segments[0]);
  }

  if (platform === 'youtube') {
    const hostname = normalizeHostname(parsed.hostname);
    if (hostname === 'youtu.be') {
      return '';
    }
    if (!segments.length) {
      return '';
    }
    if (segments[0].startsWith('@')) {
      return normalizeUsername(platform, segments[0]);
    }
    if (['channel', 'c', 'user'].includes(segments[0]) && segments[1]) {
      return normalizeUsername(platform, segments[1]);
    }
    if (['watch', 'shorts', 'playlist'].includes(segments[0])) {
      return '';
    }
    return normalizeUsername(platform, segments[0]);
  }

  return '';
}

function buildPlatformUrl(platform: SocialPlatform, username: string) {
  if (platform === 'instagram') {
    return `https://instagram.com/${username}`;
  }
  if (platform === 'facebook') {
    return `https://facebook.com/${username}`;
  }
  if (platform === 'tiktok') {
    return `https://tiktok.com/@${username.replace(/^@+/, '')}`;
  }
  if (platform === 'youtube') {
    return `https://youtube.com/@${username.replace(/^@+/, '')}`;
  }
  return normalizeAbsoluteUrl(username);
}
