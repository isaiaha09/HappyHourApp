import { theme } from './theme';

// Home feed layout, cards, sponsored states, and empty/loading states.
export const homeFeedStyles = {
  homeFeedHeaderWrap: {
    marginBottom: 14,
  },
  homeFeedHeader: {
    gap: 8,
  },
  homeFeedEyebrow: {
    color: theme.accentStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  homeFeedTitle: {
    color: theme.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
  },
  homeFeedSubtitle: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  homeFeedListContent: {
    gap: 14,
    paddingBottom: 142,
  },
  homeFeedCard: {
    backgroundColor: theme.bgRaised,
    borderColor: theme.border,
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  homeFeedCardLandscape: {
    marginHorizontal: 28,
  },
  homeFeedCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  homeFeedCardSpecial: {
    borderLeftColor: theme.accent,
    borderLeftWidth: 4,
  },
  homeFeedCardAnnouncement: {
    borderLeftColor: theme.accentPurple,
    borderLeftWidth: 4,
  },
  homeFeedCardEvent: {
    borderLeftColor: theme.accentBlue,
    borderLeftWidth: 4,
  },
  homeFeedCardBlog: {
    borderLeftColor: theme.accentBlue,
    borderLeftWidth: 4,
  },
  homeFeedCardSponsorAccent: {
    borderLeftColor: theme.warning,
    borderLeftWidth: 4,
  },
  homeFeedCardSponsored: {
    backgroundColor: theme.warningSoft,
    borderColor: theme.warning,
  },
  homeFeedSponsoredBand: {
    alignItems: 'center',
    backgroundColor: theme.warningSoft,
    borderColor: theme.warning,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  homeFeedSponsoredBandText: {
    color: theme.warning,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  homeFeedSponsoredBandMeta: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    maxWidth: '75%',
  },
  homeFeedCardHeader: {
    marginBottom: 14,
  },
  homeFeedHeaderCopy: {
    gap: 6,
  },
  homeFeedBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  homeFeedBadge: {
    backgroundColor: theme.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  homeFeedBadgeSponsored: {
    backgroundColor: theme.warningSoft,
  },
  homeFeedBadgeText: {
    color: theme.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  homeFeedBadgeTextSponsored: {
    color: theme.warning,
  },
  homeFeedBusinessName: {
    color: theme.textPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  homeFeedMetaText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  homeFeedHeroImage: {
    borderRadius: 18,
    height: 176,
    marginBottom: 14,
    width: '100%',
  },
  homeFeedImagePlaceholder: {
    alignItems: 'center',
    backgroundColor: theme.bgMuted,
    borderRadius: 18,
    height: 120,
    justifyContent: 'center',
    marginBottom: 14,
  },
  homeFeedImagePlaceholderText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  homeFeedCardTitle: {
    color: theme.textPrimary,
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 26,
  },
  homeFeedCardSummary: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 8,
  },
  homeFeedBodyPreview: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  homeFeedActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  homeFeedActionText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  homeFeedActionArrow: {
    color: theme.accent,
    fontSize: 18,
    fontWeight: '900',
  },
  homeFeedLoadingState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  homeFeedLoadingText: {
    color: theme.textMuted,
    marginTop: 10,
  },
  homeFeedFooterLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingBottom: 22,
    paddingTop: 8,
  },
  homeFeedFooterText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  homeFeedFooterSpacer: {
    height: 24,
  },
  homeFeedEmptyState: {
    alignItems: 'center',
    backgroundColor: theme.bgRaised,
    borderColor: theme.border,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  homeFeedEmptyStateWrap: {
    paddingTop: 6,
  },
  homeFeedEmptyTitle: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  homeFeedEmptyText: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
} as const;

