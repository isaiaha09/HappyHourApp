import { theme } from './theme';

// Shared full-width styling for signup, login, and logged-in account pages.
export const accountStyles = {
  accountScrollContent: {
    paddingHorizontal: 16,
  },
  accountHeader: {
    borderTopWidth: 0,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  accountPage: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    gap: 16,
    marginTop: 10,
    padding: 0,
  },
  accountIntro: {
    gap: 8,
  },
  accountEyebrow: {
    color: theme.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  accountHeading: {
    color: theme.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginTop: 0,
  },
  accountBodyText: {
    color: theme.textSecondary,
    lineHeight: 21,
  },
  accountForm: {
    gap: 16,
  },
  accountSection: {
    borderTopColor: theme.border,
    borderTopWidth: 1,
    gap: 12,
    marginTop: 4,
    paddingTop: 16,
  },
  accountSectionTitle: {
    borderLeftColor: theme.accent,
    borderLeftWidth: 2,
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    paddingLeft: 10,
  },
  accountFields: {
    gap: 8,
  },
  accountLabel: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    textTransform: 'none',
  },
  accountInput: {
    backgroundColor: theme.bgInput,
    borderColor: theme.border,
    borderRadius: 12,
    color: theme.textPrimary,
    minHeight: 48,
  },
  accountPrimaryButton: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
  },
  accountPrimaryButtonText: {
    color: theme.textDark,
  },
  accountSecondaryButton: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.borderStrong,
    borderRadius: 14,
    minHeight: 44,
  },
  accountSecondaryButtonText: {
    color: theme.textPrimary,
  },
  accountChip: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
  },
  accountChipText: {
    color: theme.textSecondary,
  },
  accountBackButton: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    minHeight: 44,
  },
  accountBackButtonText: {
    color: theme.textPrimary,
  },
  accountInfoCard: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderRadius: 16,
  },
  accountInfoTitle: {
    color: theme.textPrimary,
  },
  accountInfoText: {
    color: theme.textSecondary,
  },
  accountInfoTextMuted: {
    color: theme.textMuted,
  },
  accountNotice: {
    borderLeftColor: theme.accent,
    borderLeftWidth: 2,
    gap: 12,
    padding: 16,
  },
  accountLinkRow: {
    alignSelf: 'stretch',
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    padding: 16,
  },
  accountLinkText: {
    color: theme.accentStrong,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'left',
  },
} as const;
