import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Linking } from 'react-native';

import { styles } from '../appStyles';
import type { AuthPortal, LoginFormState, ProfileFormState } from '../appFlowTypes';
import { AccountSection } from '../components/AccountSection';
import { AutoScrollTextInput, useAutoScrollForm } from '../components/AutoScrollTextInput';
import { BusinessDealsEditor, BusinessHoursEditor } from '../components/BusinessProfileStructuredEditors';
import { ReadOnlyPdfPreviewModal } from '../components/ReadOnlyPdfPreviewModal';
import { NativeIOSLiquidGlassBackButton, isNativeIOSLiquidGlassHeaderButtonAvailable } from '../components/NativeIOSLiquidGlass';
import { manualBusinessCityOptions, manualBusinessVenueOptions } from '../browseConfig';
import { dedupeImageUrls, formatPlaceAddress, getPlaceLocations, normalizeSearchText } from '../placeHelpers';
import { SOCIAL_PLATFORM_LABELS, getSocialProfilePreview, getSocialProfileValidationMessage } from '../socialProfiles';
import { theme } from '../styles/theme';
import type { BusinessAttachmentBuckets, BusinessAttachmentDraft, BusinessAttachmentKind, EmailVerificationChallengeResponse, PlaceListItem, PlaceLocation, SignupResponse } from '../types';
import { LEGAL_EFFECTIVE_DATE, privacyPolicySections, termsOfServiceSections } from '../legalContent';

const SUPPORT_EMAIL = 'support@diningdealz.com';
const PRIVACY_POLICY_URL = 'https://www.diningdealz.com/privacy';
const TERMS_OF_SERVICE_URL = 'https://www.diningdealz.com/terms';
const onboardingPlaceholderTextColor = theme.textDarkMuted;
const dismissKeyboardOnScrollProps = {
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
  onScrollBeginDrag: Keyboard.dismiss,
  onTouchStart: Keyboard.dismiss,
} as const;

function OnboardingBackButton({ flow = false, label, onPress, style }: { flow?: boolean; label: string; onPress: () => void; style?: any }) {
  const resolvedStyle = isNativeIOSLiquidGlassHeaderButtonAvailable()
    ? [styles.onboardingNativeBackButton, style]
    : [flow ? styles.accountBackButton : styles.onboardingBackButton, style];

  return (
    <NativeIOSLiquidGlassBackButton
      label={label}
      onPress={onPress}
      style={resolvedStyle}
      textStyle={flow ? styles.accountBackButtonText : styles.onboardingBackButtonText}
      themeVariant="default-dark"
    />
  );
}

function PublicLegalLinks() {
  return (
    <View style={styles.publicLegalLinks}>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} style={styles.publicLegalLinkButton}>
        <Text style={styles.publicLegalLinkText}>Privacy Policy</Text>
      </Pressable>
      <Text style={styles.publicLegalSeparator}>•</Text>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)} style={styles.publicLegalLinkButton}>
        <Text style={styles.publicLegalLinkText}>Terms of Service</Text>
      </Pressable>
    </View>
  );
}

type CompactDropdownProps = {
  onSelect: (value: string) => void;
  open: boolean;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
  selectedValue: string;
  onToggle: () => void;
};

type AttachmentPreviewState =
  | { kind: 'image'; name: string; uri: string };

function LoadingButtonLabel({ color, label, loading, textStyle }: { color: string; label: string; loading: boolean; textStyle: any }) {
  return (
    <View style={styles.loadingButtonContent}>
      {loading ? <ActivityIndicator color={color} size="small" /> : null}
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}

const businessSocialFieldDefinitions: Array<{
  field: keyof ProfileFormState;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube';
  placeholder: string;
}> = [
  { field: 'instagram_profile', platform: 'instagram', placeholder: 'instagram.com/yourbusiness or yourbusiness' },
  { field: 'facebook_profile', platform: 'facebook', placeholder: 'facebook.com/yourbusiness or yourbusiness' },
  { field: 'tiktok_profile', platform: 'tiktok', placeholder: 'tiktok.com/@yourbusiness or @yourbusiness' },
  { field: 'youtube_profile', platform: 'youtube', placeholder: 'youtube.com/@yourbusiness or @yourbusiness' },
];

function getAttachmentPreviewKind(mimeType: string | null, fileName: string) {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  const normalizedFileName = String(fileName || '').trim().toLowerCase();

  if (normalizedMimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(normalizedFileName)) {
    return 'image' as const;
  }
  if (normalizedMimeType === 'application/pdf' || normalizedFileName.endsWith('.pdf')) {
    return 'pdf' as const;
  }
  return null;
}

export type AuthPortalScreenProps = {
  authMessage: string | null;
  autoFocusIdentifier: boolean;
  errorMessage: string | null;
  loginForm: LoginFormState;
  loginPortal: AuthPortal;
  onBackToLanding: () => void;
  onChangeField: (field: keyof LoginFormState, value: string) => void;
  onForgotPassword: (identifier: string) => void;
  onForgotUsername: (email: string) => void;
  onSubmit: () => void;
  showTwoFactorCodeField: boolean;
  submitting: boolean;
};

type AuthRecoveryMode = 'username' | 'password' | null;

export type ForgotUsernameScreenProps = {
  email: string;
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onChangeEmail: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
};

export type ForgotPasswordScreenProps = {
  confirmPassword: string;
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  newPassword: string;
  onBack: () => void;
  onChangeConfirmPassword: (value: string) => void;
  onChangeNewPassword: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
};

export type CreateProfileScreenProps = {
  errorMessage: string | null;
  form: ProfileFormState;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onChangeField: (field: keyof ProfileFormState, value: ProfileFormState[keyof ProfileFormState]) => void;
  onOpenBusinessClaim: () => void;
  onSubmit: () => void;
  submitting: boolean;
};

export type BusinessSearchScreenProps = {
	errorMessage: string | null;
	isLandscape: boolean;
	loadingPlaces: boolean;
	message?: string | null;
	onBack: () => void;
  onChangeSearchQuery: (value: string) => void;
	onChooseInformalBusiness: () => void;
	onChooseManualBusiness: () => void;
	onRetryRejectedClaim?: () => void;
  onSelectBusiness: (place: PlaceListItem, locationId: number) => void;
  results: PlaceListItem[];
  searchQuery: string;
};

export type BusinessVerificationScreenProps = {
  attachments: BusinessAttachmentBuckets;
  errorMessage: string | null;
  form: ProfileFormState;
  isLandscape: boolean;
  lockAccountIdentityFields?: boolean;
  mode: 'claimed' | 'manual' | 'informal';
  onAddAttachments: (kind: BusinessAttachmentKind) => void;
  onAddPhotoUploads: () => void;
  onBack: () => void;
  onChangeField: (field: keyof ProfileFormState, value: ProfileFormState[keyof ProfileFormState]) => void;
  onRemoveCurrentPhoto: (photoUrl: string) => void;
  onRemoveAttachment: (kind: BusinessAttachmentKind, attachmentId: string) => void;
  onRemovePhotoUpload: (attachmentId: string) => void;
	onRetryRejectedClaim?: () => void;
  onToggleAddressNotApplicable: (value: boolean) => void;
  onSubmit: () => void;
  photoUploads: BusinessAttachmentDraft[];
  selectedLocation: PlaceLocation | null;
  selectedPlace: PlaceListItem | null;
  submitting: boolean;
};

function formatAttachmentSize(size: number | null) {
  if (!size || size <= 0) {
    return 'Ready to upload';
  }

  if (size >= 1024 * 1024) {
    return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export type EmailVerificationScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onChangeCode: (value: string) => void;
  onResend: () => void;
  onSubmit: () => void;
  pendingVerification: EmailVerificationChallengeResponse | null;
  submitting: boolean;
  verificationCode: string;
};

export type BusinessClaimReviewPendingScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  session: SignupResponse | null;
};

export type BusinessClaimRetryScreenProps = {
  codeRequested: boolean;
  errorMessage: string | null;
  email: string;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onChangeCode: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onRequestCode: () => void;
  onVerifyCode: () => void;
  submitting: boolean;
  verificationCode: string;
};

export type ContactSupportScreenProps = {
  errorMessage: string | null;
  initialMessage?: string;
  initialSubject?: string;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onSubmit: (subject: string, message: string) => void;
  session: SignupResponse;
  submitting: boolean;
};

type LegalDocumentScreenProps = {
  eyebrow: string;
  intro: string;
  isLandscape: boolean;
  onBack: () => void;
  sections: ReadonlyArray<{ title: string; body: string }>;
  title: string;
};

function KeyboardAwareFormScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoidingFill}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

