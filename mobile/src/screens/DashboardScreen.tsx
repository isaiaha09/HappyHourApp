import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { styles } from '../appStyles';
import { normalizeSearchText } from '../placeHelpers';
import type { ProfileDashboardUpdateRequest, SignupResponse, TwoFactorSetupResponse } from '../types';

export type DashboardScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  loading: boolean;
  message: string | null;
  onBack: () => void;
  onOpenBilling: () => void;
  onOpenApprovedBusiness: (slug: string) => void;
  onOpenFavoriteBusiness: (slug: string) => void;
  onOpenPlaces: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onResendVerification: () => void;
  onSaveProfileDetails: (payload: ProfileDashboardUpdateRequest) => void;
  session: SignupResponse;
  submitting: boolean;
};

export type AccountSettingsScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onBeginTwoFactorSetup: () => void;
  onChangeTwoFactorDisableCode: (value: string) => void;
  onChangeTwoFactorSetupCode: (value: string) => void;
  onConfirmTwoFactorSetup: () => void;
  onDisableTwoFactor: () => void;
  onLogout: () => void;
  onToggleBusinessLocationTracking: (value: boolean) => void;
  onOpenContactSupport: () => void;
  onOpenDeleteAccountRequest: () => void;
  onOpenDisableAccountRequest: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenTermsOfService: () => void;
  session: SignupResponse;
  submitting: boolean;
  twoFactorDisableCode: string;
  twoFactorSetup: TwoFactorSetupResponse | null;
  twoFactorSetupCode: string;
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

function joinDraftEntries(values?: string[]) {
  return (values ?? []).join('\n');
}

function buildDashboardDraft(session: SignupResponse): ProfileDashboardUpdateRequest {
  const businessContact = session.business_contact ?? {};

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
    business_website_url: businessContact.business_website_url ?? '',
    social_media_links_text: joinDraftEntries(businessContact.social_media_links),
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
  return <Text style={styles.settingsIconGlyph}>⚙</Text>;
}

