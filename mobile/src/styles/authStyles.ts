import { theme } from './theme';

// Authentication, profile flow, and business-claim form styles.
export const authStyles = {
  authPortalButton: {
    alignItems: 'center',
    backgroundColor: theme.bgRaised,
    borderColor: theme.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  authPortalButtonActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  authPortalButtonText: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  authPortalButtonTextActive: {
    color: theme.textOnAccent,
  },
  authScreen: {
    flex: 1,
  },
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 20,
  },
  authFormStack: {
    alignSelf: 'center',
    gap: 14,
    marginTop: 18,
    maxWidth: 420,
    width: '100%',
  },
  authHero: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  authLinkButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  authRecoveryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  authRecoveryButton: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  authRecoveryButtonText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  authRecoveryPanel: {
    backgroundColor: theme.bgRaised,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  authRecoveryPanelActions: {
    gap: 10,
  },
  authRecoveryDismissButton: {
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  authRecoveryDismissText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  authLinkText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  profileScreen: {
    flex: 1,
  },
  profileScreenLandscape: {
    alignSelf: 'center',
    maxWidth: 980,
    width: '100%',
  },
  profileScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 132,
  },
  profileCard: {
    backgroundColor: theme.bgRaised,
    borderColor: theme.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    marginTop: 12,
    padding: 18,
  },
  profileIntroText: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  profileSuccessBanner: {
    backgroundColor: theme.successSoft,
    borderColor: theme.success,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  profileSuccessText: {
    color: theme.success,
    fontSize: 13,
    fontWeight: '700',
  },
  profileFormSection: {
    gap: 10,
  },
  profileFieldLabel: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  profileInput: {
    backgroundColor: theme.bgInput,
    borderColor: theme.borderStrong,
    borderRadius: 14,
    borderWidth: 1,
    color: theme.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  passwordFieldRow: {
    justifyContent: 'center',
    position: 'relative',
  },
  passwordFieldInput: {
    paddingRight: 48,
  },
  passwordToggleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 40,
    position: 'absolute',
    right: 4,
    top: 4,
  },
  passwordEyeIcon: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  passwordEyeOutline: {
    alignItems: 'center',
    borderColor: theme.accent,
    borderRadius: 999,
    borderWidth: 1.6,
    height: 12,
    justifyContent: 'center',
    width: 18,
  },
  passwordEyePupil: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    height: 4,
    width: 4,
  },
  passwordEyeSlash: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    height: 1.8,
    position: 'absolute',
    transform: [{ rotate: '-35deg' }],
    width: 20,
  },
  compactDropdownWrap: {
    gap: 6,
  },
  compactDropdownButton: {
    backgroundColor: theme.bgInput,
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  compactDropdownButtonOpen: {
    borderColor: theme.accent,
  },
  compactDropdownText: {
    color: theme.textPrimary,
    fontSize: 14,
    lineHeight: 18,
  },
  compactDropdownPlaceholder: {
    color: theme.textMuted,
  },
  compactDropdownCaret: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  compactDropdownMenu: {
    backgroundColor: theme.bgRaised,
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  compactDropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactDropdownOptionSelected: {
    backgroundColor: theme.accentSoft,
  },
  compactDropdownOptionText: {
    color: theme.textPrimary,
    fontSize: 14,
    lineHeight: 18,
  },
  compactDropdownOptionTextSelected: {
    color: theme.accentStrong,
    fontWeight: '700',
  },
  profileSupportText: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -2,
  },
  verificationCodeInput: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
  verificationCountdownText: {
    color: theme.accentStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  supportMessageInput: {
    minHeight: 144,
    paddingTop: 12,
  },
  claimResultsList: {
    gap: 12,
    marginTop: 8,
  },
  claimResultCard: {
    backgroundColor: theme.bgSoft,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  claimBusinessHint: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  claimLocationList: {
    gap: 8,
    marginTop: 6,
  },
  claimLocationButton: {
    backgroundColor: theme.bgRaised,
    borderColor: theme.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  claimLocationButtonTitle: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  claimLocationButtonText: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  profileTextarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  onboardingCard: {
    backgroundColor: theme.surfaceLight,
    borderColor: theme.surfaceLightBorder,
  },
  onboardingRecoveryPanel: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
  },
  onboardingEyebrow: {
    color: theme.accent,
  },
  onboardingHeading: {
    color: theme.textDark,
  },
  onboardingBodyText: {
    color: theme.textDarkSoft,
  },
  onboardingLabel: {
    color: theme.textDarkSoft,
  },
  onboardingInput: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
    color: theme.textDark,
  },
  onboardingPrimaryButton: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
    borderWidth: 1,
  },
  onboardingPrimaryButtonText: {
    color: theme.textDark,
  },
  onboardingSecondaryButton: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
  },
  onboardingSecondaryButtonText: {
    color: theme.textDark,
  },
  onboardingBackButton: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
    borderWidth: 1,
  },
  onboardingBackButtonText: {
    color: theme.textDark,
  },
  onboardingInfoCard: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
  },
  onboardingInfoTitle: {
    color: theme.textDark,
  },
  onboardingInfoText: {
    color: theme.textDarkSoft,
  },
  onboardingInfoTextMuted: {
    color: theme.textDarkMuted,
  },
  onboardingDropdownButton: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
  },
  onboardingDropdownButtonOpen: {
    borderColor: theme.accent,
  },
  onboardingDropdownText: {
    color: theme.textDark,
  },
  onboardingDropdownPlaceholder: {
    color: theme.textDarkMuted,
  },
  onboardingDropdownCaret: {
    color: theme.textDarkMuted,
  },
  onboardingDropdownMenu: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
  },
  onboardingDropdownOptionSelected: {
    backgroundColor: '#dde5ef',
  },
  onboardingChip: {
    backgroundColor: theme.surfaceLightAlt,
    borderColor: theme.surfaceLightBorder,
  },
  onboardingChipText: {
    color: theme.textDark,
  },
} as const;

