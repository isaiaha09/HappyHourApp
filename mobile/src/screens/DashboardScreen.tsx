import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { styles } from '../appStyles';
import { buildDealOverridesFromDeals, buildNormalizedDealOverrides, buildNormalizedOperatingHourOverrides, buildOperatingHourOverridesFromWindows } from '../businessProfileOverrides';
import { BusinessDealsEditor, BusinessHoursEditor } from '../components/BusinessProfileStructuredEditors';
import { NativeIOSLiquidGlassBackButton, NativeIOSLiquidGlassHeaderButton } from '../components/NativeIOSLiquidGlass';
import { SOCIAL_PLATFORM_LABELS, buildSocialProfilesFromInputs, getSocialProfilePreview, getSocialProfileValidationMessage, socialProfilesToInputs } from '../socialProfiles';
import { dedupeImageUrls, normalizeSearchText } from '../placeHelpers';
import type { BusinessAttachmentDraft, DirectMessageThread, FavoriteBusinessNotification, ProfileDashboardUpdateRequest, SignupResponse, TwoFactorSetupResponse } from '../types';

export type DashboardScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  loading: boolean;
  message: string | null;
  onBack: () => void;
  onOpenBilling: () => void;
  onOpenApprovedBusiness: (slug: string) => void;
  onOpenBusinessProfileEditor: () => void;
  onOpenFavoriteBusiness: (slug: string) => void;
  onOpenFavoriteBusinesses: () => void;
  onOpenBusinessNotifications: () => void;
  onOpenDirectMessages: () => void;
  onOpenPlaces: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onResendVerification: () => void;
  onSaveProfileDetails: (payload: ProfileDashboardUpdateRequest, photoUploads?: BusinessAttachmentDraft[]) => void;
  session: SignupResponse;
  submitting: boolean;
};

export type AccountSettingsScreenProps = {
  deleteAccountPassword: string;
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onBeginTwoFactorSetup: () => void;
  onChangeTwoFactorDisableCode: (value: string) => void;
  onChangeTwoFactorSetupCode: (value: string) => void;
  onConfirmTwoFactorSetup: () => void;
  onChangeDeleteAccountPassword: (value: string) => void;
  onDisableTwoFactor: () => void;
  onLogout: () => void;
  onToggleBusinessLocationTracking: (value: boolean) => void;
  onOpenContactSupport: () => void;
  onDeleteAccount: () => void;
  onOpenBlockedDirectMessageCustomers: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenTermsOfService: () => void;
  onToggleDirectMessaging: (value: boolean) => void;
  pendingBusinessLocationTrackingEnabled: boolean | null;
  pendingDirectMessagingEnabled: boolean | null;
  session: SignupResponse;
  settingsSubmittingAction: 'two-factor-begin' | 'two-factor-confirm' | 'two-factor-disable' | 'business-location' | 'direct-messaging' | 'direct-message-block' | 'delete-account' | null;
  twoFactorDisableCode: string;
  twoFactorSetup: TwoFactorSetupResponse | null;
  twoFactorSetupCode: string;
};

export type BlockedDirectMessageCustomersScreenProps = Pick<AccountSettingsScreenProps,
  | 'errorMessage'
  | 'isLandscape'
  | 'message'
  | 'onBack'
  | 'session'
  | 'settingsSubmittingAction'
> & {
  onUnblockCustomerFromDirectMessaging: (blockId: number) => void;
  onConfirmBlockedDirectMessageCustomers: (usernames: string[]) => Promise<boolean>;
  onLoadExistingDirectMessageCustomers: () => Promise<DirectMessageThread[]>;
};

function DashboardDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dashboardDetailItem}>
      <Text style={styles.dashboardDetailLabel}>{label}</Text>
      <Text style={styles.dashboardDetailValue}>{value}</Text>
    </View>
  );
}

function DashboardEditableField({
  label,
  onChangeText,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.dashboardFieldColumn}>
      <Text style={styles.dashboardDetailLabel}>{label}</Text>
      <TextInput onChangeText={onChangeText} style={styles.profileInput} value={value} />
    </View>
  );
}

function DashboardMultilineField({
  label,
  onChangeText,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.dashboardFieldColumn}>
      <Text style={styles.dashboardDetailLabel}>{label}</Text>
      <TextInput multiline onChangeText={onChangeText} style={[styles.profileInput, styles.dashboardMultilineInput]} textAlignVertical="top" value={value} />
    </View>
  );
}

function formatCampaignPrice(weeklyPriceCents: number) {
  return `$${(weeklyPriceCents / 100).toFixed(0)}/week`;
}

function formatCampaignPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function joinDraftEntries(values?: string[]) {
  return (values ?? []).join('\n');
}

function formatDashboardNotificationTimestamp(value: string) {
  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return '';
  }
  return parsedValue.toLocaleString();
}

function FavoriteBusinessCard({
  addressLine,
  cityLabel,
  name,
  onPress,
  venueTypeLabel,
}: {
  addressLine: string;
  cityLabel: string;
  name: string;
  onPress: () => void;
  venueTypeLabel: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.dashboardDetailItem, styles.dashboardFavoriteBusinessCard]}>
      <Text style={styles.dashboardDetailValue}>{name}</Text>
      <Text style={styles.dashboardSupportText}>{cityLabel} • {venueTypeLabel}</Text>
      <Text style={styles.dashboardSupportText}>{addressLine}</Text>
      <Text style={styles.dashboardFavoriteBusinessAction}>Open business profile</Text>
    </Pressable>
  );
}

function FavoriteBusinessNotificationCard({
  onDismiss,
  notification,
  onPress,
  submitting,
}: {
  onDismiss: () => void;
  notification: FavoriteBusinessNotification;
  onPress: () => void;
  submitting: boolean;
}) {
  return (
    <View style={[styles.dashboardDetailItem, styles.dashboardNotificationCard, styles.dashboardNotificationCardSingle]}>
      <View style={styles.dashboardNotificationHeader}>
        <View style={styles.dashboardNotificationHeaderCopy}>
          <Text style={styles.dashboardNotificationTitle}>{notification.title}</Text>
          <Text style={styles.dashboardNotificationTimestamp}>{formatDashboardNotificationTimestamp(notification.created_at)}</Text>
        </View>
        <Pressable disabled={submitting} onPress={onDismiss} style={[styles.dashboardNotificationDismissButton, submitting ? styles.linkButtonDisabled : null]}>
          <Text style={styles.dashboardNotificationDismissButtonText}>{submitting ? '...' : 'Dismiss'}</Text>
        </Pressable>
      </View>
      {notification.message ? <Text style={styles.dashboardSupportText}>{notification.message}</Text> : null}
      <Text style={styles.dashboardSupportText}>{notification.business_name}</Text>
      <Pressable onPress={onPress}>
        <Text style={styles.dashboardFavoriteBusinessAction}>Open business profile</Text>
      </Pressable>
    </View>
  );
}

type BusinessProfileDraft = ProfileDashboardUpdateRequest & {
  instagram_profile?: string;
  facebook_profile?: string;
  tiktok_profile?: string;
  youtube_profile?: string;
};

function buildDashboardDraft(session: SignupResponse): BusinessProfileDraft {
  const businessContact = session.business_contact ?? {};
  const socialInputs = socialProfilesToInputs(businessContact.social_profiles, businessContact.business_website_url ?? '');
  const operatingHourDraftRows = buildOperatingHourOverridesFromWindows((businessContact.operating_hour_overrides as never[] | undefined) ?? (businessContact.operating_hours ?? []));

  return {
    portal: session.portal,
    username: session.username,
    email: session.email,
    first_name: session.first_name,
    last_name: session.last_name,
    contact_name: businessContact.contact_name ?? '',
    job_title: businessContact.job_title ?? '',
    work_email: businessContact.work_email ?? '',
    work_phone: businessContact.work_phone ?? '',
    employer_address: businessContact.employer_address ?? '',
    business_website_url: socialInputs.website,
    instagram_profile: socialInputs.instagram,
    facebook_profile: socialInputs.facebook,
    tiktok_profile: socialInputs.tiktok,
    youtube_profile: socialInputs.youtube,
    deal_overrides: businessContact.deal_overrides ?? buildDealOverridesFromDeals(businessContact.deals ?? []),
    operating_hour_overrides: operatingHourDraftRows,
    offer_entries_text: joinDraftEntries(businessContact.offer_entries),
    hours_of_operation_entries_text: joinDraftEntries(businessContact.hours_of_operation_entries),
    photo_references_text: joinDraftEntries(businessContact.photo_references),
    supporting_details: businessContact.supporting_details ?? '',
  };
}

type QrMatrix = {
  cells: boolean[][];
  moduleSize: number;
};