function SecuritySettingsSection({
  onBeginTwoFactorSetup,
  onChangeTwoFactorDisableCode,
  onChangeTwoFactorSetupCode,
  onConfirmTwoFactorSetup,
  onDisableTwoFactor,
  session,
  submitting,
  twoFactorDisableCode,
  twoFactorSetup,
  twoFactorSetupCode,
}: Pick<AccountSettingsScreenProps,
  'onBeginTwoFactorSetup'
  | 'onChangeTwoFactorDisableCode'
  | 'onChangeTwoFactorSetupCode'
  | 'onConfirmTwoFactorSetup'
  | 'onDisableTwoFactor'
  | 'session'
  | 'submitting'
  | 'twoFactorDisableCode'
  | 'twoFactorSetup'
  | 'twoFactorSetupCode'
>) {
  const [twoFactorQrMatrix, setTwoFactorQrMatrix] = useState<QrMatrix | null>(null);
  const [twoFactorQrLoadFailed, setTwoFactorQrLoadFailed] = useState(false);
  const [twoFactorKeyCopied, setTwoFactorKeyCopied] = useState(false);

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
            <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Saving...' : 'Disable authenticator 2FA'}</Text>
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
            <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Saving...' : 'Confirm authenticator setup'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.dashboardSupportText}>Set up an authenticator app to require a 6-digit verification code each time you sign in.</Text>
          <Pressable onPress={onBeginTwoFactorSetup} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
            <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Preparing...' : 'Set up authenticator app'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function DashboardScreen({ errorMessage, isLandscape, loading, message, onBack, onOpenBilling, onOpenApprovedBusiness, onOpenFavoriteBusiness, onOpenPlaces, onOpenSettings, onRefresh, onResendVerification, onSaveProfileDetails, session, submitting }: DashboardScreenProps) {
  const approvedBusinesses = session.approved_businesses ?? [];
  const favoriteBusinesses = session.favorite_businesses ?? [];
  const fullName = [session.first_name, session.last_name].filter(Boolean).join(' ');
  const trackedBusinessLocation = session.tracked_business_location ?? {};
  const trackedBusinessLocationUpdatedAt = trackedBusinessLocation.updated_at
    ? new Date(trackedBusinessLocation.updated_at).toLocaleString()
    : null;
  const [favoriteSearchQuery, setFavoriteSearchQuery] = useState('');
  const [profileDraft, setProfileDraft] = useState<ProfileDashboardUpdateRequest>(() => buildDashboardDraft(session));

  useEffect(() => {
    setProfileDraft(buildDashboardDraft(session));
  }, [session]);

  const profileDetailsChanged = profileDraft.username !== session.username
    || profileDraft.email !== session.email
    || profileDraft.first_name !== session.first_name
    || profileDraft.last_name !== session.last_name;
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
          <View style={styles.dashboardHeaderRow}>
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Open Map</Text>
            </Pressable>
            <Pressable accessibilityLabel="Open settings" onPress={onOpenSettings} style={styles.settingsIconButton}>
              <SettingsGearIcon />
            </Pressable>
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

            <Text style={styles.dashboardSupportText}>Authentication settings, support, privacy, terms, account requests, and logout now live behind the settings icon in the top-right corner.</Text>

            {session.profile_type !== 'business' ? (
              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>Favorite businesses</Text>
                {favoriteBusinesses.length > 1 ? (
                  <TextInput
                    onChangeText={setFavoriteSearchQuery}
                    placeholder="Search favorite businesses"
                    placeholderTextColor="#9a7f6c"
                    style={styles.profileInput}
                    value={favoriteSearchQuery}
                  />
                ) : null}
                {favoriteBusinesses.length ? (
                  <View style={styles.dashboardFieldGrid}>
                    {filteredFavoriteBusinesses.map((business) => (
                      <Pressable key={business.slug} onPress={() => onOpenFavoriteBusiness(business.slug)} style={[styles.dashboardDetailItem, styles.dashboardFavoriteBusinessCard]}>
                        <Text style={styles.dashboardDetailValue}>{business.name}</Text>
                        <Text style={styles.dashboardSupportText}>{business.city_label} • {business.venue_type_label}</Text>
                        <Text style={styles.dashboardSupportText}>{business.address_line_1}</Text>
                        <Text style={styles.dashboardFavoriteBusinessAction}>Open business profile</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {favoriteBusinesses.length && !filteredFavoriteBusinesses.length ? (
                  <Text style={styles.dashboardSupportText}>No favorite businesses matched that search.</Text>
                ) : (
                  !favoriteBusinesses.length ? <Text style={styles.dashboardSupportText}>Star businesses from place details to keep a list of favorites here.</Text> : null
                )}
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
                    </View>
                  ) : null}
                </View>

                <View style={styles.dashboardSection}>
                  <Text style={styles.dashboardSectionTitle}>Approved Business</Text>
                  {approvedBusinesses.length ? <View style={styles.dashboardFieldGrid}>{approvedBusinesses.map((business) => (
                    <Pressable key={business.id} onPress={() => onOpenApprovedBusiness(business.slug)} style={[styles.dashboardDetailItem, styles.dashboardFavoriteBusinessCard]}>
                      <Text style={styles.dashboardDetailValue}>{business.name}</Text>
                      <Text style={styles.dashboardSupportText}>{business.city_label} • {business.venue_type_label}</Text>
                      {business.address_line_1 ? <Text style={styles.dashboardSupportText}>{business.address_line_1}</Text> : null}
                      {business.website_url ? <Text style={styles.dashboardSupportText}>{business.website_url}</Text> : null}
                      <Text style={styles.dashboardFavoriteBusinessAction}>Open business profile</Text>
                    </Pressable>
                  ))}</View> : (
                    <Text style={styles.dashboardSupportText}>Claimed or created businesses appear here after admin approval.</Text>
                  )}
                </View>

                {session.billing_portal_url ? (
                  <Pressable onPress={onOpenBilling} style={styles.linkButtonSecondaryWide}>
                    <Text style={styles.linkButtonSecondaryText}>Open billing in browser</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export type BusinessProfileEditorScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onSaveProfileDetails: (payload: ProfileDashboardUpdateRequest) => void;
  onViewInMap: () => void;
  session: SignupResponse;
  submitting: boolean;
};

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
  const [profileDraft, setProfileDraft] = useState<ProfileDashboardUpdateRequest>(() => buildDashboardDraft(session));

  useEffect(() => {
    setProfileDraft(buildDashboardDraft(session));
  }, [session]);

  const profileDetailsChanged = (profileDraft.contact_name ?? '') !== (businessContact.contact_name ?? '')
    || (profileDraft.job_title ?? '') !== (businessContact.job_title ?? '')
    || (profileDraft.work_email ?? '') !== (businessContact.work_email ?? '')
    || (profileDraft.work_phone ?? '') !== (businessContact.work_phone ?? '')
    || (profileDraft.employer_address ?? '') !== (businessContact.employer_address ?? '')
    || (profileDraft.business_website_url ?? '') !== (businessContact.business_website_url ?? '')
    || (profileDraft.social_media_links_text ?? '') !== joinDraftEntries(businessContact.social_media_links)
    || (profileDraft.offer_entries_text ?? '') !== joinDraftEntries(businessContact.offer_entries)
    || (profileDraft.hours_of_operation_entries_text ?? '') !== joinDraftEntries(businessContact.hours_of_operation_entries)
    || (profileDraft.photo_references_text ?? '') !== joinDraftEntries(businessContact.photo_references)
    || (profileDraft.supporting_details ?? '') !== (businessContact.supporting_details ?? '');

  function buildSavePayload(): ProfileDashboardUpdateRequest {
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
      social_media_links_text: profileDraft.social_media_links_text ?? '',
      offer_entries_text: profileDraft.offer_entries_text ?? '',
      hours_of_operation_entries_text: profileDraft.hours_of_operation_entries_text ?? '',
      photo_references_text: profileDraft.photo_references_text ?? '',
      supporting_details: profileDraft.supporting_details ?? '',
    };
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
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back to Profile</Text>
          </Pressable>

          <View style={styles.dashboardShell}>
            <Text style={styles.detailCity}>Edit Business Profile</Text>
            <Text style={styles.detailTitle}>{approvedBusiness?.name ?? session.business_name ?? 'Business Profile'}</Text>
            {approvedBusiness?.address_line_1 ? <Text style={styles.detailMeta}>{approvedBusiness.address_line_1}</Text> : null}
            <Text style={styles.profileIntroText}>Update the public-facing details for your approved business profile. Address and phone stay synced from the business source listing when that source is available.</Text>

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
                <DashboardEditableField label="Work phone" onChangeText={(value) => setProfileDraft((current) => ({ ...current, work_phone: value }))} value={profileDraft.work_phone ?? ''} />
                <DashboardEditableField label="Employer address" onChangeText={(value) => setProfileDraft((current) => ({ ...current, employer_address: value }))} value={profileDraft.employer_address ?? ''} />
                <DashboardEditableField label="Business website" onChangeText={(value) => setProfileDraft((current) => ({ ...current, business_website_url: value }))} value={profileDraft.business_website_url ?? ''} />
              </View>
              <DashboardMultilineField label="Social media links" onChangeText={(value) => setProfileDraft((current) => ({ ...current, social_media_links_text: value }))} value={profileDraft.social_media_links_text ?? ''} />
              <DashboardMultilineField label="Deals and specials" onChangeText={(value) => setProfileDraft((current) => ({ ...current, offer_entries_text: value }))} value={profileDraft.offer_entries_text ?? ''} />
              <DashboardMultilineField label="Additional hours information" onChangeText={(value) => setProfileDraft((current) => ({ ...current, hours_of_operation_entries_text: value }))} value={profileDraft.hours_of_operation_entries_text ?? ''} />
              <DashboardMultilineField label="Photo references" onChangeText={(value) => setProfileDraft((current) => ({ ...current, photo_references_text: value }))} value={profileDraft.photo_references_text ?? ''} />
              <DashboardMultilineField label="Business details" onChangeText={(value) => setProfileDraft((current) => ({ ...current, supporting_details: value }))} value={profileDraft.supporting_details ?? ''} />
              <View style={styles.dashboardInlineActions}>
                <Pressable
                  onPress={() => onSaveProfileDetails(buildSavePayload())}
                  style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton, (!profileDetailsChanged || submitting) ? styles.linkButtonDisabled : null]}
                >
                  <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Saving...' : 'Save Business Profile'}</Text>
                </Pressable>
                <Pressable onPress={onViewInMap} style={[styles.linkButtonSecondaryWide, styles.dashboardInlineButton]}>
                  <Text style={styles.linkButtonSecondaryText}>View in Map</Text>
                </Pressable>
              </View>
              <Text style={styles.dashboardSupportText}>Use one line per social link, deal, hour range, or photo reference to keep the public business profile current.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AccountSettingsScreen({
  errorMessage,
  isLandscape,
  message,
  onBack,
  onBeginTwoFactorSetup,
  onChangeTwoFactorDisableCode,
  onChangeTwoFactorSetupCode,
  onConfirmTwoFactorSetup,
  onDisableTwoFactor,
  onLogout,
  onToggleBusinessLocationTracking,
  onOpenContactSupport,
  onOpenDeleteAccountRequest,
  onOpenDisableAccountRequest,
  onOpenPrivacyPolicy,
  onOpenTermsOfService,
  session,
  submitting,
  twoFactorDisableCode,
  twoFactorSetup,
  twoFactorSetupCode,
}: AccountSettingsScreenProps) {
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
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back to Dashboard</Text>
          </Pressable>

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
              session={session}
              submitting={submitting}
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
                      <Text style={styles.dashboardSupportText}>{session.business_location_tracking_enabled ? 'On' : 'Off'}</Text>
                    </View>
                    <Switch
                      disabled={submitting}
                      onValueChange={onToggleBusinessLocationTracking}
                      value={!!session.business_location_tracking_enabled}
                    />
                  </View>
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
                <Text style={styles.dashboardSupportText}>Disable and delete requests are currently handled by support so they can verify the account owner before acting.</Text>
              </View>
              <View style={styles.settingsItemActions}>
                <Pressable onPress={onOpenDisableAccountRequest} style={[styles.linkButtonSecondaryWide, styles.settingsInlineButton]}>
                  <Text style={styles.linkButtonSecondaryText}>Disable account</Text>
                </Pressable>
                <Pressable onPress={onOpenDeleteAccountRequest} style={[styles.destructiveButton, styles.settingsInlineButton]}>
                  <Text style={styles.destructiveButtonText}>Delete account</Text>
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