type SubmitErrorAutoScrollController = {
  recordSubmitAttempt: () => void;
  recordSubmitValidationError: () => void;
};

function useSubmitErrorAutoScroll(
  errorMessage: string | null,
  submitting: boolean,
  scrollToTop: () => void,
): SubmitErrorAutoScrollController {
  const [submitAttempt, setSubmitAttempt] = useState(0);
  const submitAttemptRef = useRef(0);
  const handledSubmitAttemptRef = useRef(0);

  const recordSubmitAttempt = useCallback(() => {
    const nextAttempt = submitAttemptRef.current + 1;
    submitAttemptRef.current = nextAttempt;
    setSubmitAttempt(nextAttempt);
  }, []);

  const recordSubmitValidationError = useCallback(() => {
    const nextAttempt = submitAttemptRef.current + 1;
    submitAttemptRef.current = nextAttempt;
    handledSubmitAttemptRef.current = nextAttempt;
    setSubmitAttempt(nextAttempt);
    scrollToTop();
  }, [scrollToTop]);

  useEffect(() => {
    if (
      !errorMessage
      || submitting
      || submitAttempt === 0
      || handledSubmitAttemptRef.current === submitAttempt
    ) {
      return;
    }

    handledSubmitAttemptRef.current = submitAttempt;
    scrollToTop();
  }, [errorMessage, scrollToTop, submitting, submitAttempt]);

  return {
    recordSubmitAttempt,
    recordSubmitValidationError,
  };
}

type PasswordFieldProps = {
  inputStyle?: any;
  onBeforeAutoScroll?: (target?: number | null) => void;
  onFieldBlur?: (target?: number | null) => void;
  onChangeText: (value: string) => void;
  scrollViewRef: RefObject<ScrollView | null>;
  value: string;
};

function PasswordToggleIcon({ isVisible }: { isVisible: boolean }) {
  return (
    <View style={styles.passwordEyeIcon}>
      <View style={styles.passwordEyeOutline}>
        <View style={styles.passwordEyePupil} />
      </View>
      {isVisible ? <View style={styles.passwordEyeSlash} /> : null}
    </View>
  );
}

function PasswordField({ inputStyle, onBeforeAutoScroll, onFieldBlur, onChangeText, scrollViewRef, value }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={styles.passwordFieldRow}>
      <AutoScrollTextInput
        onBeforeAutoScroll={onBeforeAutoScroll}
        onFieldBlur={onFieldBlur}
        onChangeText={onChangeText}
        scrollViewRef={scrollViewRef}
        secureTextEntry={!isVisible}
        style={[styles.profileInput, styles.passwordFieldInput, inputStyle]}
        value={value}
      />
      <Pressable
        accessibilityLabel={isVisible ? 'Hide password' : 'Show password'}
        onPress={() => setIsVisible((current) => !current)}
        style={styles.passwordToggleButton}
      >
        <PasswordToggleIcon isVisible={isVisible} />
      </Pressable>
    </View>
  );
}