function SettingsGearIcon() {
  return (
    <View style={styles.settingsGearIcon}>
      <View style={[styles.settingsGearTooth, styles.settingsGearToothTop]} />
      <View style={[styles.settingsGearTooth, styles.settingsGearToothTopRight]} />
      <View style={[styles.settingsGearTooth, styles.settingsGearToothRight]} />
      <View style={[styles.settingsGearTooth, styles.settingsGearToothBottomRight]} />
      <View style={[styles.settingsGearTooth, styles.settingsGearToothBottom]} />
      <View style={[styles.settingsGearTooth, styles.settingsGearToothBottomLeft]} />
      <View style={[styles.settingsGearTooth, styles.settingsGearToothLeft]} />
      <View style={[styles.settingsGearTooth, styles.settingsGearToothTopLeft]} />
      <View style={styles.settingsGearOuterRing}>
        <View style={styles.settingsGearInnerHole} />
      </View>
    </View>
  );
}

function DirectMessageHeaderIcon() {
  return <Ionicons color="#402214" name="paper-plane-outline" size={19} />;
}

function SecuritySettingsSection({
  onBeginTwoFactorSetup,
  onChangeTwoFactorDisableCode,
  onChangeTwoFactorSetupCode,
  onConfirmTwoFactorSetup,
  onDisableTwoFactor,
  settingsSubmittingAction,
  session,
  twoFactorDisableCode,
  twoFactorSetup,
  twoFactorSetupCode,
}: Pick<AccountSettingsScreenProps,
  'onBeginTwoFactorSetup'
  | 'onChangeTwoFactorDisableCode'
  | 'onChangeTwoFactorSetupCode'
  | 'onConfirmTwoFactorSetup'
  | 'onDisableTwoFactor'
  | 'settingsSubmittingAction'
  | 'session'
  | 'twoFactorDisableCode'
  | 'twoFactorSetup'
  | 'twoFactorSetupCode'
>) {
  const [twoFactorQrMatrix, setTwoFactorQrMatrix] = useState<QrMatrix | null>(null);
  const [twoFactorQrLoadFailed, setTwoFactorQrLoadFailed] = useState(false);
  const [twoFactorKeyCopied, setTwoFactorKeyCopied] = useState(false);
  const submitting = settingsSubmittingAction !== null;
  const beginningTwoFactorSetup = settingsSubmittingAction === 'two-factor-begin';
  const confirmingTwoFactorSetup = settingsSubmittingAction === 'two-factor-confirm';
  const disablingTwoFactor = settingsSubmittingAction === 'two-factor-disable';

  async function handleOpenAuthenticatorApp() {
    if (!twoFactorSetup?.otpauth_url) {
      return;
    }

    try {
      await Linking.openURL(twoFactorSetup.otpauth_url);
    } catch {
      // Keep the manual key visible as the fallback path.
    }
  }

  async function handleCopyManualKey() {
    if (!twoFactorSetup?.manual_entry_key) {
      return;
    }

    try {
      await Clipboard.setStringAsync(twoFactorSetup.manual_entry_key);
      setTwoFactorKeyCopied(true);
    } catch {
      setTwoFactorKeyCopied(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadQrCode() {
      if (!twoFactorSetup?.otpauth_url) {
        setTwoFactorQrMatrix(null);
        setTwoFactorQrLoadFailed(false);
        setTwoFactorKeyCopied(false);
        return;
      }

      setTwoFactorQrMatrix(null);
      setTwoFactorQrLoadFailed(false);
      setTwoFactorKeyCopied(false);

      try {
        const { default: QRCode } = await import('qrcode');
        const qrCode = QRCode.create(twoFactorSetup.otpauth_url, {
          errorCorrectionLevel: 'M',
        });
        const moduleCount = qrCode.modules.size;
        const moduleSize = Math.max(4, Math.floor(156 / moduleCount));
        const cells = Array.from({ length: moduleCount }, (_, rowIndex) => (
          Array.from({ length: moduleCount }, (_, columnIndex) => Boolean(qrCode.modules.get(rowIndex, columnIndex)))
        ));

        if (!cancelled) {
          setTwoFactorQrMatrix({ cells, moduleSize });
        }
      } catch {
        if (!cancelled) {
          setTwoFactorQrLoadFailed(true);
        }
      }
    }

    void loadQrCode();

    return () => {
      cancelled = true;
    };
  }, [twoFactorSetup?.otpauth_url]);

  return (
    <View style={styles.dashboardSection}>
      <Text style={styles.dashboardSectionTitle}>Authentication settings</Text>
      <DashboardDetailRow label="Two-factor authentication" value={session.two_factor_enabled ? 'Enabled' : 'Disabled'} />
      {session.two_factor_enabled ? (
        <>
          <Text style={styles.dashboardSupportText}>Enter a current authenticator code to disable 2FA on this account.</Text>
          <TextInput keyboardType="number-pad" onChangeText={onChangeTwoFactorDisableCode} style={styles.profileInput} value={twoFactorDisableCode} />
          <Pressable onPress={onDisableTwoFactor} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
            <Text style={styles.linkButtonSecondaryText}>{disablingTwoFactor ? 'Saving...' : 'Disable authenticator 2FA'}</Text>
          </Pressable>
        </>
      ) : twoFactorSetup ? (
        <>
          <Text style={styles.dashboardSupportText}>Scan this QR code with your authenticator app.</Text>
          {twoFactorSetup.otpauth_url ? (
            <View style={styles.dashboardQrCard}>
              {twoFactorQrMatrix ? (
                <View style={styles.dashboardQrImage}>
                  <View
                    style={[
                      styles.dashboardQrMatrix,
                      {
                        height: twoFactorQrMatrix.cells.length * twoFactorQrMatrix.moduleSize,
                        width: twoFactorQrMatrix.cells.length * twoFactorQrMatrix.moduleSize,
                      },
                    ]}
                  >
                    {twoFactorQrMatrix.cells.map((row, rowIndex) => (
                      <View key={`qr-row-${rowIndex}`} style={styles.dashboardQrMatrixRow}>
                        {row.map((isDark, columnIndex) => (
                          <View
                            key={`qr-cell-${rowIndex}-${columnIndex}`}
                            style={[
                              styles.dashboardQrMatrixCell,
                              {
                                backgroundColor: isDark ? '#2d221a' : '#fffaf4',
                                height: twoFactorQrMatrix.moduleSize,
                                width: twoFactorQrMatrix.moduleSize,
                              },
                            ]}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              ) : twoFactorQrLoadFailed ? (
                <View style={styles.dashboardQrLoadingState}>
                  <Text style={styles.dashboardQrSubtitle}>QR code could not be rendered on this device.</Text>
                  <Text style={styles.dashboardQrSubtitle}>Use the manual setup key below instead.</Text>
                </View>
              ) : (
                <View style={styles.dashboardQrLoadingState}>
                  <ActivityIndicator color="#c65d1f" size="small" />
                  <Text style={styles.dashboardQrSubtitle}>Preparing QR code...</Text>
                </View>
              )}
              <View style={styles.dashboardQrMeta}>
                <Text style={styles.dashboardQrTitle}>{twoFactorSetup.issuer}</Text>
                <Text style={styles.dashboardQrSubtitle}>{twoFactorSetup.account_name}</Text>
              </View>
              <Pressable onPress={() => void handleOpenAuthenticatorApp()} style={styles.linkButtonSecondaryWide}>
                <Text style={styles.linkButtonSecondaryText}>Open in authenticator app</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.dashboardCodeCard}>
            <Text style={styles.dashboardCodeLabel}>Manual setup key</Text>
            <Text style={styles.dashboardCodeValue}>{twoFactorSetup.manual_entry_key}</Text>
            <Pressable onPress={() => void handleCopyManualKey()} style={styles.dashboardCodeActionButton}>
              <Text style={styles.dashboardCodeActionText}>{twoFactorKeyCopied ? 'Copied' : 'Copy key'}</Text>
            </Pressable>
            <Text style={styles.dashboardCodeHelpText}>Copy the key manually, set it up in your authenticator app, and paste the 6-digit code in the line below.</Text>
          </View>
          <TextInput keyboardType="number-pad" onChangeText={onChangeTwoFactorSetupCode} style={styles.profileInput} value={twoFactorSetupCode} />
          <Pressable onPress={onConfirmTwoFactorSetup} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
            <Text style={styles.linkButtonSecondaryText}>{confirmingTwoFactorSetup ? 'Saving...' : 'Confirm authenticator setup'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.dashboardSupportText}>Set up an authenticator app to require a 6-digit verification code each time you sign in.</Text>
          <Pressable onPress={onBeginTwoFactorSetup} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
            <Text style={styles.linkButtonSecondaryText}>{beginningTwoFactorSetup ? 'Preparing...' : 'Set up authenticator app'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function DashboardScreen({ errorMessage, isLandscape, loading, message, onBack, onOpenBilling, onOpenApprovedBusiness, onOpenBusinessProfileEditor, onOpenFavoriteBusiness, onOpenFavoriteBusinesses, onOpenBusinessNotifications, onOpenDirectMessages, onOpenPlaces, onOpenSettings, onRefresh, onResendVerification, onSaveProfileDetails, session, submitting }: DashboardScreenProps) {
  const approvedBusinesses = session.approved_businesses ?? [];
  const sponsoredCampaigns = session.sponsored_campaigns ?? [];
  const favoriteBusinesses = session.favorite_businesses ?? [];
  const favoriteBusinessNotifications = session.favorite_business_notifications ?? [];
  const fullName = [session.first_name, session.last_name].filter(Boolean).join(' ');
  const trackedBusinessLocation = session.tracked_business_location ?? {};
  const trackedBusinessLocationUpdatedAt = trackedBusinessLocation.updated_at
    ? new Date(trackedBusinessLocation.updated_at).toLocaleString()
    : null;
  const [profileDraft, setProfileDraft] = useState<ProfileDashboardUpdateRequest>(() => buildDashboardDraft(session));

  useEffect(() => {
    setProfileDraft(buildDashboardDraft(session));
  }, [session]);

  const profileDetailsChanged = profileDraft.username !== session.username
    || profileDraft.email !== session.email
    || profileDraft.first_name !== session.first_name
    || profileDraft.last_name !== session.last_name;
  function buildSavePayload(): ProfileDashboardUpdateRequest {
    const payload: ProfileDashboardUpdateRequest = {
      portal: session.portal,
      username: profileDraft.username,
      email: profileDraft.email,
      first_name: profileDraft.first_name,
      last_name: profileDraft.last_name,
    };

    if (session.profile_type === 'business') {
      payload.contact_name = profileDraft.contact_name ?? '';
      payload.job_title = profileDraft.job_title ?? '';
      payload.work_email = profileDraft.work_email ?? '';
      payload.work_phone = profileDraft.work_phone ?? '';
      payload.employer_address = profileDraft.employer_address ?? '';
      payload.business_website_url = profileDraft.business_website_url ?? '';
      payload.social_media_links_text = profileDraft.social_media_links_text ?? '';
      payload.offer_entries_text = profileDraft.offer_entries_text ?? '';
      payload.hours_of_operation_entries_text = profileDraft.hours_of_operation_entries_text ?? '';
      payload.photo_references_text = profileDraft.photo_references_text ?? '';
      payload.supporting_details = profileDraft.supporting_details ?? '';
    }

    return payload;
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingFill}
      >
        <ScrollView
          contentContainerStyle={styles.dashboardScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.screenHeaderBar}>
            <View style={styles.dashboardHeaderRow}>
              <NativeIOSLiquidGlassHeaderButton
                fallback={(
                  <Pressable onPress={onBack} style={styles.backButton}>
                    <Text style={styles.backButtonText}>Open Map</Text>
                  </Pressable>
                )}
                label="Open Map"
                onPress={onBack}
                variant="pill"
              />
              <View style={styles.dashboardHeaderActions}>
                <NativeIOSLiquidGlassHeaderButton
                  accessibilityLabel="Open direct messages"
                  fallback={(
                    <Pressable accessibilityLabel="Open direct messages" onPress={onOpenDirectMessages} style={styles.settingsIconButton}>
                      <DirectMessageHeaderIcon />
                    </Pressable>
                  )}
                  onPress={onOpenDirectMessages}
                  style={{ marginRight: 16 }}
                  systemImage="paperplane"
                  variant="icon"
                />
                <NativeIOSLiquidGlassHeaderButton
                  accessibilityLabel="Open settings"
                  fallback={(
                    <Pressable accessibilityLabel="Open settings" onPress={onOpenSettings} style={styles.settingsIconButton}>
                      <SettingsGearIcon />
                    </Pressable>
                  )}
                  onPress={onOpenSettings}
                  style={{ marginLeft: 0 }}
                  systemImage="gearshape"
                  variant="icon"
                />
              </View>
            </View>
          </View>

          <View style={styles.dashboardShell}>
            <Text style={styles.detailCity}>{session.profile_type === 'business' ? 'Business Dashboard' : 'Customer Dashboard'}</Text>
            <Text style={styles.detailTitle}>{fullName || session.username}</Text>
            <Text style={styles.profileIntroText}>Use this dashboard to manage your account, check verification status, and jump back into the main app.</Text>

            {message ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{message}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color="#c65d1f" size="large" />
                <Text style={styles.centerStateText}>Refreshing dashboard...</Text>
              </View>
            ) : null}

            {!session.email_verified ? (
              <View style={styles.dashboardStatusBanner}>
                <Text style={styles.dashboardSectionTitle}>Email verification</Text>
                <Text style={styles.dashboardSupportText}>Your email is not verified yet. Use the link sent to {session.email}, then refresh this dashboard.</Text>
                <Pressable onPress={onResendVerification} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
                  <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Sending...' : 'Resend verification email'}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.dashboardStatusBanner}>
                <Text style={styles.dashboardVerifiedTitle}>Email verified</Text>
                <Text style={styles.dashboardVerifiedText}>Your account is verified and ready to use across the app.</Text>
              </View>
            )}

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Profile details</Text>
              <View style={styles.dashboardFieldGrid}>
                <DashboardEditableField label="Username" onChangeText={(value) => setProfileDraft((current) => ({ ...current, username: value }))} value={profileDraft.username} />
                <DashboardEditableField label="Email" onChangeText={(value) => setProfileDraft((current) => ({ ...current, email: value }))} value={profileDraft.email} />
                <DashboardEditableField label="First name" onChangeText={(value) => setProfileDraft((current) => ({ ...current, first_name: value }))} value={profileDraft.first_name} />
                <DashboardEditableField label="Last name" onChangeText={(value) => setProfileDraft((current) => ({ ...current, last_name: value }))} value={profileDraft.last_name} />
                <DashboardDetailRow label="Profile type" value={session.profile_type === 'business' ? 'Business' : 'Customer'} />
              </View>
              <View style={styles.dashboardInlineActions}>
                <Pressable
                  onPress={() => onSaveProfileDetails(buildSavePayload())}
                  style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton, (!profileDetailsChanged || submitting) ? styles.linkButtonDisabled : null]}
                >
                  <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Saving...' : session.profile_type === 'business' ? 'Save dashboard changes' : 'Save profile details'}</Text>
                </Pressable>
              </View>
              <Text style={styles.dashboardSupportText}>Changing your email sends a new verification email and marks the new address as unverified until you confirm it.</Text>
            </View>

            {session.profile_type !== 'business' ? (
              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>Business notifications</Text>
                <Text style={styles.dashboardSupportText}>When a favorited business updates its profile or publishes new content, those alerts will appear on a dedicated screen.</Text>
                <View style={styles.dashboardInlineActions}>
                  <Pressable onPress={onOpenBusinessNotifications} style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton]}>
                    <Text style={styles.linkButtonSecondaryText}>{favoriteBusinessNotifications.length ? `View business notifications (${favoriteBusinessNotifications.length})` : 'View business notifications'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {session.profile_type !== 'business' ? (
              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>Favorite businesses</Text>
                <Text style={styles.dashboardSupportText}>Open your saved businesses on a dedicated screen so you can browse them separately from the rest of the dashboard.</Text>
                <View style={styles.dashboardInlineActions}>
                  <Pressable onPress={onOpenFavoriteBusinesses} style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton]}>
                    <Text style={styles.linkButtonSecondaryText}>{favoriteBusinesses.length ? `View favorite businesses (${favoriteBusinesses.length})` : 'View favorite businesses'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {session.profile_type === 'business' ? (
              <>
                <View style={styles.dashboardSection}>
                  <Text style={styles.dashboardSectionTitle}>Business status</Text>
                  <View style={styles.dashboardFieldGrid}>
                    <DashboardDetailRow label="Status" value={session.business_status || 'Pending'} />
                    <DashboardDetailRow label="Current business" value={session.business_name || 'No approved business yet'} />
                    {session.claim_status ? <DashboardDetailRow label="Claim review" value={session.claim_status} /> : null}
                  {session.requires_business_location_tracking ? (
                    <>
                    <DashboardDetailRow label="Location tracking" value="Required for service area business pins" />
                      <DashboardDetailRow label="Last pin update" value={trackedBusinessLocationUpdatedAt || 'Waiting for the first phone location update'} />
                    </>
                  ) : null}
                  </View>
                  {session.requires_business_location_tracking ? <Text style={styles.dashboardSupportText}>Keep location access enabled on this device so your map pin reflects your approximate current phone location.</Text> : null}
                </View>

                <View style={styles.dashboardSection}>
                  <Text style={styles.dashboardSectionTitle}>Business profile details</Text>
                  <Text style={styles.dashboardSupportText}>Open your public business profile to edit the public-facing business details on a dedicated screen and preview how the profile looks on the map.</Text>
                  {approvedBusinesses[0]?.slug ? (
                    <View style={styles.dashboardInlineActions}>
                      <Pressable onPress={() => onOpenApprovedBusiness(approvedBusinesses[0].slug)} style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton]}>
                        <Text style={styles.linkButtonSecondaryText}>Open public business profile</Text>
                      </Pressable>
                      <Pressable onPress={onOpenBusinessProfileEditor} style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton]}>
                        <Text style={styles.linkButtonSecondaryText}>Edit Business Profile</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                <View style={styles.dashboardSection}>
                  <Text style={styles.dashboardSectionTitle}>Home feed boosts</Text>
                  <Text style={styles.dashboardSupportText}>Boosted posts run on the weekly subscription MVP model. Each campaign tracks a 7-day delivery window so you can see impressions, clicks, and remaining quota without adding ad-manager complexity yet.</Text>
                  {sponsoredCampaigns.length ? (
                    <View style={styles.dashboardFieldGrid}>
                      {sponsoredCampaigns.map((campaign) => (
                        <View key={campaign.id} style={[styles.dashboardFavoriteBusinessCard, styles.dashboardCampaignCard]}>
                          <View style={styles.dashboardCampaignHeaderRow}>
                            <View style={styles.dashboardCampaignHeaderCopy}>
                              <Text style={styles.dashboardDetailValue}>{campaign.name}</Text>
                              <Text style={styles.dashboardSupportText}>{campaign.post.title} • {campaign.post.content_type_label}</Text>
                            </View>
                            <View style={[styles.dashboardCampaignStatusBadge, campaign.is_currently_active ? styles.dashboardCampaignStatusBadgeActive : null]}>
                              <Text style={[styles.dashboardCampaignStatusBadgeText, campaign.is_currently_active ? styles.dashboardCampaignStatusBadgeTextActive : null]}>{campaign.is_currently_active ? 'Active' : campaign.status_label}</Text>
                            </View>
                          </View>
                          <View style={styles.dashboardFieldGrid}>
                            <View style={styles.dashboardDetailItem}>
                              <Text style={styles.dashboardDetailLabel}>Price</Text>
                              <Text style={styles.dashboardDetailValue}>{formatCampaignPrice(campaign.weekly_price_cents)}</Text>
                            </View>
                            <View style={styles.dashboardDetailItem}>
                              <Text style={styles.dashboardDetailLabel}>Weekly quota</Text>
                              <Text style={styles.dashboardDetailValue}>{campaign.weekly_impression_quota} impressions</Text>
                            </View>
                            <View style={styles.dashboardDetailItem}>
                              <Text style={styles.dashboardDetailLabel}>Delivered</Text>
                              <Text style={styles.dashboardDetailValue}>{campaign.impressions_last_7_days}</Text>
                            </View>
                            <View style={styles.dashboardDetailItem}>
                              <Text style={styles.dashboardDetailLabel}>Remaining</Text>
                              <Text style={styles.dashboardDetailValue}>{campaign.remaining_impressions ?? 'Unlimited'}</Text>
                            </View>
                            <View style={styles.dashboardDetailItem}>
                              <Text style={styles.dashboardDetailLabel}>Clicks</Text>
                              <Text style={styles.dashboardDetailValue}>{campaign.clicks_last_7_days}</Text>
                            </View>
                            <View style={styles.dashboardDetailItem}>
                              <Text style={styles.dashboardDetailLabel}>CTR</Text>
                              <Text style={styles.dashboardDetailValue}>{formatCampaignPercent(campaign.click_through_rate_percent)}</Text>
                            </View>
                          </View>
                          <Text style={styles.dashboardSupportText}>{campaign.post.summary || 'This boosted post is eligible for fair rotation inside the home feed and is throttled by weekly quota.'}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={[styles.dashboardFavoriteBusinessCard, styles.dashboardCampaignCard]}>
                      <Text style={styles.dashboardDetailValue}>No boosted campaigns yet</Text>
                      <Text style={styles.dashboardSupportText}>Launch with weekly boosted posts first. It is the simplest MVP: one flat weekly price, quota-backed delivery, and fair rotation in the home feed.</Text>
                    </View>
                  )}
                  {session.billing_portal_url ? (
                    <Pressable onPress={onOpenBilling} style={styles.linkButtonSecondaryWide}>
                      <Text style={styles.linkButtonSecondaryText}>{sponsoredCampaigns.length ? 'Manage billing for boosts' : 'Open billing to start boosting posts'}</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.dashboardSection}>
                  <Text style={styles.dashboardSectionTitle}>Approved Business</Text>
                  {approvedBusinesses.length ? <View style={styles.dashboardFieldGrid}>{approvedBusinesses.map((business) => (
                    <View key={business.id} style={[styles.dashboardDetailItem, styles.dashboardFavoriteBusinessCard]}>
                      <Text style={styles.dashboardDetailValue}>{business.name}</Text>
                      <Text style={styles.dashboardSupportText}>{business.city_label} • {business.venue_type_label}</Text>
                      {business.address_line_1 ? <Text style={styles.dashboardSupportText}>{business.address_line_1}</Text> : null}
                      {business.website_url ? <Text style={styles.dashboardSupportText}>{business.website_url}</Text> : null}
                    </View>
                  ))}</View> : (
                    <Text style={styles.dashboardSupportText}>Claimed or created businesses appear here after admin approval.</Text>
                  )}
                </View>
              </>
            ) : null}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function FavoriteBusinessesScreen({
  isLandscape,
  onBack,
  onOpenFavoriteBusiness,
  session,
}: {
  isLandscape: boolean;
  onBack: () => void;
  onOpenFavoriteBusiness: (slug: string) => void;
  session: SignupResponse;
}) {
  const favoriteBusinesses = session.favorite_businesses ?? [];
  const [favoriteSearchQuery, setFavoriteSearchQuery] = useState('');
  const normalizedFavoriteSearchQuery = normalizeSearchText(favoriteSearchQuery);
  const filteredFavoriteBusinesses = favoriteBusinesses.filter((business) => {
    if (!normalizedFavoriteSearchQuery.length) {
      return true;
    }

    const searchableText = normalizeSearchText([
      business.name,
      business.city_label,
      business.venue_type_label,
      business.address_line_1,
    ].filter(Boolean).join(' '));

    return searchableText.includes(normalizedFavoriteSearchQuery);
  });

  useEffect(() => {
    setFavoriteSearchQuery('');
  }, [session.favorite_businesses]);

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <ScrollView contentContainerStyle={styles.dashboardScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
          <NativeIOSLiquidGlassBackButton label="Back to Profile" onPress={onBack} />
        </View>

        <View style={styles.dashboardShell}>
          <Text style={styles.detailCity}>Customer Dashboard</Text>
          <Text style={styles.detailTitle}>Favorite Businesses</Text>
          <Text style={styles.profileIntroText}>Open one of your saved businesses to jump back into its public profile.</Text>

          <View style={styles.dashboardSection}>
            <Text style={styles.dashboardSectionTitle}>Saved businesses</Text>
            {favoriteBusinesses.length > 1 ? (
              <TextInput
                onChangeText={setFavoriteSearchQuery}
                placeholder="Search favorite businesses"
                placeholderTextColor="#9a7f6c"
                style={styles.profileInput}
                value={favoriteSearchQuery}
              />
            ) : null}
            {filteredFavoriteBusinesses.length ? (
              <View style={styles.dashboardFieldGrid}>
                {filteredFavoriteBusinesses.map((business) => (
                  <FavoriteBusinessCard
                    key={business.slug}
                    addressLine={business.address_line_1}
                    cityLabel={business.city_label}
                    name={business.name}
                    onPress={() => onOpenFavoriteBusiness(business.slug)}
                    venueTypeLabel={business.venue_type_label}
                  />
                ))}
              </View>
            ) : favoriteBusinesses.length ? (
              <Text style={styles.dashboardSupportText}>No favorite businesses matched that search.</Text>
            ) : (
              <Text style={styles.dashboardSupportText}>Star businesses from place details to keep a list of favorites here.</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function FavoriteBusinessNotificationsScreen({
  errorMessage,
  isLandscape,
  message,
  onBack,
  onClear,
  onClearNotification,
  onOpenFavoriteBusiness,
  session,
  submitting,
}: {
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onClear: () => void;
  onClearNotification: (notificationId: number) => void;
  onOpenFavoriteBusiness: (slug: string) => void;
  session: SignupResponse;
  submitting: boolean;
}) {
  const favoriteBusinessNotifications = (session.favorite_business_notifications ?? []).slice(0, 20);
  const hasNotificationOverflow = favoriteBusinessNotifications.length > 5;

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <ScrollView contentContainerStyle={styles.dashboardScrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
          <NativeIOSLiquidGlassBackButton label="Back to Profile" onPress={onBack} />
        </View>

        <View style={styles.dashboardShell}>
          <Text style={styles.detailCity}>Customer Dashboard</Text>
          <Text style={styles.detailTitle}>Business Notifications</Text>
          <Text style={styles.profileIntroText}>These alerts appear when one of your favorited businesses updates its profile or publishes something new.</Text>

          {message ? (
            <View style={styles.profileSuccessBanner}>
              <Text style={styles.profileSuccessText}>{message}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.dashboardSection}>
            <View style={styles.dashboardNotificationSectionHeader}>
              <Text style={styles.dashboardSectionTitle}>Recent Alerts</Text>
              {favoriteBusinessNotifications.length ? (
                <Pressable disabled={submitting} onPress={onClear} style={[styles.dashboardNotificationClearButton, submitting ? styles.linkButtonDisabled : null]}>
                  <Text style={styles.dashboardNotificationClearButtonText}>{submitting ? 'Clearing...' : 'Clear all'}</Text>
                </Pressable>
              ) : null}
            </View>
            {favoriteBusinessNotifications.length ? (
              hasNotificationOverflow ? (
                <ScrollView
                  contentContainerStyle={styles.dashboardNotificationList}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={styles.dashboardNotificationListScroller}
                >
                  {favoriteBusinessNotifications.map((notification) => (
                    <FavoriteBusinessNotificationCard
                      key={notification.id}
                      onDismiss={() => onClearNotification(notification.id)}
                      notification={notification}
                      onPress={() => onOpenFavoriteBusiness(notification.slug)}
                      submitting={submitting}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.dashboardNotificationList}>
                  {favoriteBusinessNotifications.map((notification) => (
                    <FavoriteBusinessNotificationCard
                      key={notification.id}
                      onDismiss={() => onClearNotification(notification.id)}
                      notification={notification}
                      onPress={() => onOpenFavoriteBusiness(notification.slug)}
                      submitting={submitting}
                    />
                  ))}
                </View>
              )
            ) : (
              <Text style={styles.dashboardSupportText}>When a favorited business updates its profile or publishes new content, those alerts will show up here.</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export type BusinessProfileEditorScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onSaveProfileDetails: (payload: ProfileDashboardUpdateRequest, photoUploads?: BusinessAttachmentDraft[]) => void;
  onViewInMap: () => void;
  session: SignupResponse;
  submitting: boolean;
};

function normalizeSelectedPhotoAsset(asset: ImagePicker.ImagePickerAsset): BusinessAttachmentDraft {
  return {
    id: `${asset.assetId ?? asset.uri}::${asset.fileName ?? 'business-photo'}::${asset.fileSize ?? 0}`,
    name: asset.fileName ?? `business-photo-${Date.now()}.jpg`,
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize ?? null,
  };
}

function mergeSelectedPhotoUploads(current: BusinessAttachmentDraft[], next: BusinessAttachmentDraft[]) {
  const merged = [...current];
  next.forEach((attachment) => {
    if (!merged.some((existing) => existing.id === attachment.id)) {
      merged.push(attachment);
    }
  });
  return merged;
}

function formatAttachmentSize(size: number | null) {
  if (!size || size <= 0) {
    return 'Ready to upload';
  }

  if (size >= 1024 * 1024) {
    return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getDisplayablePhotoUrls(references?: string[]) {
  return dedupeImageUrls(
    (references ?? []).filter((reference) => /^https?:\/\//i.test(String(reference || '').trim())),
  );
}

export function BusinessProfileEditorScreen({
  errorMessage,
  isLandscape,
  message,
  onBack,
  onSaveProfileDetails,
  onViewInMap,
  session,
  submitting,
}: BusinessProfileEditorScreenProps) {
  const businessContact = session.business_contact ?? {};
  const approvedBusiness = session.approved_businesses?.[0] ?? null;
  const [profileDraft, setProfileDraft] = useState<BusinessProfileDraft>(() => buildDashboardDraft(session));
  const [currentPhotoUrls, setCurrentPhotoUrls] = useState<string[]>(() => getDisplayablePhotoUrls(businessContact.photo_references));
  const [selectedPhotoUploads, setSelectedPhotoUploads] = useState<BusinessAttachmentDraft[]>([]);
  const existingPhotoUrls = getDisplayablePhotoUrls(businessContact.photo_references);
  const remainingPhotoSlots = Math.max(0, 8 - currentPhotoUrls.length - selectedPhotoUploads.length);
  const existingSocialInputs = socialProfilesToInputs(businessContact.social_profiles, businessContact.business_website_url ?? '');
  const socialFieldErrors = {
    website: getSocialProfileValidationMessage('website', profileDraft.business_website_url ?? ''),
    instagram: getSocialProfileValidationMessage('instagram', profileDraft.instagram_profile ?? ''),
    facebook: getSocialProfileValidationMessage('facebook', profileDraft.facebook_profile ?? ''),
    tiktok: getSocialProfileValidationMessage('tiktok', profileDraft.tiktok_profile ?? ''),
    youtube: getSocialProfileValidationMessage('youtube', profileDraft.youtube_profile ?? ''),
  };

  useEffect(() => {
    setProfileDraft(buildDashboardDraft(session));
    setCurrentPhotoUrls(getDisplayablePhotoUrls(session.business_contact?.photo_references));
    setSelectedPhotoUploads([]);
  }, [session]);

  const profileDetailsChanged = (profileDraft.contact_name ?? '') !== (businessContact.contact_name ?? '')
    || (profileDraft.job_title ?? '') !== (businessContact.job_title ?? '')
    || (profileDraft.work_email ?? '') !== (businessContact.work_email ?? '')
    || (profileDraft.work_phone ?? '') !== (businessContact.work_phone ?? '')
    || (profileDraft.employer_address ?? '') !== (businessContact.employer_address ?? '')
    || (profileDraft.business_website_url ?? '') !== existingSocialInputs.website
    || (profileDraft.instagram_profile ?? '') !== existingSocialInputs.instagram
    || (profileDraft.facebook_profile ?? '') !== existingSocialInputs.facebook
    || (profileDraft.tiktok_profile ?? '') !== existingSocialInputs.tiktok
    || (profileDraft.youtube_profile ?? '') !== existingSocialInputs.youtube
    || JSON.stringify(buildNormalizedDealOverrides(profileDraft.deal_overrides ?? [])) !== JSON.stringify(buildNormalizedDealOverrides(businessContact.deal_overrides ?? buildDealOverridesFromDeals(businessContact.deals ?? [])))
    || JSON.stringify(buildNormalizedOperatingHourOverrides(profileDraft.operating_hour_overrides ?? [])) !== JSON.stringify(buildNormalizedOperatingHourOverrides(businessContact.operating_hour_overrides ?? buildOperatingHourOverridesFromWindows(businessContact.operating_hours ?? [])))
    || joinDraftEntries(currentPhotoUrls) !== joinDraftEntries(existingPhotoUrls)
    || (profileDraft.supporting_details ?? '') !== (businessContact.supporting_details ?? '')
    || selectedPhotoUploads.length > 0;

  function buildSavePayload(): ProfileDashboardUpdateRequest {
    const socialProfiles = buildSocialProfilesFromInputs({
      instagram: profileDraft.instagram_profile ?? '',
      facebook: profileDraft.facebook_profile ?? '',
      tiktok: profileDraft.tiktok_profile ?? '',
      youtube: profileDraft.youtube_profile ?? '',
      website: profileDraft.business_website_url ?? '',
    });

    return {
      portal: session.portal,
      username: session.username,
      email: session.email,
      first_name: session.first_name,
      last_name: session.last_name,
      contact_name: profileDraft.contact_name ?? '',
      job_title: profileDraft.job_title ?? '',
      work_email: profileDraft.work_email ?? '',
      work_phone: profileDraft.work_phone ?? '',
      employer_address: profileDraft.employer_address ?? '',
      business_website_url: profileDraft.business_website_url ?? '',
      deal_overrides: buildNormalizedDealOverrides(profileDraft.deal_overrides ?? []),
      operating_hour_overrides: buildNormalizedOperatingHourOverrides(profileDraft.operating_hour_overrides ?? []),
      social_profiles: socialProfiles,
      offer_entries_text: profileDraft.offer_entries_text ?? '',
      hours_of_operation_entries_text: profileDraft.hours_of_operation_entries_text ?? '',
      photo_references_text: currentPhotoUrls.join('\n'),
      supporting_details: profileDraft.supporting_details ?? '',
    };
  }

  function renderSocialProfileField(platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube', field: keyof BusinessProfileDraft, placeholder: string) {
    const fieldValue = String(profileDraft[field] ?? '');
    const fieldError = socialFieldErrors[platform];
    const preview = getSocialProfilePreview(platform, fieldValue);

    return (
      <View key={field} style={styles.dashboardFieldColumn}>
        <Text style={styles.dashboardDetailLabel}>{SOCIAL_PLATFORM_LABELS[platform]}</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={(value) => setProfileDraft((current) => ({ ...current, [field]: value }))}
          placeholder={placeholder}
          placeholderTextColor="#9a7f6c"
          style={styles.profileInput}
          value={fieldValue}
        />
        {fieldError ? <Text style={styles.structuredEntryErrorText}>{fieldError}</Text> : null}
        {!fieldError && preview ? <Text style={styles.dashboardSupportText}>{`Displays as ${preview}`}</Text> : null}
      </View>
    );
  }

  function handleSaveBusinessProfile() {
    if (Object.values(socialFieldErrors).some(Boolean)) {
      return;
    }

    onSaveProfileDetails(buildSavePayload(), selectedPhotoUploads);
  }

  async function handleSelectProfilePhotos() {
    try {
      if (remainingPhotoSlots <= 0) {
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        allowsMultipleSelection: false,
        aspect: [4, 3],
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (result.canceled) {
        return;
      }

      const nextAttachments = result.assets
        .slice(0, 1)
        .map(normalizeSelectedPhotoAsset);
      setSelectedPhotoUploads((current) => mergeSelectedPhotoUploads(current, nextAttachments));
    } catch {
      // The parent screen already renders submission errors; picker failures can stay silent here.
    }
  }

  function handleRemoveCurrentPhoto(photoUrl: string) {
    setCurrentPhotoUrls((current) => current.filter((url) => url !== photoUrl));
  }

  function handleRemoveSelectedPhotoUpload(attachmentId: string) {
    setSelectedPhotoUploads((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingFill}
      >
        <ScrollView
          contentContainerStyle={styles.dashboardScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <NativeIOSLiquidGlassBackButton label="Back to Profile" onPress={onBack} />
          </View>

          <View style={styles.dashboardShell}>
            <Text style={styles.detailCity}>Edit Business Profile</Text>
            <Text style={styles.detailTitle}>{approvedBusiness?.name ?? session.business_name ?? 'Business Profile'}</Text>
            {approvedBusiness?.address_line_1 ? <Text style={styles.detailMeta}>{approvedBusiness.address_line_1}</Text> : null}
            <Text style={styles.profileIntroText}>Update the public-facing details for your approved business profile. Your approved business phone and address override pulled source data in the app.</Text>

            {message ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{message}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Business profile details</Text>
              <View style={styles.dashboardFieldGrid}>
                <DashboardEditableField label="Contact name" onChangeText={(value) => setProfileDraft((current) => ({ ...current, contact_name: value }))} value={profileDraft.contact_name ?? ''} />
                <DashboardEditableField label="Job title" onChangeText={(value) => setProfileDraft((current) => ({ ...current, job_title: value }))} value={profileDraft.job_title ?? ''} />
                <DashboardEditableField label="Work email" onChangeText={(value) => setProfileDraft((current) => ({ ...current, work_email: value }))} value={profileDraft.work_email ?? ''} />
                <DashboardEditableField label="Public phone" onChangeText={(value) => setProfileDraft((current) => ({ ...current, work_phone: value }))} value={profileDraft.work_phone ?? ''} />
                <DashboardEditableField label="Public address" onChangeText={(value) => setProfileDraft((current) => ({ ...current, employer_address: value }))} value={profileDraft.employer_address ?? ''} />
                <DashboardEditableField label="Business website" onChangeText={(value) => setProfileDraft((current) => ({ ...current, business_website_url: value }))} value={profileDraft.business_website_url ?? ''} />
              </View>
              {socialFieldErrors.website ? <Text style={styles.structuredEntryErrorText}>{socialFieldErrors.website}</Text> : null}
              {!socialFieldErrors.website && getSocialProfilePreview('website', profileDraft.business_website_url ?? '') ? (
                <Text style={styles.dashboardSupportText}>{`Website displays as ${getSocialProfilePreview('website', profileDraft.business_website_url ?? '')}`}</Text>
              ) : null}
              <View style={styles.dashboardFieldGrid}>
                {renderSocialProfileField('instagram', 'instagram_profile', 'instagram.com/yourbusiness or yourbusiness')}
                {renderSocialProfileField('facebook', 'facebook_profile', 'facebook.com/yourbusiness or yourbusiness')}
                {renderSocialProfileField('tiktok', 'tiktok_profile', 'tiktok.com/@yourbusiness or @yourbusiness')}
                {renderSocialProfileField('youtube', 'youtube_profile', 'youtube.com/@yourbusiness or @yourbusiness')}
              </View>
              <BusinessDealsEditor
                label="Deals and specials"
                onChange={(value) => setProfileDraft((current) => ({ ...current, deal_overrides: value }))}
                supportText="Edit the same deal cards your customers see, including title, price, description, and active day/time windows."
                value={profileDraft.deal_overrides ?? []}
              />
              <BusinessHoursEditor
                label="Hours of operation"
                onChange={(value) => setProfileDraft((current) => ({ ...current, operating_hour_overrides: value }))}
                supportText="Edit the public operating hours directly by day so the grouped cards stay in sync with the profile."
                value={profileDraft.operating_hour_overrides ?? []}
              />
              <View style={styles.attachmentSection}>
                <Text style={styles.dashboardDetailLabel}>Business photos</Text>
                <Pressable onPress={() => void handleSelectProfilePhotos()} style={[styles.linkButtonSecondary, styles.attachmentPickerButton, remainingPhotoSlots === 0 ? styles.linkButtonDisabled : null]}>
                  <Text style={styles.linkButtonSecondaryText}>Select from Photo Library</Text>
                </Pressable>
                <Text style={[styles.dashboardSupportText, styles.attachmentSupportText]}>Choose photos from the device photo library only. You can crop each photo before saving. Max 8 photos total.</Text>
                {currentPhotoUrls.length ? (
                  <>
                    <View style={styles.attachmentGalleryLabelRow}>
                      <Text style={styles.attachmentGalleryLabel}>Current public photos</Text>
                      <Text style={styles.attachmentGalleryCount}>{`${currentPhotoUrls.length} / 8`}</Text>
                    </View>
                    <ScrollView
                      contentContainerStyle={styles.photoGalleryRow}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.photoGalleryScroll}
                    >
                      {currentPhotoUrls.map((photoUrl) => (
                        <View key={photoUrl} style={styles.photoGalleryCard}>
                          <Image resizeMode="cover" source={{ uri: photoUrl }} style={styles.photoGalleryImage} />
                          <Pressable onPress={() => handleRemoveCurrentPhoto(photoUrl)} style={styles.photoGalleryDismissButton}>
                            <Text style={styles.photoGalleryDismissButtonText}>X</Text>
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                {selectedPhotoUploads.length ? (
                  <>
                    <Text style={styles.attachmentGalleryLabel}>Selected photos</Text>
                    <ScrollView
                      contentContainerStyle={styles.photoGalleryRow}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.photoGalleryScroll}
                    >
                      {selectedPhotoUploads.map((attachment) => (
                        <View key={attachment.id} style={styles.photoGalleryCard}>
                          <Image resizeMode="cover" source={{ uri: attachment.uri }} style={styles.photoGalleryImage} />
                          <Pressable onPress={() => handleRemoveSelectedPhotoUpload(attachment.id)} style={styles.photoGalleryDismissButton}>
                            <Text style={styles.photoGalleryDismissButtonText}>X</Text>
                          </Pressable>
                          <View style={styles.photoGalleryMeta}>
                            <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                            <Text style={styles.attachmentDetail}>{formatAttachmentSize(attachment.size)}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
              </View>
              <DashboardMultilineField label="Business details" onChangeText={(value) => setProfileDraft((current) => ({ ...current, supporting_details: value }))} value={profileDraft.supporting_details ?? ''} />
              <View style={styles.dashboardInlineActions}>
                <Pressable
                  onPress={handleSaveBusinessProfile}
                  style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton, (!profileDetailsChanged || submitting) ? styles.linkButtonDisabled : null]}
                >
                  <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Saving...' : 'Save Business Profile'}</Text>
                </Pressable>
                <Pressable onPress={onViewInMap} style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton]}>
                  <Text style={styles.linkButtonSecondaryText}>View in Map</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AccountSettingsScreen({
  deleteAccountPassword,
  errorMessage,
  isLandscape,
  message,
  onBack,
  onBeginTwoFactorSetup,
  onChangeDeleteAccountPassword,
  onChangeTwoFactorDisableCode,
  onChangeTwoFactorSetupCode,
  onConfirmTwoFactorSetup,
  onDisableTwoFactor,
  onLogout,
  onToggleBusinessLocationTracking,
  onOpenContactSupport,
  onDeleteAccount,
  onOpenBlockedDirectMessageCustomers,
  onOpenPrivacyPolicy,
  onOpenTermsOfService,
  onToggleDirectMessaging,
  pendingBusinessLocationTrackingEnabled,
  pendingDirectMessagingEnabled,
  session,
  settingsSubmittingAction,
  twoFactorDisableCode,
  twoFactorSetup,
  twoFactorSetupCode,
}: AccountSettingsScreenProps) {
  const submitting = settingsSubmittingAction !== null;
  const togglingBusinessLocation = settingsSubmittingAction === 'business-location';
  const togglingDirectMessaging = settingsSubmittingAction === 'direct-messaging';
  const changingDirectMessageBlocks = settingsSubmittingAction === 'direct-message-block';
  const deletingAccount = settingsSubmittingAction === 'delete-account';
  const displayedBusinessLocationTrackingEnabled = pendingBusinessLocationTrackingEnabled ?? !!session.business_location_tracking_enabled;
  const displayedDirectMessagingEnabled = pendingDirectMessagingEnabled ?? !!session.direct_messaging_enabled;
  const blockedCustomerAccounts = session.blocked_customer_accounts ?? [];

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingFill}
      >
        <ScrollView
          contentContainerStyle={styles.dashboardScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
              <NativeIOSLiquidGlassBackButton label="Back to Dashboard" onPress={onBack} />
          </View>

          <View style={styles.dashboardShell}>
            <Text style={styles.detailCity}>Settings</Text>
            <Text style={styles.detailTitle}>Account settings</Text>
            <Text style={styles.profileIntroText}>Manage authentication, support, legal information, account requests, and your session from one place.</Text>

            {message ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{message}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <SecuritySettingsSection
              onBeginTwoFactorSetup={onBeginTwoFactorSetup}
              onChangeTwoFactorDisableCode={onChangeTwoFactorDisableCode}
              onChangeTwoFactorSetupCode={onChangeTwoFactorSetupCode}
              onConfirmTwoFactorSetup={onConfirmTwoFactorSetup}
              onDisableTwoFactor={onDisableTwoFactor}
              settingsSubmittingAction={settingsSubmittingAction}
              session={session}
              twoFactorDisableCode={twoFactorDisableCode}
              twoFactorSetup={twoFactorSetup}
              twoFactorSetupCode={twoFactorSetupCode}
            />

            {session.portal === 'business' && session.business_location_tracking_available ? (
              <View style={styles.settingsItemRow}>
                <View style={styles.settingsItemBody}>
                  <Text style={styles.dashboardSectionTitle}>Business location services</Text>
                  <Text style={styles.dashboardSupportText}>Turn live location updates on when your service area business should publish its current service area pin. Turn it off to stop sending business location updates.</Text>
                </View>
                <View style={styles.settingsItemActions}>
                  <View style={styles.settingsSwitchCluster}>
                    <View style={styles.settingsSwitchLabelGroup}>
                      <Text style={styles.dashboardDetailLabel}>Location services</Text>
                      <Text style={styles.dashboardSupportText}>{displayedBusinessLocationTrackingEnabled ? 'On' : 'Off'}</Text>
                    </View>
                    <Switch
                      disabled={deletingAccount}
                      onValueChange={onToggleBusinessLocationTracking}
                      value={displayedBusinessLocationTrackingEnabled}
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {session.portal === 'business' ? (
              <View style={styles.settingsItemRow}>
                <View style={styles.settingsItemBody}>
                  <Text style={styles.dashboardSectionTitle}>Direct messaging</Text>
                  <Text style={styles.dashboardSupportText}>Allow customers to direct message your business profile. Turn this off to hide direct messaging for all customer accounts.</Text>
                  <View style={styles.settingsSwitchCluster}>
                    <View style={styles.settingsSwitchLabelGroup}>
                      <Text style={styles.dashboardDetailLabel}>Direct messaging</Text>
                      <Text style={styles.dashboardSupportText}>{displayedDirectMessagingEnabled ? 'On' : 'Off'}</Text>
                    </View>
                    <Switch
                      disabled={deletingAccount}
                      onValueChange={onToggleDirectMessaging}
                      value={displayedDirectMessagingEnabled}
                    />
                  </View>
                  <Text style={styles.dashboardSupportText}>Blocked customers will no longer see the direct message icon on your business profile.</Text>
                  <Text style={styles.dashboardSupportText}>
                    {blockedCustomerAccounts.length
                      ? `${blockedCustomerAccounts.length} blocked customer${blockedCustomerAccounts.length === 1 ? '' : 's'}`
                      : 'No blocked customers.'}
                  </Text>
                  <Pressable onPress={onOpenBlockedDirectMessageCustomers} style={[styles.linkButtonSecondaryWide, styles.settingsInlineButton, submitting ? styles.linkButtonDisabled : null]}>
                    <Text style={styles.linkButtonSecondaryText}>{changingDirectMessageBlocks ? 'Updating...' : 'Manage blocked customers'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsItemActions}>
                  {togglingDirectMessaging ? <ActivityIndicator color="#8a4b2a" /> : null}
                </View>
              </View>
            ) : null}

            <View style={styles.settingsItemRow}>
              <View style={styles.settingsItemBody}>
                <Text style={styles.dashboardSectionTitle}>Support</Text>
                <Text style={styles.dashboardSupportText}>Open the dedicated support screen for account help, billing questions, business onboarding, or general issues.</Text>
              </View>
              <View style={styles.settingsItemActions}>
                <Pressable onPress={onOpenContactSupport} style={[styles.linkButtonSecondaryWide, styles.settingsInlineButton]}>
                  <Text style={styles.linkButtonSecondaryText}>Contact support</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.settingsItemRow}>
              <View style={styles.settingsItemBody}>
                <Text style={styles.dashboardSectionTitle}>Legal</Text>
                <Text style={styles.dashboardSupportText}>Review the current privacy policy and terms of service inside the app.</Text>
              </View>
              <View style={styles.settingsItemActions}>
                <Pressable onPress={onOpenPrivacyPolicy} style={[styles.linkButtonSecondaryWide, styles.settingsInlineButton]}>
                  <Text style={styles.linkButtonSecondaryText}>Privacy Policy</Text>
                </Pressable>
                <Pressable onPress={onOpenTermsOfService} style={[styles.linkButtonSecondaryWide, styles.settingsInlineButton]}>
                  <Text style={styles.linkButtonSecondaryText}>Terms of Service & Agreements</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.settingsItemRow}>
              <View style={styles.settingsItemBody}>
                <Text style={styles.dashboardSectionTitle}>Account management</Text>
                <Text style={styles.dashboardSupportText}>Permanently delete your DiningDealz account and associated profile data from inside the app.</Text>
                <Text style={styles.profileFieldLabel}>Current password</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={onChangeDeleteAccountPassword}
                  secureTextEntry
                  style={styles.profileInput}
                  value={deleteAccountPassword}
                />
              </View>
              <View style={styles.settingsItemActions}>
                <Pressable onPress={onDeleteAccount} style={[styles.destructiveButton, styles.settingsInlineButton, submitting ? styles.linkButtonDisabled : null]}>
                  <Text style={styles.destructiveButtonText}>{deletingAccount ? 'Deleting account...' : 'Delete account'}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable onPress={onLogout} style={styles.destructiveButton}>
              <Text style={styles.destructiveButtonText}>Log out</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function BlockedDirectMessageCustomersScreen({
  errorMessage,
  isLandscape,
  message,
  onBack,
  onConfirmBlockedDirectMessageCustomers,
  onLoadExistingDirectMessageCustomers,
  onUnblockCustomerFromDirectMessaging,
  session,
  settingsSubmittingAction,
}: BlockedDirectMessageCustomersScreenProps) {
  const changingDirectMessageBlocks = settingsSubmittingAction === 'direct-message-block';
  const blockedCustomerAccounts = session.blocked_customer_accounts ?? [];
  const [customerKeyword, setCustomerKeyword] = useState('');
  const [messageFeedCustomers, setMessageFeedCustomers] = useState<DirectMessageThread[]>([]);
  const [messageFeedCustomersError, setMessageFeedCustomersError] = useState<string | null>(null);
  const [messageFeedCustomersLoading, setMessageFeedCustomersLoading] = useState(true);
  const [selectedCustomerUsernames, setSelectedCustomerUsernames] = useState<string[]>([]);
  const [confirmBlockModalVisible, setConfirmBlockModalVisible] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadMessageFeedCustomers() {
      setMessageFeedCustomersLoading(true);
      setMessageFeedCustomersError(null);
      try {
        const threads = await onLoadExistingDirectMessageCustomers();
        if (!mounted) {
          return;
        }
        setMessageFeedCustomers(threads);
      } catch (error) {
        if (!mounted) {
          return;
        }
        setMessageFeedCustomersError(error instanceof Error ? error.message : 'Unable to load customers with direct message feeds.');
      } finally {
        if (mounted) {
          setMessageFeedCustomersLoading(false);
        }
      }
    }

    void loadMessageFeedCustomers();

    return () => {
      mounted = false;
    };
  }, []);

  const blockedCustomerUsernames = new Set(blockedCustomerAccounts.map((account) => account.username.toLowerCase()));
  const normalizedCustomerKeyword = normalizeSearchText(customerKeyword);
  const selectableMessageFeedCustomers = Array.from(
    messageFeedCustomers.reduce((customers, thread) => {
      if (!thread.customer_username) {
        return customers;
      }
      const normalizedUsername = thread.customer_username.toLowerCase();
      if (!customers.has(normalizedUsername)) {
        customers.set(normalizedUsername, thread);
      }
      return customers;
    }, new Map<string, DirectMessageThread>()).values(),
  )
    .filter((thread) => !blockedCustomerUsernames.has(thread.customer_username.toLowerCase()))
    .filter((thread) => {
      if (!normalizedCustomerKeyword.length) {
        return true;
      }

      return normalizeSearchText(thread.customer_username).includes(normalizedCustomerKeyword);
    });
  const hasSelectableCustomerOverflow = selectableMessageFeedCustomers.length > 5;
  const hasSelectedCustomerOverflow = selectedCustomerUsernames.length > 5;

  function handleToggleCustomerSelection(username: string) {
    setSelectedCustomerUsernames((current) => {
      const normalizedUsername = username.toLowerCase();
      return current.some((value) => value.toLowerCase() === normalizedUsername)
        ? current.filter((value) => value.toLowerCase() !== normalizedUsername)
        : [...current, username];
    });
  }

  function handleCancelConfirmBlock() {
    if (changingDirectMessageBlocks) {
      return;
    }
    setConfirmBlockModalVisible(false);
  }

  async function handleConfirmBlockCustomers() {
    const didConfirm = await onConfirmBlockedDirectMessageCustomers(selectedCustomerUsernames);
    if (!didConfirm) {
      return;
    }

    setConfirmBlockModalVisible(false);
    setSelectedCustomerUsernames([]);
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingFill}
      >
        <ScrollView
          contentContainerStyle={styles.dashboardScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <NativeIOSLiquidGlassBackButton label="Back to Settings" onPress={onBack} />
          </View>

          <View style={styles.dashboardShell}>
            <Text style={styles.detailCity}>Direct messaging</Text>
            <Text style={styles.detailTitle}>Blocked customers</Text>
            <Text style={styles.profileIntroText}>Manage which customer accounts can no longer open direct messages with your business profile.</Text>

            {message ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{message}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Text style={styles.dashboardSectionTitle}>Customers with existing message feeds</Text>
            <Text style={styles.dashboardSupportText}>Filter by keyword, then tap a customer to select or deselect that username for blocking.</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setCustomerKeyword}
              placeholder="Filter by username"
              placeholderTextColor="#9a7f6c"
              style={styles.profileInput}
              value={customerKeyword}
            />
            {messageFeedCustomersLoading ? (
              <ActivityIndicator color="#8a4b2a" />
            ) : messageFeedCustomersError ? (
              <Text style={styles.dashboardSupportText}>{messageFeedCustomersError}</Text>
            ) : selectableMessageFeedCustomers.length ? (
              <View style={styles.settingsItemBody}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={hasSelectableCustomerOverflow}
                  style={hasSelectableCustomerOverflow ? styles.blockedCustomerListScroller : null}
                >
                  <View style={styles.settingsItemBody}>
                    {selectableMessageFeedCustomers.map((thread) => {
                      const selected = selectedCustomerUsernames.some((username) => username.toLowerCase() === thread.customer_username.toLowerCase());
                      return (
                        <Pressable
                          key={thread.id}
                          onPress={() => handleToggleCustomerSelection(thread.customer_username)}
                          style={[
                            styles.dashboardNotificationCard,
                            styles.blockedCustomerSelectableCard,
                            selected ? styles.dashboardNotificationCardSelected : null,
                          ]}
                        >
                          <View style={styles.blockedCustomerSelectableContent}>
                            <View style={styles.dashboardDetailItem}>
                              <Text style={styles.dashboardDetailValue}>{thread.customer_username}</Text>
                              <Text style={styles.dashboardSupportText}>{thread.last_message_preview || 'Existing direct message thread'}</Text>
                            </View>
                            <View style={[
                              styles.blockedCustomerSelectionIndicator,
                              selected ? styles.blockedCustomerSelectionIndicatorActive : null,
                            ]}>
                              {selected ? <View style={styles.blockedCustomerSelectionIndicatorDot} /> : null}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ) : (
              <Text style={styles.dashboardSupportText}>No matching customer accounts with existing message feeds.</Text>
            )}

            {blockedCustomerAccounts.length ? (
              <View style={styles.settingsItemBody}>
                {blockedCustomerAccounts.map((blockedAccount) => (
                  <View key={blockedAccount.block_id} style={[styles.dashboardDetailItem, styles.dashboardNotificationCard]}>
                    <Text style={styles.dashboardDetailValue}>{blockedAccount.username}</Text>
                    <Text style={styles.dashboardSupportText}>{[blockedAccount.first_name, blockedAccount.last_name].filter(Boolean).join(' ') || 'Customer account'}</Text>
                    <Pressable onPress={() => onUnblockCustomerFromDirectMessaging(blockedAccount.block_id)} style={[styles.linkButtonSecondaryWide, styles.settingsInlineButton, changingDirectMessageBlocks ? styles.linkButtonDisabled : null]}>
                      <Text style={styles.linkButtonSecondaryText}>{changingDirectMessageBlocks ? 'Updating...' : 'Unblock customer'}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.dashboardSupportText}>No blocked customers.</Text>
            )}

            <Text style={styles.dashboardSupportText}>
              {selectedCustomerUsernames.length
                ? `${selectedCustomerUsernames.length} customer account${selectedCustomerUsernames.length === 1 ? '' : 's'} selected.`
                : 'Select customer accounts from the list above to block direct messages.'}
            </Text>
            <Pressable
              disabled={!selectedCustomerUsernames.length || changingDirectMessageBlocks}
              onPress={() => setConfirmBlockModalVisible(true)}
              style={[
                styles.linkButtonSecondaryWide,
                styles.settingsInlineButton,
                (!selectedCustomerUsernames.length || changingDirectMessageBlocks) ? styles.linkButtonDisabled : null,
              ]}
            >
              <Text style={styles.linkButtonSecondaryText}>{changingDirectMessageBlocks ? 'Saving block...' : 'Block customer from direct messages'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal animationType="fade" onRequestClose={handleCancelConfirmBlock} transparent visible={confirmBlockModalVisible}>
        <Pressable onPress={handleCancelConfirmBlock} style={styles.guestFavoriteModalBackdrop}>
          <Pressable onPress={() => undefined} style={[styles.guestFavoriteModalCard, styles.blockedCustomerConfirmModalCard]}>
            <Text style={styles.guestFavoriteModalTitle}>Confirm blocked customers</Text>
            <Text style={styles.guestFavoriteModalText}>Are you sure these are the accounts you want to block from direct messages?</Text>
            <View style={styles.settingsItemBody}>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={hasSelectedCustomerOverflow}
                style={hasSelectedCustomerOverflow ? styles.blockedCustomerModalListScroller : null}
              >
                <View style={styles.settingsItemBody}>
                  {selectedCustomerUsernames.map((username) => (
                    <View key={username} style={[styles.dashboardNotificationCard, styles.blockedCustomerConfirmationRow]}>
                      <Text style={styles.dashboardDetailValue}>{username}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleCancelConfirmBlock} style={styles.guestFavoriteModalSecondaryButton}>
                <Text style={styles.guestFavoriteModalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void handleConfirmBlockCustomers()} style={[styles.guestFavoriteModalPrimaryButton, changingDirectMessageBlocks ? styles.linkButtonDisabled : null]}>
                <Text style={styles.guestFavoriteModalPrimaryText}>{changingDirectMessageBlocks ? 'Blocking...' : 'Confirm'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
