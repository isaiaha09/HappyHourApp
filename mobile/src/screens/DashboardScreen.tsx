import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { styles } from '../appStyles';
import type { SignupResponse } from '../types';

export type DashboardScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  loading: boolean;
  message: string | null;
  onBack: () => void;
  onLogout: () => void;
  onOpenBilling: () => void;
  onOpenPlaces: () => void;
  onRefresh: () => void;
  onResendVerification: () => void;
  onToggleTwoFactor: () => void;
  session: SignupResponse;
  submitting: boolean;
};

function DashboardDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dashboardDetailRow}>
      <Text style={styles.dashboardDetailLabel}>{label}</Text>
      <Text style={styles.dashboardDetailValue}>{value}</Text>
    </View>
  );
}

export function DashboardScreen({ errorMessage, isLandscape, loading, message, onBack, onLogout, onOpenBilling, onOpenPlaces, onRefresh, onResendVerification, onToggleTwoFactor, session, submitting }: DashboardScreenProps) {
  const approvedBusinesses = session.approved_businesses ?? [];
  const businessContact = session.business_contact ?? {};
  const fullName = [session.first_name, session.last_name].filter(Boolean).join(' ');

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <ScrollView contentContainerStyle={styles.dashboardScrollContent} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to places</Text>
        </Pressable>

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

          <View style={styles.dashboardSectionCard}>
            <Text style={styles.dashboardSectionTitle}>Security</Text>
            <DashboardDetailRow label="Two-factor authentication" value={session.two_factor_enabled ? 'Enabled' : 'Disabled'} />
            <Text style={styles.dashboardSupportText}>Enable this preference now. Sign-in challenge enforcement can be expanded next.</Text>
            <Pressable onPress={onToggleTwoFactor} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Saving...' : session.two_factor_enabled ? 'Disable 2FA' : 'Enable 2FA'}</Text>
            </Pressable>
          </View>

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
            <Pressable onPress={onLogout} style={styles.secondaryToolbarButton}>
              <Text style={styles.secondaryToolbarButtonText}>Log out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
