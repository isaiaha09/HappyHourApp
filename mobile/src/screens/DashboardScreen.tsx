import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { styles } from '../appStyles';
import type { SignupResponse, TwoFactorSetupResponse } from '../types';

export type DashboardScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  loading: boolean;
  message: string | null;
  onBack: () => void;
  onOpenBilling: () => void;
  onOpenPlaces: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onResendVerification: () => void;
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
    <View style={styles.dashboardDetailRow}>
      <Text style={styles.dashboardDetailLabel}>{label}</Text>
      <Text style={styles.dashboardDetailValue}>{value}</Text>
    </View>
  );
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
    <View style={styles.dashboardSectionCard}>
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

export function DashboardScreen({ errorMessage, isLandscape, loading, message, onBack, onOpenBilling, onOpenPlaces, onOpenSettings, onRefresh, onResendVerification, session, submitting }: DashboardScreenProps) {
  const approvedBusinesses = session.approved_businesses ?? [];
  const businessContact = session.business_contact ?? {};
  const fullName = [session.first_name, session.last_name].filter(Boolean).join(' ');

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

          <View style={styles.dashboardCard}>
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
              <View style={styles.dashboardCalloutCard}>
                <Text style={styles.dashboardSectionTitle}>Email verification</Text>
                <Text style={styles.dashboardSupportText}>Your email is not verified yet. Use the link sent to {session.email}, then refresh this dashboard.</Text>
                <Pressable onPress={onResendVerification} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
                  <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Sending...' : 'Resend verification email'}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.dashboardVerifiedCard}>
                <Text style={styles.dashboardVerifiedTitle}>Email verified</Text>
                <Text style={styles.dashboardVerifiedText}>Your account is verified and ready to use across the app.</Text>
              </View>
            )}

            <View style={styles.dashboardSectionCard}>
              <Text style={styles.dashboardSectionTitle}>Profile details</Text>
              <DashboardDetailRow label="Username" value={session.username} />
              <DashboardDetailRow label="Email" value={session.email} />
              <DashboardDetailRow label="First name" value={session.first_name || 'Not provided'} />
              <DashboardDetailRow label="Last name" value={session.last_name || 'Not provided'} />
              <DashboardDetailRow label="Profile type" value={session.profile_type === 'business' ? 'Business' : 'Customer'} />
            </View>

            <Text style={styles.dashboardSupportText}>Authentication settings, support, privacy, terms, account requests, and logout now live behind the settings icon in the top-right corner.</Text>

            {session.profile_type === 'business' ? (
              <>
                <View style={styles.dashboardSectionCard}>
                  <Text style={styles.dashboardSectionTitle}>Business status</Text>
                  <DashboardDetailRow label="Status" value={session.business_status || 'Pending'} />
                  <DashboardDetailRow label="Current business" value={session.business_name || 'No approved business yet'} />
                  {session.claim_status ? <DashboardDetailRow label="Claim review" value={session.claim_status} /> : null}
                </View>

                {Object.values(businessContact).some(Boolean) ? (
                  <View style={styles.dashboardSectionCard}>
                    <Text style={styles.dashboardSectionTitle}>Business contact details</Text>
                    <DashboardDetailRow label="Contact name" value={businessContact.contact_name || 'Not provided'} />
                    <DashboardDetailRow label="Job title" value={businessContact.job_title || 'Not provided'} />
                    <DashboardDetailRow label="Work email" value={businessContact.work_email || 'Not provided'} />
                    <DashboardDetailRow label="Work phone" value={businessContact.work_phone || 'Not provided'} />
                    <DashboardDetailRow label="Employer address" value={businessContact.employer_address || 'Not provided'} />
                  </View>
                ) : null}

                <View style={styles.dashboardSectionCard}>
                  <Text style={styles.dashboardSectionTitle}>Approved businesses</Text>
                  {approvedBusinesses.length ? approvedBusinesses.map((business) => (
                    <View key={business.id} style={styles.claimResultCard}>
                      <Text style={styles.placeTitle}>{business.name}</Text>
                      <Text style={styles.placeMeta}>{business.city_label} • {business.venue_type_label}</Text>
                    </View>
                  )) : (
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

            <Pressable onPress={onOpenPlaces} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Open main app features</Text>
            </Pressable>

            <View style={styles.dashboardFooterRow}>
              <Pressable onPress={onRefresh} style={styles.secondaryToolbarButton}>
                <Text style={styles.secondaryToolbarButtonText}>Refresh dashboard</Text>
              </Pressable>
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
            <Text style={styles.backButtonText}>Back to dashboard</Text>
          </Pressable>

          <View style={styles.dashboardCard}>
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

            <View style={styles.dashboardSectionCard}>
              <Text style={styles.dashboardSectionTitle}>Support</Text>
              <Text style={styles.dashboardSupportText}>Open the dedicated support screen for account help, billing questions, business onboarding, or general issues.</Text>
              <Pressable onPress={onOpenContactSupport} style={styles.linkButtonSecondaryWide}>
                <Text style={styles.linkButtonSecondaryText}>Contact support</Text>
              </Pressable>
            </View>

            <View style={styles.dashboardSectionCard}>
              <Text style={styles.dashboardSectionTitle}>Legal</Text>
              <Text style={styles.dashboardSupportText}>Review the current privacy policy and terms of service inside the app.</Text>
              <Pressable onPress={onOpenPrivacyPolicy} style={styles.linkButtonSecondaryWide}>
                <Text style={styles.linkButtonSecondaryText}>Privacy Policy</Text>
              </Pressable>
              <Pressable onPress={onOpenTermsOfService} style={styles.linkButtonSecondaryWide}>
                <Text style={styles.linkButtonSecondaryText}>Terms of Service & Agreements</Text>
              </Pressable>
            </View>

            <View style={styles.dashboardSectionCard}>
              <Text style={styles.dashboardSectionTitle}>Account management</Text>
              <Text style={styles.dashboardSupportText}>Disable and delete requests are currently handled by support so they can verify the account owner before acting.</Text>
              <Pressable onPress={onOpenDisableAccountRequest} style={styles.linkButtonSecondaryWide}>
                <Text style={styles.linkButtonSecondaryText}>Disable account</Text>
              </Pressable>
              <Pressable onPress={onOpenDeleteAccountRequest} style={styles.destructiveButton}>
                <Text style={styles.destructiveButtonText}>Delete account</Text>
              </Pressable>
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