function CompactDropdown({ onSelect, open, options, placeholder, selectedValue, onToggle }: CompactDropdownProps) {
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? placeholder;

  function animateDropdownLayout() {
    LayoutAnimation.configureNext({
      duration: 180,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  }

  function handleToggle() {
    animateDropdownLayout();
    onToggle();
  }

  function handleSelect(value: string) {
    animateDropdownLayout();
    onSelect(value);
  }

  return (
    <View style={styles.compactDropdownWrap}>
      <Pressable onPress={handleToggle} style={[styles.compactDropdownButton, styles.accountInput, open ? styles.compactDropdownButtonOpen : null]}>
        <Text style={[styles.compactDropdownText, selectedValue.length === 0 ? styles.compactDropdownPlaceholder : null]}>{selectedLabel}</Text>
        <Text style={styles.compactDropdownCaret}>{open ? '^' : 'v'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.compactDropdownMenu}>
          {options.map((option) => {
            const isSelected = option.value === selectedValue;

            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelect(option.value)}
                style={[styles.compactDropdownOption, isSelected ? styles.compactDropdownOptionSelected : null]}
              >
                <Text style={[styles.compactDropdownOptionText, isSelected ? styles.compactDropdownOptionTextSelected : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function AuthPortalScreen({ authMessage, autoFocusIdentifier, errorMessage, loginForm, loginPortal, onBackToLanding, onChangeField, onForgotPassword, onForgotUsername, onSubmit, showTwoFactorCodeField, submitting }: AuthPortalScreenProps) {
  const { handleFieldBlur, handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const [recoveryMode, setRecoveryMode] = useState<AuthRecoveryMode>(null);
  const [recoveryValue, setRecoveryValue] = useState('');
  const recoveryFade = useRef(new Animated.Value(0)).current;
  const recoveryTranslateY = useRef(new Animated.Value(-14)).current;
  const { recordSubmitAttempt } = useSubmitErrorAutoScroll(errorMessage, submitting, scrollToTop);

  function animateRecoveryPanel(toOpacity: number, toTranslateY: number, onComplete?: () => void) {
    recoveryFade.stopAnimation();
    recoveryTranslateY.stopAnimation();
    Animated.parallel([
      Animated.timing(recoveryFade, {
        duration: 180,
        toValue: toOpacity,
        useNativeDriver: true,
      }),
      Animated.timing(recoveryTranslateY, {
        duration: 180,
        toValue: toTranslateY,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onComplete?.();
      }
    });
  }

  function handleOpenRecovery(mode: Exclude<AuthRecoveryMode, null>) {
    setRecoveryValue(loginForm.identifier.trim());

    if (recoveryMode === null) {
      recoveryFade.setValue(0);
      recoveryTranslateY.setValue(-14);
      setRecoveryMode(mode);
      requestAnimationFrame(() => {
        animateRecoveryPanel(1, 0);
      });
      return;
    }

    setRecoveryMode(mode);
    animateRecoveryPanel(1, 0);
  }

  function handleCloseRecovery() {
    animateRecoveryPanel(0, -14, () => {
      setRecoveryMode(null);
      setRecoveryValue('');
    });
  }

  function handleSubmitRecovery() {
    recordSubmitAttempt();
    if (recoveryMode === 'username') {
      onForgotUsername(recoveryValue);
      return;
    }

    if (recoveryMode === 'password') {
      onForgotPassword(recoveryValue);
    }
  }

  function handleSubmitAuth() {
    recordSubmitAttempt();
    void onSubmit();
  }

  return (
    <View style={styles.authScreen}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.authScrollContent, styles.accountScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back" onPress={onBackToLanding} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>{loginPortal === 'customer' ? 'Customer Login' : 'Business Login'}</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>Welcome back</Text>
              <Text style={[styles.profileIntroText, styles.accountBodyText]}>Enter your username and password to continue.</Text>
            </View>

            {authMessage ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{authMessage}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <AccountSection title="Account credentials">
              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Username</Text>
              <AutoScrollTextInput autoCapitalize="none" autoFocus={autoFocusIdentifier} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('identifier', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={loginForm.identifier} />

              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Password</Text>
              <PasswordField inputStyle={styles.accountInput} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={loginForm.password} />

              {showTwoFactorCodeField ? (
                <>
                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Authenticator Code</Text>
                  <AutoScrollTextInput
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    onBeforeAutoScroll={handleFieldFocus}
                    onFieldBlur={handleFieldBlur}
                    onChangeText={(value) => onChangeField('two_factor_code', value)}
                    scrollViewRef={scrollViewRef}
                    style={[styles.profileInput, styles.accountInput]}
                    value={loginForm.two_factor_code}
                  />
                  <Text style={[styles.profileSupportText, styles.accountBodyText]}>Enter the 6-digit code from your authenticator app to finish signing in.</Text>
                </>
              ) : null}
            </AccountSection>

            <Pressable disabled={submitting} onPress={handleSubmitAuth} style={[styles.linkButton, styles.accountPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel
                color={theme.textDark}
                label={loginPortal === 'customer' ? 'Log in as Customer' : 'Log in as Business'}
                loading={submitting}
                textStyle={[styles.linkButtonText, styles.accountPrimaryButtonText]}
              />
            </Pressable>

            <View style={styles.authRecoveryRow}>
              <Pressable onPress={() => handleOpenRecovery('username')} style={[styles.authRecoveryButton, submitting ? styles.linkButtonDisabled : null]}>
                <Text style={styles.authRecoveryButtonText}>Forgot username?</Text>
              </Pressable>
              <Pressable onPress={() => handleOpenRecovery('password')} style={[styles.authRecoveryButton, submitting ? styles.linkButtonDisabled : null]}>
                <Text style={styles.authRecoveryButtonText}>Forgot password?</Text>
              </Pressable>
            </View>

            {recoveryMode ? (
              <Animated.View
                style={[
                  styles.authRecoveryPanel,
                  styles.accountInfoCard,
                  {
                    opacity: recoveryFade,
                    transform: [{ translateY: recoveryTranslateY }],
                  },
                ]}
              >
                <Text accessibilityRole="header" style={styles.accountSectionTitle}>{recoveryMode === 'username' ? 'Recover your username' : 'Reset your password'}</Text>
                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>{recoveryMode === 'username' ? 'Account email' : 'Username or email'}</Text>
                <AutoScrollTextInput
                  autoCapitalize="none"
                  autoFocus
                  keyboardType={recoveryMode === 'username' ? 'email-address' : 'default'}
                  onBeforeAutoScroll={handleFieldFocus}
                  onFieldBlur={handleFieldBlur}
                  onChangeText={setRecoveryValue}
                  placeholder={recoveryMode === 'username' ? 'Enter your account email' : 'Enter your username or email'}
                  placeholderTextColor={theme.textMuted}
                  scrollViewRef={scrollViewRef}
                  style={[styles.profileInput, styles.accountInput]}
                  value={recoveryValue}
                />
                <Text style={[styles.profileSupportText, styles.accountBodyText]}>
                  {recoveryMode === 'username'
                    ? 'We will email the username tied to this account.'
                    : 'We will send a password reset link if that account exists.'}
                </Text>
                <View style={styles.authRecoveryPanelActions}>
                  <Pressable onPress={handleSubmitRecovery} style={[styles.linkButtonSecondaryWide, styles.accountSecondaryButton, submitting ? styles.linkButtonDisabled : null]}>
                    <LoadingButtonLabel
                      color={theme.textPrimary}
                      label={recoveryMode === 'username' ? 'Email my username' : 'Send password reset link'}
                      loading={submitting}
                      textStyle={[styles.linkButtonSecondaryText, styles.accountSecondaryButtonText]}
                    />
                  </Pressable>
                  <Pressable onPress={handleCloseRecovery} style={styles.authRecoveryDismissButton}>
                    <Text style={styles.authRecoveryDismissText}>Cancel</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            <PublicLegalLinks />
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function ForgotUsernameScreen({ email, errorMessage, isLandscape, message, onBack, onChangeEmail, onSubmit, submitting }: ForgotUsernameScreenProps) {
  const { handleFieldBlur, handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const { recordSubmitAttempt } = useSubmitErrorAutoScroll(errorMessage, submitting, scrollToTop);

  function handleSubmitForgotUsername() {
    recordSubmitAttempt();
    void onSubmit();
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.authScrollContent, styles.accountScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back to sign in" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>Forgot username</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>Find your username</Text>
              <Text style={[styles.profileIntroText, styles.accountBodyText]}>Enter the email address on your DiningDealz account and we will send your username again.</Text>
            </View>

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

            <AccountSection title="Account recovery">
              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Account email</Text>
              <AutoScrollTextInput
                autoCapitalize="none"
                autoFocus
                keyboardType="email-address"
                onBeforeAutoScroll={handleFieldFocus}
                onFieldBlur={handleFieldBlur}
                onChangeText={onChangeEmail}
                placeholder="Enter your account email"
                placeholderTextColor={theme.textMuted}
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.accountInput]}
                value={email}
              />
            </AccountSection>

            <Pressable disabled={submitting} onPress={handleSubmitForgotUsername} style={[styles.linkButton, styles.accountPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel
                color={theme.textDark}
                label="Email my username"
                loading={submitting}
                textStyle={[styles.linkButtonText, styles.accountPrimaryButtonText]}
              />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function ForgotPasswordScreen({ confirmPassword, errorMessage, isLandscape, message, newPassword, onBack, onChangeConfirmPassword, onChangeNewPassword, onSubmit, submitting }: ForgotPasswordScreenProps) {
  const { handleFieldBlur, handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const { recordSubmitAttempt } = useSubmitErrorAutoScroll(errorMessage, submitting, scrollToTop);

  function handleSubmitForgotPassword() {
    recordSubmitAttempt();
    void onSubmit();
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.authScrollContent, styles.accountScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back to sign in" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>Forgot password</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>Choose a new password</Text>
              <Text style={[styles.profileIntroText, styles.accountBodyText]}>Create a new password for your DiningDealz account, then return to sign in.</Text>
            </View>

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

            <AccountSection title="Password details">
              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>New password</Text>
              <PasswordField inputStyle={styles.accountInput} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={onChangeNewPassword} scrollViewRef={scrollViewRef} value={newPassword} />

              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Confirm new password</Text>
              <PasswordField inputStyle={styles.accountInput} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={onChangeConfirmPassword} scrollViewRef={scrollViewRef} value={confirmPassword} />
            </AccountSection>

            <Pressable disabled={submitting} onPress={handleSubmitForgotPassword} style={[styles.linkButton, styles.accountPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel
                color={theme.textDark}
                label="Update password"
                loading={submitting}
                textStyle={[styles.linkButtonText, styles.accountPrimaryButtonText]}
              />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function CreateProfileScreen({ errorMessage, form, isLandscape, message, onBack, onChangeField, onOpenBusinessClaim, onSubmit, submitting }: CreateProfileScreenProps) {
  const { handleFieldBlur, handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const { recordSubmitAttempt } = useSubmitErrorAutoScroll(errorMessage, submitting, scrollToTop);

  function handleSubmitCreateProfile() {
    recordSubmitAttempt();
    void onSubmit();
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent, styles.accountScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>Create Profile</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>Create a customer account</Text>
              <Text style={[styles.profileIntroText, styles.accountBodyText]}>Create a Free Customer Account and receive notifications about new offers, updates, and happy hour deals from your favorite businesses!</Text>
            </View>

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

            <AccountSection title="Account details">
              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Username</Text>
              <AutoScrollTextInput autoCapitalize="none" onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('username', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.username} />

              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Email</Text>
              <AutoScrollTextInput autoCapitalize="none" keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('email', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.email} />

              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Confirm email</Text>
              <AutoScrollTextInput autoCapitalize="none" keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('confirm_email', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.confirm_email} />

              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Password</Text>
              <PasswordField inputStyle={styles.accountInput} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={form.password} />

              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Confirm password</Text>
              <PasswordField inputStyle={styles.accountInput} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('confirm_password', value)} scrollViewRef={scrollViewRef} value={form.confirm_password} />
            </AccountSection>

            <AccountSection title="Your name">
              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>First name</Text>
              <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('first_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.first_name} />

              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Last name</Text>
              <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('last_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.last_name} />
            </AccountSection>

            <View style={[styles.privacyNoticeCard, styles.accountInfoCard, styles.accountNotice]}>
              <Text style={[styles.privacyNoticeTitle, styles.accountInfoTitle]}>Account and privacy notice</Text>
              <Text style={[styles.privacyNoticeText, styles.accountInfoText]}>We use your account details to create and secure your profile and to provide the features you request. Optional notifications and location access can be controlled in your device settings. The Service is not directed to children under 13. Do not submit passwords or unnecessary sensitive information.</Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.terms_accepted }}
                onPress={() => onChangeField('terms_accepted', !form.terms_accepted)}
                style={styles.privacyConsentButton}
              >
                <View style={[styles.privacyConsentIndicator, form.terms_accepted ? styles.privacyConsentIndicatorActive : null]}>
                  {form.terms_accepted ? <Text style={styles.privacyConsentIndicatorText}>X</Text> : null}
                </View>
                <Text style={[styles.privacyConsentText, styles.accountInfoText]}>
                  I am at least 13 years old, agree to the{' '}
                  <Text accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)} style={styles.privacyNoticeLink}>Terms of Service</Text>
                  {' '}and acknowledge the{' '}
                  <Text accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} style={styles.privacyNoticeLink}>Privacy Policy</Text>.
                </Text>
              </Pressable>
            </View>

            <Pressable onPress={handleSubmitCreateProfile} style={[styles.linkButton, styles.accountPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel color={theme.textDark} label="Create customer profile" loading={submitting} textStyle={[styles.linkButtonText, styles.accountPrimaryButtonText]} />
            </Pressable>

            <Pressable onPress={onOpenBusinessClaim} style={[styles.linkButtonSecondaryWide, styles.accountSecondaryButton]}>
              <Text style={[styles.linkButtonSecondaryText, styles.accountSecondaryButtonText]}>Claim a Business</Text>
            </Pressable>

            <PublicLegalLinks />
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

function formatVerificationCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function EmailVerificationScreen({ errorMessage, isLandscape, message, onBack, onChangeCode, onResend, onSubmit, pendingVerification, submitting, verificationCode }: EmailVerificationScreenProps) {
  const { handleFieldBlur, handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const { recordSubmitAttempt } = useSubmitErrorAutoScroll(errorMessage, submitting, scrollToTop);

  useEffect(() => {
    const verificationExpiresAt = pendingVerification?.verification_code_expires_at ?? '';
    if (!verificationExpiresAt) {
      setSecondsRemaining(0);
      return;
    }

    function updateRemainingTime() {
      const expiresAt = new Date(verificationExpiresAt).getTime();
      if (Number.isNaN(expiresAt)) {
        setSecondsRemaining(0);
        return;
      }

      setSecondsRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    }

    updateRemainingTime();
    const timer = setInterval(updateRemainingTime, 250);
    return () => clearInterval(timer);
  }, [pendingVerification?.verification_code_expires_at]);

  function handleSubmitVerificationCode() {
    recordSubmitAttempt();
    void onSubmit();
  }

  function handleResendVerificationCode() {
    recordSubmitAttempt();
    void onResend();
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent, styles.accountScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back to login" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>Email Verification</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>Enter your 6-digit code</Text>
              <Text style={[styles.profileIntroText, styles.accountBodyText]}>
                {pendingVerification?.email
                  ? `We sent a code to ${pendingVerification.email}. Enter it before it expires to unlock your dashboard.`
                  : 'We sent a code to your email. Enter it before it expires to unlock your dashboard.'}
              </Text>
            </View>

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

            <AccountSection title="Email confirmation">
              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Verification code</Text>
              <AutoScrollTextInput
                autoCapitalize="none"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                onBeforeAutoScroll={handleFieldFocus}
                onFieldBlur={handleFieldBlur}
                onChangeText={(value) => onChangeCode(value.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                placeholderTextColor={theme.textMuted}
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.verificationCodeInput, styles.accountInput]}
                textContentType="oneTimeCode"
                value={verificationCode}
              />

              {secondsRemaining > 0 ? (
                <Text style={styles.verificationCountdownText}>
                  Code expires in {formatVerificationCountdown(secondsRemaining)}
                </Text>
              ) : (
                <Text style={[styles.profileSupportText, styles.accountBodyText]}>Your last code expired. Request a new one to continue.</Text>
              )}

              <Text style={[styles.profileSupportText, styles.accountBodyText]}>
                Username: {pendingVerification?.username ?? 'Unavailable'}
              </Text>
            </AccountSection>

            <Pressable onPress={handleSubmitVerificationCode} style={[styles.linkButton, styles.accountPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel color={theme.textDark} label="Verify email and continue" loading={submitting} textStyle={[styles.linkButtonText, styles.accountPrimaryButtonText]} />
            </Pressable>

            <Pressable
              disabled={secondsRemaining > 0 || submitting}
              onPress={handleResendVerificationCode}
              style={[styles.linkButtonSecondaryWide, styles.accountSecondaryButton, secondsRemaining > 0 || submitting ? styles.linkButtonDisabled : null]}
            >
              <Text style={[styles.linkButtonSecondaryText, styles.accountSecondaryButtonText]}>Resend verification code</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function BusinessClaimReviewPendingScreen({ errorMessage, isLandscape, message, onBack, session }: BusinessClaimReviewPendingScreenProps) {
  const businessName = session?.business_name || 'your business';
  const reviewMessage = message || session?.claim_review_message || `DiningDealz has received your business profile creation claim for ${businessName}. We will email you after review is complete.`;
  const reviewStatus = session?.claim_status ? session.claim_status.replace(/_/g, ' ') : 'submitted';
  const reviewTitle = session?.claim_status === 'rejected' ? 'Claim review update' : 'Claim received';

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent, styles.accountScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back to login" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>Business claim status</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>{reviewTitle}</Text>
              <Text style={[styles.profileIntroText, styles.accountBodyText]}>{reviewMessage}</Text>
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <AccountSection title="Review details">
              <Text style={[styles.dashboardSupportText, styles.accountInfoText]}>Business: {businessName}</Text>
              <Text style={[styles.dashboardSupportText, styles.accountInfoText]}>Claim status: {reviewStatus}</Text>
              <Text style={[styles.dashboardSupportText, styles.accountInfoText]}>Account email: {session?.email || 'Unavailable'}</Text>
            </AccountSection>

            <AccountSection title="What happens next">
              <Text style={[styles.dashboardSupportText, styles.accountInfoText]}>DiningDealz will send an approval or rejection email after manual review is complete.</Text>
              <Text style={[styles.dashboardSupportText, styles.accountInfoText]}>Business dashboard access stays locked until the claim is approved.</Text>
            </AccountSection>

            <Pressable onPress={onBack} style={[styles.linkButton, styles.accountPrimaryButton]}>
              <Text style={[styles.linkButtonText, styles.accountPrimaryButtonText]}>Return to login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function ContactSupportScreen({ errorMessage, initialMessage = '', initialSubject = 'DiningDealz support request', isLandscape, message: successMessage, onBack, onSubmit, session, submitting }: ContactSupportScreenProps) {
  const { handleFieldBlur, handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState(initialMessage);
  const { recordSubmitAttempt } = useSubmitErrorAutoScroll(errorMessage, submitting, scrollToTop);

  useEffect(() => {
    setSubject(initialSubject);
  }, [initialSubject]);

  useEffect(() => {
    setMessage(initialMessage);
  }, [initialMessage]);

  function handleSubmitSupport() {
    recordSubmitAttempt();
    onSubmit(subject, message);
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <OnboardingBackButton label="Back to Settings" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.onboardingCard]}>
            <Text style={[styles.detailCity, styles.onboardingEyebrow]}>Contact Support</Text>
            <Text style={[styles.detailTitle, styles.onboardingHeading]}>Reach the DiningDealz support team</Text>
            <Text style={[styles.profileIntroText, styles.onboardingBodyText]}>Send a support message directly from the app. Your name, username, email, and account type will be attached automatically.</Text>

            {successMessage ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{successMessage}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={[styles.dashboardSectionCard, styles.onboardingInfoCard]}>
              <Text style={[styles.dashboardSectionTitle, styles.onboardingInfoTitle]}>Direct email</Text>
              <Text style={[styles.dashboardDetailValue, styles.onboardingInfoTitle]}>{SUPPORT_EMAIL}</Text>
              <Text style={[styles.dashboardSupportText, styles.onboardingInfoText]}>Best for account help, business onboarding, verification issues, or general app support.</Text>
            </View>

            <View style={styles.profileFormSection}>
              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Subject</Text>
              <AutoScrollTextInput
                onBeforeAutoScroll={handleFieldFocus}
                onFieldBlur={handleFieldBlur}
                onChangeText={setSubject}
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.onboardingInput]}
                value={subject}
              />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Message</Text>
              <AutoScrollTextInput
                multiline
                numberOfLines={7}
                onBeforeAutoScroll={handleFieldFocus}
                onFieldBlur={handleFieldBlur}
                onChangeText={setMessage}
                placeholder="Tell us what you need help with."
                placeholderTextColor={onboardingPlaceholderTextColor}
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.supportMessageInput, styles.onboardingInput]}
                textAlignVertical="top"
                value={message}
              />

              <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>Your name, username, email, and account type will be included automatically when this message is sent.</Text>
            </View>

            <Pressable onPress={handleSubmitSupport} style={[styles.linkButton, styles.onboardingPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel color={theme.textDark} label="Send message" loading={submitting} textStyle={[styles.linkButtonText, styles.onboardingPrimaryButtonText]} />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

function LegalDocumentScreen({ eyebrow, intro, isLandscape, onBack, sections, title }: LegalDocumentScreenProps) {
  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <OnboardingBackButton label="Back to Settings" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.onboardingCard]}>
            <Text style={[styles.detailCity, styles.onboardingEyebrow]}>{eyebrow}</Text>
            <Text style={[styles.detailTitle, styles.onboardingHeading]}>{title}</Text>
            <Text style={[styles.profileIntroText, styles.onboardingBodyText]}>{intro}</Text>
            <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>Last updated: {LEGAL_EFFECTIVE_DATE}</Text>

            {sections.map((section) => (
              <View key={section.title} style={[styles.legalSectionCard, styles.onboardingInfoCard]}>
                <Text style={[styles.dashboardSectionTitle, styles.onboardingInfoTitle]}>{section.title}</Text>
                <Text style={[styles.dashboardSupportText, styles.onboardingInfoText]}>{section.body}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function PrivacyPolicyScreen({ isLandscape, onBack }: Pick<LegalDocumentScreenProps, 'isLandscape' | 'onBack'>) {
  return (
    <LegalDocumentScreen
      eyebrow="Privacy Policy"
      intro="This Privacy Policy explains what information DiningDealz collects, how that information is used, when it may be shared, and what choices users have when using the DiningDealz app, website, and related services."
      isLandscape={isLandscape}
      onBack={onBack}
      sections={privacyPolicySections}
      title="How DiningDealz collects and uses information."
    />
  );
}

export function TermsOfServiceScreen({ isLandscape, onBack }: Pick<LegalDocumentScreenProps, 'isLandscape' | 'onBack'>) {
  return (
    <LegalDocumentScreen
      eyebrow="Terms of Service & Agreements"
      intro="These Terms of Service and Agreements govern use of the DiningDealz app, website, and related services by customers, business users, and other visitors."
      isLandscape={isLandscape}
      onBack={onBack}
      sections={termsOfServiceSections}
      title="Rules for using DiningDealz services."
    />
  );
}

export function BusinessSearchScreen({ errorMessage, isLandscape, loadingPlaces, message, onBack, onChangeSearchQuery, onChooseInformalBusiness, onChooseManualBusiness, onRetryRejectedClaim, onSelectBusiness, results, searchQuery }: BusinessSearchScreenProps) {
  const { handleFieldBlur, handleFieldFocus, handleScroll, scrollViewRef } = useAutoScrollForm();

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.accountScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back to create profile" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>Claim a Business</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>Search your business</Text>
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {message ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{message}</Text>
              </View>
            ) : null}

            <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} placeholder="Search by business name" placeholderTextColor={theme.textMuted} onChangeText={onChangeSearchQuery} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={searchQuery} />

            {normalizeSearchText(searchQuery).length === 0 ? (
              <Text style={[styles.centerStateText, styles.accountInfoTextMuted]}>Start typing to search for your business.</Text>
            ) : loadingPlaces ? (
              <Text style={[styles.centerStateText, styles.accountInfoTextMuted]}>Loading businesses...</Text>
            ) : (
              <View style={styles.claimResultsList}>
                {results.length ? (
                  results.map((place) => (
                    <View key={`${place.slug}:${place.id}`} style={[styles.claimResultCard, styles.accountInfoCard]}>
                      <Text style={[styles.placeTitle, styles.accountInfoTitle]}>{place.name}</Text>
                      <Text style={styles.placeMeta}>{place.venue_type_label}</Text>
                      <Text style={[styles.claimBusinessHint, styles.accountInfoText]}>
                        {getPlaceLocations(place).length > 1 ? 'Choose the specific address to verify this claim.' : 'Choose this address to continue to verification.'}
                      </Text>
                      <View style={styles.claimLocationList}>
                        {getPlaceLocations(place).map((location) => (
                          <Pressable
                            key={location.id}
                            onPress={() => onSelectBusiness(place, location.id)}
                            style={[styles.claimLocationButton, styles.accountSecondaryButton]}
                          >
                            <Text style={[styles.claimLocationButtonTitle, styles.accountInfoTitle]}>{location.city_label}</Text>
                            <Text style={[styles.claimLocationButtonText, styles.accountInfoText]}>{formatPlaceAddress(location)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.centerStateText, styles.accountInfoTextMuted]}>No matching businesses found yet.</Text>
                )}
              </View>
            )}

            <AccountSection title="Other ways to get started">
              <Pressable onPress={onChooseManualBusiness} style={styles.accountLinkRow}>
                <Text style={styles.accountLinkText}>Can&apos;t find your business? Create a business profile for an established business here.</Text>
              </Pressable>

              <Pressable onPress={onChooseInformalBusiness} style={styles.accountLinkRow}>
                <Text style={styles.accountLinkText}>For Small Startups & Vendors, create your profile here.</Text>
              </Pressable>

              {onRetryRejectedClaim ? (
                <Pressable onPress={onRetryRejectedClaim} style={styles.accountLinkRow}>
                  <Text style={styles.accountLinkText}>Already had a business claim rejected? Verify your email to try again.</Text>
                </Pressable>
              ) : null}
            </AccountSection>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function BusinessVerificationScreen({ attachments, errorMessage, form, isLandscape, lockAccountIdentityFields = false, mode, onAddAttachments, onAddPhotoUploads, onBack, onChangeField, onRemoveAttachment, onRemoveCurrentPhoto, onRemovePhotoUpload, onRetryRejectedClaim, onToggleAddressNotApplicable, onSubmit, photoUploads, selectedLocation, selectedPlace, submitting }: BusinessVerificationScreenProps) {
  const isClaimed = mode === 'claimed';
  const isEstablished = mode === 'manual';
  const isInformal = mode === 'informal';
  const servesMultipleAreas = form.business_city === 'multiple_areas';
  const requiresHealthPermit = ['restaurant', 'fast_food', 'cafe'].includes(form.business_venue_type);
  const requiresAbcLicense = form.business_venue_type === 'bar';
  const [openDropdown, setOpenDropdown] = useState<'city' | 'venue' | 'job' | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ name: string; uri: string } | null>(null);
  const { handleFieldBlur, handleFieldFocus, handleScroll, handleScrollBeginDrag, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const currentPhotoUrls = dedupeImageUrls(
    form.photo_references_text
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => /^https?:\/\//i.test(entry)),
  );
  const remainingPhotoSlots = Math.max(0, 8 - currentPhotoUrls.length - photoUploads.length);

  const verificationTitle = isClaimed
    ? 'Verify this business claim'
    : isInformal
      ? 'Set up a small startup or vendor profile'
      : 'Create a business profile';
  const verificationIntro = isClaimed
    ? 'Claimed businesses need ownership or manager verification details before they move into review.'
    : isInformal
      ? 'Use this path for small startups, vendors, and pop-ups that still need a clean profile on DiningDealz.'
      : 'Use this path for established businesses that are not on DiningDealz yet and need full verification review.';
  const submitLabel = isClaimed
    ? 'Submit business claim'
    : isInformal
      ? 'Create small startup or vendor profile'
      : 'Create business profile';
  const jobTitleOptions = [
    { label: 'Owner', value: 'owner' },
    { label: 'Manager', value: 'manager' },
  ] as const;
  const socialFieldErrors = {
    website: getSocialProfileValidationMessage('website', form.business_website_url),
    instagram: getSocialProfileValidationMessage('instagram', form.instagram_profile),
    facebook: getSocialProfileValidationMessage('facebook', form.facebook_profile),
    tiktok: getSocialProfileValidationMessage('tiktok', form.tiktok_profile),
    youtube: getSocialProfileValidationMessage('youtube', form.youtube_profile),
  };
  const { recordSubmitAttempt, recordSubmitValidationError } = useSubmitErrorAutoScroll(errorMessage, submitting, scrollToTop);

  function handleSelectDropdownValue(field: 'business_city' | 'business_venue_type', value: string) {
    onChangeField(field, value);
    setOpenDropdown(null);
  }

  async function openAttachmentExternally(uri: string, mimeType: string | null, attachmentName: string) {
    if (!uri) {
      return;
    }

    try {
      if (Platform.OS === 'android') {
        const targetUri = uri.startsWith('file://') ? await FileSystem.getContentUriAsync(uri) : uri;
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: targetUri,
          flags: 1,
          type: mimeType ?? undefined,
        });
        return;
      }

      const supported = await Linking.canOpenURL(uri);
      if (supported) {
        await Linking.openURL(uri);
        return;
      }
    } catch {
      // Fall through to the native share/open sheet below.
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        dialogTitle: `Open ${attachmentName}`,
        mimeType: mimeType ?? undefined,
      });
      return;
    }

    Alert.alert('Unable to open file', 'This document could not be opened on this device.');
  }

  function handleCloseAttachmentPreview() {
    setAttachmentPreview(null);
  }

  async function handleOpenAttachment(uri: string, mimeType: string | null, attachmentName: string) {
    if (!uri) {
      return;
    }

    const previewKind = getAttachmentPreviewKind(mimeType, attachmentName);
    if (previewKind === 'image') {
      setAttachmentPreview({ kind: 'image', name: attachmentName, uri });
      return;
    }

    if (previewKind === 'pdf') {
      setAttachmentPreview(null);
      setPdfPreview({ name: attachmentName, uri });
      return;
    }

    await openAttachmentExternally(uri, mimeType, attachmentName);
  }

  function renderMultilineField(field: keyof ProfileFormState, label: string, value: string, options?: { placeholder?: string; support?: string }) {
    return (
      <>
        <Text style={[styles.profileFieldLabel, styles.accountLabel]}>{label}</Text>
        <AutoScrollTextInput
          multiline
          onBeforeAutoScroll={handleFieldFocus}
          onFieldBlur={handleFieldBlur}
          onChangeText={(nextValue) => onChangeField(field, nextValue)}
          placeholder={options?.placeholder}
          placeholderTextColor={theme.textMuted}
          scrollViewRef={scrollViewRef}
          style={[styles.profileInput, styles.accountInput, styles.profileTextarea]}
          textAlignVertical="top"
          value={value}
        />
        {options?.support ? <Text style={[styles.profileSupportText, styles.accountBodyText]}>{options.support}</Text> : null}
      </>
    );
  }

  function renderSocialProfileField(field: keyof ProfileFormState, platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube') {
    const fieldValue = String(form[field] ?? '');
    const fieldError = socialFieldErrors[platform];
    const preview = getSocialProfilePreview(platform, fieldValue);
    const placeholder = businessSocialFieldDefinitions.find((definition) => definition.field === field)?.placeholder;

    return (
      <View key={field} style={styles.dashboardFieldColumn}>
        <Text style={[styles.profileFieldLabel, styles.accountLabel]}>{SOCIAL_PLATFORM_LABELS[platform]}</Text>
        <AutoScrollTextInput
          autoCapitalize="none"
          onBeforeAutoScroll={handleFieldFocus}
          onFieldBlur={handleFieldBlur}
          onChangeText={(value) => onChangeField(field, value)}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          scrollViewRef={scrollViewRef}
          style={[styles.profileInput, styles.accountInput]}
          value={fieldValue}
        />
        {fieldError ? <Text style={styles.structuredEntryErrorText}>{fieldError}</Text> : null}
        {!fieldError && preview ? <Text style={[styles.profileSupportText, styles.accountBodyText]}>{`Displays as ${preview}`}</Text> : null}
      </View>
    );
  }

  function handleSubmitVerification() {
    if (Object.values(socialFieldErrors).some(Boolean)) {
      recordSubmitValidationError();
      return;
    }

    recordSubmitAttempt();
    onSubmit();
  }

  function renderAttachmentPicker(kind: BusinessAttachmentKind, label: string, support?: string) {
    const selectedAttachments = attachments[kind];

    return (
      <View style={styles.attachmentSection}>
        <Pressable onPress={() => onAddAttachments(kind)} style={[styles.linkButtonSecondary, styles.accountSecondaryButton, styles.attachmentPickerButton]}>
          <Text style={[styles.linkButtonSecondaryText, styles.accountSecondaryButtonText]}>{selectedAttachments.length ? `Add more to ${label}` : `Attach files to ${label}`}</Text>
        </Pressable>
        {support ? <Text style={[styles.profileSupportText, styles.accountBodyText, styles.attachmentSupportText]}>{support}</Text> : null}
        {selectedAttachments.length ? (
          <View style={styles.attachmentList}>
            {selectedAttachments.map((attachment) => (
              <View key={attachment.id} style={[styles.attachmentCard, styles.accountInfoCard]}>
                <Pressable onPress={() => void handleOpenAttachment(attachment.uri, attachment.mimeType, attachment.name)} style={styles.attachmentPreviewButton}>
                  <View style={styles.attachmentMeta}>
                    <Text numberOfLines={1} style={[styles.attachmentName, styles.accountInfoTitle]}>{attachment.name}</Text>
                    <Text style={[styles.attachmentDetail, styles.accountInfoText]}>{attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB • Tap to view` : 'Selected file • Tap to view'}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => onRemoveAttachment(kind, attachment.id)} style={styles.attachmentRemoveButton}>
                  <Text style={styles.attachmentRemoveButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <ReadOnlyPdfPreviewModal
        fileName={pdfPreview?.name ?? 'PDF preview'}
        onClose={() => setPdfPreview(null)}
        uri={pdfPreview?.uri ?? null}
        visible={pdfPreview !== null}
      />
      <Modal animationType="slide" onRequestClose={handleCloseAttachmentPreview} transparent visible={attachmentPreview !== null}>
        <View style={styles.attachmentPreviewOverlay}>
          <View style={styles.attachmentPreviewSheet}>
            <View style={styles.attachmentPreviewHeader}>
              <Text numberOfLines={1} style={styles.attachmentPreviewTitle}>{attachmentPreview?.name ?? 'Preparing preview...'}</Text>
              <Pressable onPress={handleCloseAttachmentPreview} style={styles.attachmentPreviewCloseButton}>
                <Text style={styles.attachmentPreviewCloseButtonText}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.attachmentPreviewBody}>
              {attachmentPreview?.kind === 'image' ? (
                <Image resizeMode="contain" source={{ uri: attachmentPreview.uri }} style={styles.attachmentPreviewImage} />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.accountScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          onScrollBeginDrag={() => {
            handleScrollBeginDrag();
            Keyboard.dismiss();
          }}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>Verification</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>{verificationTitle}</Text>
              <Text style={[styles.profileIntroText, styles.accountBodyText]}>{verificationIntro}</Text>
            </View>

            {isClaimed && onRetryRejectedClaim ? (
              <Pressable onPress={onRetryRejectedClaim} style={styles.authLinkButton}>
                <Text style={styles.authLinkText}>Already had a claim rejected? Verify your email to retry this account.</Text>
              </Pressable>
            ) : null}

            <View style={[styles.privacyNoticeCard, styles.accountInfoCard, styles.accountNotice]}>
              <Text style={[styles.privacyNoticeTitle, styles.accountInfoTitle]}>Business verification privacy</Text>
              <Text style={[styles.privacyNoticeText, styles.accountInfoText]}>
                DiningDealz uses your business details, documents, links, and selected photos to verify your authority and review your business profile. Verification documents stay private and are retained until you delete your account, except where limited records must be kept for legal, security, fraud, or dispute purposes. Approved profile photos may be shown publicly on your business profile.{' '}
                <Text accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} style={styles.privacyNoticeLink}>
                  See the full Privacy Policy on our website.
                </Text>
              </Text>
              <Text style={[styles.privacyNoticeText, styles.accountInfoText]}>Only upload documents you are authorized to provide. Do not upload Social Security numbers, passport or driver&apos;s-license numbers, payment-card numbers, or unrelated sensitive information. Redact it before uploading whenever possible.</Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.verification_data_consent }}
                onPress={() => onChangeField('verification_data_consent', !form.verification_data_consent)}
                style={styles.privacyConsentButton}
              >
                <View style={[styles.privacyConsentIndicator, form.verification_data_consent ? styles.privacyConsentIndicatorActive : null]}>
                  {form.verification_data_consent ? <Text style={styles.privacyConsentIndicatorText}>X</Text> : null}
                </View>
                <Text style={[styles.privacyConsentText, styles.accountInfoText]}>I understand and consent to the collection and use of these business verification materials.</Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.terms_accepted }}
                onPress={() => onChangeField('terms_accepted', !form.terms_accepted)}
                style={styles.privacyConsentButton}
              >
                <View style={[styles.privacyConsentIndicator, form.terms_accepted ? styles.privacyConsentIndicatorActive : null]}>
                  {form.terms_accepted ? <Text style={styles.privacyConsentIndicatorText}>X</Text> : null}
                </View>
                <Text style={[styles.privacyConsentText, styles.accountInfoText]}>
                  I agree to the{' '}
                  <Text accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)} style={styles.privacyNoticeLink}>Terms of Service</Text>
                  {' '}and acknowledge the{' '}
                  <Text accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} style={styles.privacyNoticeLink}>Privacy Policy</Text>.
                </Text>
              </Pressable>
            </View>

            {isClaimed && selectedPlace ? (
              <View style={[styles.claimResultCard, styles.accountInfoCard]}>
                <Text style={[styles.placeTitle, styles.accountInfoTitle]}>{selectedPlace.name}</Text>
                <Text style={styles.placeMeta}>{selectedPlace.venue_type_label}</Text>
                {selectedLocation ? (
                  <>
                    <Text style={[styles.claimBusinessHint, styles.accountInfoText]}>Selected address</Text>
                    <Text style={[styles.claimLocationButtonText, styles.accountInfoText]}>{formatPlaceAddress(selectedLocation)}</Text>
                  </>
                ) : null}
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.accountForm}>
              {!isClaimed ? (
                <AccountSection title="Business details">
                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Business name</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('business_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.business_name} />

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>City</Text>
                  <CompactDropdown
                    onSelect={(value) => handleSelectDropdownValue('business_city', value)}
                    onToggle={() => setOpenDropdown((current) => current === 'city' ? null : 'city')}
                    open={openDropdown === 'city'}
                    options={[{ label: 'Select a city', value: '' }, ...manualBusinessCityOptions]}
                    placeholder="Select a city or mobile business"
                    selectedValue={form.business_city}
                  />

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Business type</Text>
                  <CompactDropdown
                    onSelect={(value) => handleSelectDropdownValue('business_venue_type', value)}
                    onToggle={() => setOpenDropdown((current) => current === 'venue' ? null : 'venue')}
                    open={openDropdown === 'venue'}
                    options={[{ label: 'Select a business type', value: '' }, ...manualBusinessVenueOptions]}
                    placeholder="Select a business type"
                    selectedValue={form.business_venue_type}
                  />

                  {isInformal ? (
                    <>
                      <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Business address (optional)</Text>
                      <AutoScrollTextInput
                        onBeforeAutoScroll={handleFieldFocus}
                        onFieldBlur={handleFieldBlur}
                        onChangeText={(value) => onChangeField('employer_address', value)}
                        placeholder="Street address, neighborhood, or usual setup location"
                        placeholderTextColor={theme.textMuted}
                        scrollViewRef={scrollViewRef}
                        style={[styles.profileInput, styles.accountInput]}
                        value={form.employer_address}
                      />
                      <Text style={[styles.profileSupportText, styles.accountBodyText]}>Leave this blank if you work across multiple areas or do not have a fixed address yet.</Text>
                    </>
                  ) : null}

                  {servesMultipleAreas ? (
                    <Text style={[styles.profileSupportText, styles.accountBodyText]}>It is highly recommend for small startups and vendors that do not have a dedicated business address to turn on location services for DiningDealz after account is verified so you have can a business pin on the map.</Text>
                  ) : null}
                </AccountSection>
              ) : null}

              <AccountSection title="Account details">
                {lockAccountIdentityFields ? (
                  <Text style={[styles.profileSupportText, styles.accountBodyText]}>Your username, email, and name are locked because this claim is attached to your existing customer account.</Text>
                ) : null}

                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Username</Text>
                <AutoScrollTextInput autoCapitalize="none" editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('username', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.username} />

                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Email</Text>
                <AutoScrollTextInput autoCapitalize="none" editable={!lockAccountIdentityFields} keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('email', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.email} />

                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Confirm email</Text>
                <AutoScrollTextInput autoCapitalize="none" editable={!lockAccountIdentityFields} keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('confirm_email', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.confirm_email} />

                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Password</Text>
                <PasswordField inputStyle={styles.accountInput} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={form.password} />

                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Confirm password</Text>
                <PasswordField inputStyle={styles.accountInput} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('confirm_password', value)} scrollViewRef={scrollViewRef} value={form.confirm_password} />
              </AccountSection>

              <AccountSection title="Your name">
                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>First name</Text>
                <AutoScrollTextInput editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('first_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.first_name} />

                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Last name</Text>
                <AutoScrollTextInput editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('last_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.last_name} />
              </AccountSection>

              {!isInformal ? (
                <AccountSection title="Business contact">
                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Contact name</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('contact_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.contact_name} />

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Role</Text>
                  <CompactDropdown
                    onSelect={(value) => {
                      onChangeField('job_title', value);
                      setOpenDropdown(null);
                    }}
                    onToggle={() => setOpenDropdown((current) => current === 'job' ? null : 'job')}
                    open={openDropdown === 'job'}
                    options={[{ label: 'Select owner or manager', value: '' }, ...jobTitleOptions]}
                    placeholder="Select owner or manager"
                    selectedValue={form.job_title}
                  />

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Employer email</Text>
                  <AutoScrollTextInput autoCapitalize="none" keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('work_email', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.work_email} />

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Employer phone</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('work_phone', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.work_phone} />

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>{isEstablished && servesMultipleAreas ? 'Business address (optional for multi-area businesses)' : 'Business address'}</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onFieldBlur={handleFieldBlur} onChangeText={(value) => onChangeField('employer_address', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.accountInput]} value={form.employer_address} />

                  {isEstablished && servesMultipleAreas ? (
                    <Pressable onPress={() => onToggleAddressNotApplicable(!form.address_not_applicable)} style={[styles.toggleChip, styles.accountChip, form.address_not_applicable ? styles.toggleChipActive : null]}>
                      <Text style={[styles.toggleChipText, styles.accountChipText, form.address_not_applicable ? styles.toggleChipTextActive : null]}>Address Not Applicable</Text>
                    </Pressable>
                  ) : null}
                </AccountSection>
              ) : null}

              <AccountSection title="Website and social media">
                <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Website</Text>
                <AutoScrollTextInput
                  autoCapitalize="none"
                  onBeforeAutoScroll={handleFieldFocus}
                  onFieldBlur={handleFieldBlur}
                  onChangeText={(value) => onChangeField('business_website_url', value)}
                  placeholder="yourbusiness.com"
                  placeholderTextColor={theme.textMuted}
                  scrollViewRef={scrollViewRef}
                  style={[styles.profileInput, styles.accountInput]}
                  value={form.business_website_url}
                />
                {socialFieldErrors.website ? <Text style={styles.structuredEntryErrorText}>{socialFieldErrors.website}</Text> : null}
                {!socialFieldErrors.website && getSocialProfilePreview('website', form.business_website_url) ? (
                  <Text style={[styles.profileSupportText, styles.accountBodyText]}>{`Displays as ${getSocialProfilePreview('website', form.business_website_url)}`}</Text>
                ) : (
                  <Text style={[styles.profileSupportText, styles.accountBodyText]}>Paste a full website URL or domain. The public profile shows the site domain instead of the raw link.</Text>
                )}
                {businessSocialFieldDefinitions.map((definition) => renderSocialProfileField(definition.field, definition.platform))}
              </AccountSection>

              <View style={styles.accountSection}>
                <BusinessDealsEditor
                  label="Deals and specials"
                  labelStyle={styles.accountSectionTitle}
                  onFieldBlur={handleFieldBlur}
                  onFieldFocus={handleFieldFocus}
                  onChange={(value) => onChangeField('deal_overrides', value)}
                  scrollViewRef={scrollViewRef}
                  supportText={isClaimed
                    ? 'Existing public deals are prefilled when available. Follow the sections below, then check the live preview before submitting.'
                    : 'Create one card per promotion. Follow the sections below, then check the live preview before submitting.'}
                  value={form.deal_overrides}
                />
              </View>

              <View style={styles.accountSection}>
                <BusinessHoursEditor
                  label="Hours of operation"
                  labelStyle={styles.accountSectionTitle}
                  onFieldBlur={handleFieldBlur}
                  onFieldFocus={handleFieldFocus}
                  onChange={(value) => onChangeField('operating_hour_overrides', value)}
                  scrollViewRef={scrollViewRef}
                  supportText={isClaimed
                    ? 'Existing public hours prefill here when available. Update the displayed schedule directly instead of adding extra text below it.'
                    : 'Add business hours by day so the public profile can render the same grouped schedule cards shown to users.'}
                  value={form.operating_hour_overrides}
                />
              </View>

              <AccountSection title="Business photos">
                <Pressable
                  disabled={remainingPhotoSlots <= 0}
                  onPress={onAddPhotoUploads}
                  style={[styles.linkButtonSecondary, styles.accountSecondaryButton, styles.attachmentPickerButton, remainingPhotoSlots <= 0 ? styles.linkButtonDisabled : null]}
                >
                  <Text style={[styles.linkButtonSecondaryText, styles.accountSecondaryButtonText]}>
                    {currentPhotoUrls.length || photoUploads.length ? 'Add more photos from Photo Library' : 'Select photos from Photo Library'}
                  </Text>
                </Pressable>
                <Text style={[styles.profileSupportText, styles.accountBodyText, styles.attachmentSupportText]}>
                  {isClaimed
                    ? 'Existing business photos prefill here when available. You can remove them or add up to 8 total photos from the photo library.'
                    : 'Upload up to 8 business photos from the photo library. Camera capture is not used here.'}
                </Text>
                {currentPhotoUrls.length ? (
                  <>
                    <Text style={[styles.attachmentGalleryLabel, styles.accountLabel]}>Current public photos</Text>
                    <ScrollView
                      contentContainerStyle={styles.photoGalleryRow}
                      horizontal
                      {...dismissKeyboardOnScrollProps}
                      keyboardShouldPersistTaps="handled"
                      showsHorizontalScrollIndicator={false}
                      style={styles.photoGalleryScroll}
                    >
                      {currentPhotoUrls.map((photoUrl) => (
                        <View key={photoUrl} style={styles.photoGalleryCard}>
                          <Image resizeMode="cover" source={{ uri: photoUrl }} style={styles.photoGalleryImage} />
                          <Pressable onPress={() => onRemoveCurrentPhoto(photoUrl)} style={styles.photoGalleryDismissButton}>
                            <Text style={styles.photoGalleryDismissButtonText}>X</Text>
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                {photoUploads.length ? (
                  <>
                    <Text style={[styles.attachmentGalleryLabel, styles.accountLabel]}>Selected photos</Text>
                    <ScrollView
                      contentContainerStyle={styles.photoGalleryRow}
                      horizontal
                      {...dismissKeyboardOnScrollProps}
                      keyboardShouldPersistTaps="handled"
                      showsHorizontalScrollIndicator={false}
                      style={styles.photoGalleryScroll}
                    >
                      {photoUploads.map((attachment) => (
                        <View key={attachment.id} style={styles.photoGalleryCard}>
                          <Image resizeMode="cover" source={{ uri: attachment.uri }} style={styles.photoGalleryImage} />
                          <Pressable onPress={() => onRemovePhotoUpload(attachment.id)} style={styles.photoGalleryDismissButton}>
                            <Text style={styles.photoGalleryDismissButtonText}>X</Text>
                          </Pressable>
                          <View style={styles.photoGalleryMeta}>
                            <Text numberOfLines={1} style={[styles.attachmentName, styles.accountInfoTitle]}>{attachment.name}</Text>
                            <Text style={[styles.attachmentDetail, styles.accountInfoText]}>{formatAttachmentSize(attachment.size)}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
              </AccountSection>

              {!isInformal ? (
                <AccountSection title="Verification documents">
                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Business registration documents</Text>
                  {renderAttachmentPicker('business_registration', 'business registration documents', 'Attach one or more business registration files.')}

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Proof of authority</Text>
                  {renderAttachmentPicker('proof_of_authority', 'proof of authority', 'Attach a work badge, payroll stub, authorization letter, or similar proof that you represent this business.')}

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>{requiresHealthPermit ? 'Health permit documents' : 'Health permit documents (if applicable)'}</Text>
                  {renderAttachmentPicker('health_permit', 'health permit documents', 'Attach one or more health permit files when they apply to this business type.')}

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>{requiresAbcLicense ? 'ABC license documents' : 'ABC license documents (bars only)'}</Text>
                  {renderAttachmentPicker('abc_license', 'ABC license documents', 'Attach one or more ABC license files when required.')}

                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Proof of address control (optional)</Text>
                  {renderAttachmentPicker('proof_of_address_control', 'proof of address control', 'Attach leases, utility documents, or similar supporting files if needed.')}

                  {renderMultilineField(
                    'supporting_details',
                    'Anything else for review? (optional)',
                    form.supporting_details,
                    {
                      placeholder: 'Add any context the review team should know.',
                    },
                  )}
                </AccountSection>
              ) : null}

              {isInformal ? (
                <AccountSection title="About your business">
                  {renderMultilineField(
                    'supporting_details',
                    'Tell us about your business',
                    form.supporting_details,
                    {
                      placeholder: 'Briefly explain how you operate, where customers can find you, and anything that helps verify the business.',
                      support: 'Keep this short. Small startups and vendors need a quick summary plus at least one social link, website, or photo reference before submission.',
                    },
                  )}
                </AccountSection>
              ) : null}
            </View>

            <Pressable onPress={() => void handleSubmitVerification()} style={[styles.linkButton, styles.accountPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel color={theme.textDark} label={submitLabel} loading={submitting} textStyle={[styles.linkButtonText, styles.accountPrimaryButtonText]} />
            </Pressable>

          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function BusinessClaimRetryScreen({ codeRequested, email, errorMessage, isLandscape, message, onBack, onChangeCode, onChangeEmail, onRequestCode, onVerifyCode, submitting, verificationCode }: BusinessClaimRetryScreenProps) {
  const { handleFieldBlur, handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const { recordSubmitAttempt } = useSubmitErrorAutoScroll(errorMessage, submitting, scrollToTop);

  function handleSubmit() {
    recordSubmitAttempt();
    if (codeRequested) {
      onVerifyCode();
    } else {
      onRequestCode();
    }
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent, styles.accountScrollContent]}
          {...dismissKeyboardOnScrollProps}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle, styles.accountHeader]}>
            <OnboardingBackButton flow label="Back to claim" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.accountPage]}>
            <View style={styles.accountIntro}>
              <Text style={[styles.detailCity, styles.accountEyebrow]}>Business claim retry</Text>
              <Text style={[styles.detailTitle, styles.accountHeading]}>{codeRequested ? 'Verify your account email' : 'Request a fresh verification code'}</Text>
              <Text style={[styles.profileIntroText, styles.accountBodyText]}>
                Enter only the email used for the rejected claim—no username or rejection-email link is needed. If that account is eligible, we will send a one-time code to its already-verified email. After verification, you can choose a new username when you resubmit. Your account stays suspended until approval.
              </Text>
            </View>

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

            <AccountSection title="Account verification">
              <Text style={[styles.profileFieldLabel, styles.accountLabel]}>Email used for the rejected claim</Text>
              <AutoScrollTextInput
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onBeforeAutoScroll={handleFieldFocus}
                onFieldBlur={handleFieldBlur}
                onChangeText={onChangeEmail}
                placeholder="Email address"
                placeholderTextColor={theme.textMuted}
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.accountInput]}
                value={email}
              />

              {codeRequested ? (
                <>
                  <Text style={[styles.profileSupportText, styles.accountBodyText]}>If the account is eligible, a code was sent to its verified email address.</Text>
                  <Text style={[styles.profileFieldLabel, styles.accountLabel]}>6-digit verification code</Text>
                  <AutoScrollTextInput
                    autoCapitalize="none"
                    autoComplete="one-time-code"
                    keyboardType="number-pad"
                    maxLength={6}
                    onBeforeAutoScroll={handleFieldFocus}
                    onFieldBlur={handleFieldBlur}
                    onChangeText={(value) => onChangeCode(value.replace(/[^0-9]/g, ''))}
                    placeholder="000000"
                    placeholderTextColor={theme.textMuted}
                    scrollViewRef={scrollViewRef}
                    style={[styles.profileInput, styles.verificationCodeInput, styles.accountInput]}
                    textContentType="oneTimeCode"
                    value={verificationCode}
                  />
                </>
              ) : null}
            </AccountSection>

            <Pressable disabled={submitting} onPress={handleSubmit} style={[styles.linkButton, styles.accountPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel
                color={theme.textDark}
                label={codeRequested ? 'Verify email and continue' : 'Email me a verification code'}
                loading={submitting}
                textStyle={[styles.linkButtonText, styles.accountPrimaryButtonText]}
              />
            </Pressable>

            {codeRequested ? (
              <Pressable disabled={submitting} onPress={onRequestCode} style={[styles.linkButtonSecondaryWide, styles.accountSecondaryButton, submitting ? styles.linkButtonDisabled : null]}>
                <Text style={[styles.linkButtonSecondaryText, styles.accountSecondaryButtonText]}>Send another code</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}
