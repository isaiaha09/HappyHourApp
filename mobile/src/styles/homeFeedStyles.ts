// Home feed layout, cards, sponsored states, and empty/loading states.
export const homeFeedStyles = {
  homeFeedHeaderWrap: {
    marginBottom: 14,
  },
  homeFeedHeader: {
    gap: 8,
  },
  homeFeedEyebrow: {
    color: '#b07a3f',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  homeFeedTitle: {
    color: '#241913',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
  },
  homeFeedSubtitle: {
    color: '#6a5647',
    fontSize: 14,
    lineHeight: 20,
  },
  homeFeedListContent: {
    gap: 14,
    paddingBottom: 142,
  },
  homeFeedCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#ecd8c2',
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
    shadowColor: '#1f160f',
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
    borderLeftColor: '#c65d1f',
    borderLeftWidth: 4,
  },
  homeFeedCardAnnouncement: {
    borderLeftColor: '#8b5e3c',
    borderLeftWidth: 4,
  },
  homeFeedCardEvent: {
    borderLeftColor: '#1f5f5b',
    borderLeftWidth: 4,
  },
  homeFeedCardBlog: {
    borderLeftColor: '#5f7cc6',
    borderLeftWidth: 4,
  },
  homeFeedCardSponsorAccent: {
    borderLeftColor: '#d49718',
    borderLeftWidth: 4,
  },
  homeFeedCardSponsored: {
    backgroundColor: '#fff8ea',
    borderColor: '#e9d194',
  },
  homeFeedSponsoredBand: {
    alignItems: 'center',
    backgroundColor: '#fff1bf',
    borderColor: '#e1c463',
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
    color: '#6f4c00',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  homeFeedSponsoredBandMeta: {
    color: '#7c6340',
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
    backgroundColor: '#f7e4d6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  homeFeedBadgeSponsored: {
    backgroundColor: '#f5d87a',
  },
  homeFeedBadgeText: {
    color: '#8a4018',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  homeFeedBadgeTextSponsored: {
    color: '#6f4c00',
  },
  homeFeedBusinessName: {
    color: '#34261d',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  homeFeedMetaText: {
    color: '#7a6656',
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
    backgroundColor: '#efe4d6',
    borderRadius: 18,
    height: 120,
    justifyContent: 'center',
    marginBottom: 14,
  },
  homeFeedImagePlaceholderText: {
    color: '#765f4d',
    fontSize: 13,
    fontWeight: '700',
  },
  homeFeedCardTitle: {
    color: '#261a13',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 26,
  },
  homeFeedCardSummary: {
    color: '#56483c',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 8,
  },
  homeFeedBodyPreview: {
    color: '#6d5b4d',
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
    color: '#c65d1f',
    fontSize: 14,
    fontWeight: '900',
  },
  homeFeedActionArrow: {
    color: '#c65d1f',
    fontSize: 18,
    fontWeight: '900',
  },
  homeFeedLoadingState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  homeFeedLoadingText: {
    color: '#6f5947',
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
    color: '#6f5947',
    fontSize: 13,
    fontWeight: '700',
  },
  homeFeedFooterSpacer: {
    height: 24,
  },
  homeFeedEmptyState: {
    alignItems: 'center',
    backgroundColor: '#fffaf4',
    borderColor: '#ecd8c2',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  homeFeedEmptyStateWrap: {
    paddingTop: 6,
  },
  homeFeedEmptyTitle: {
    color: '#2d221a',
    fontSize: 18,
    fontWeight: '900',
  },
  homeFeedEmptyText: {
    color: '#6f5947',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
} as const;

