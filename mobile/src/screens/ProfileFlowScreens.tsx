import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import {
  Alert,
  ActivityIndicator,
  Animated,
  findNodeHandle,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

import { styles } from '../appStyles';
import type { AuthPortal, LoginFormState, ProfileFormState } from '../appFlowTypes';
import { BusinessDealsEditor, BusinessHoursEditor } from '../components/BusinessProfileStructuredEditors';
import { NativeIOSLiquidGlassBackButton, isNativeIOSLiquidGlassHeaderButtonAvailable } from '../components/NativeIOSLiquidGlass';
import { manualBusinessCityOptions, manualBusinessVenueOptions } from '../browseConfig';
import { dedupeImageUrls, formatPlaceAddress, getPlaceLocations, normalizeSearchText } from '../placeHelpers';
import { SOCIAL_PLATFORM_LABELS, getSocialProfilePreview, getSocialProfileValidationMessage } from '../socialProfiles';
import { theme } from '../styles/theme';
import type { BusinessAttachmentBuckets, BusinessAttachmentDraft, BusinessAttachmentKind, EmailVerificationChallengeResponse, PlaceListItem, PlaceLocation, SignupResponse } from '../types';

const SUPPORT_EMAIL = 'support@diningdealz.com';
const onboardingPlaceholderTextColor = theme.textDarkMuted;

function OnboardingBackButton({ label, onPress, style }: { label: string; onPress: () => void; style?: any }) {
  const resolvedStyle = isNativeIOSLiquidGlassHeaderButtonAvailable()
    ? [styles.onboardingNativeBackButton, style]
    : [styles.onboardingBackButton, style];

  return (
    <NativeIOSLiquidGlassBackButton
      label={label}
      onPress={onPress}
      style={resolvedStyle}
      textStyle={styles.onboardingBackButtonText}
      themeVariant="default-dark"
    />
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
  | { kind: 'image'; name: string; uri: string }
  | { kind: 'pdf'; name: string; html: string };

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPdfPreviewHtml(base64Document: string, fileName: string) {
  const safeName = escapeHtml(fileName || 'Document preview');
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <title>${safeName}</title>
        <style>
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f3e7d8;
            color: #402214;
          }
          #status {
            padding: 16px;
            text-align: center;
            font-size: 14px;
            color: #7d614f;
          }
          #pages {
            padding: 12px;
          }
          .page {
            margin: 0 auto 14px;
            width: fit-content;
            box-shadow: 0 8px 24px rgba(45, 34, 26, 0.14);
            background: white;
          }
          canvas {
            display: block;
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <div id="status">Loading PDF preview...</div>
        <div id="pages"></div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <script>
          const status = document.getElementById('status');
          const pages = document.getElementById('pages');
          const base64 = '${base64Document}';

          function base64ToUint8Array(input) {
            const binary = atob(input);
            const length = binary.length;
            const bytes = new Uint8Array(length);
            for (let index = 0; index < length; index += 1) {
              bytes[index] = binary.charCodeAt(index);
            }
            return bytes;
          }

          async function renderPdf() {
            try {
              pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
              const pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(base64) }).promise;
              status.textContent = 'Rendering pages...';
              for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                const page = await pdf.getPage(pageNumber);
                const baseViewport = page.getViewport({ scale: 1 });
                const availableWidth = Math.max(window.innerWidth - 24, 1);
                const availableHeight = Math.max(window.innerHeight - 24, 1);
                const fitScale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height);
                const scale = Math.max(Math.min(fitScale, 1), 0.35);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                const wrapper = document.createElement('div');
                wrapper.className = 'page';
                const deviceScale = window.devicePixelRatio || 1;
                canvas.width = Math.floor(viewport.width * deviceScale);
                canvas.height = Math.floor(viewport.height * deviceScale);
                canvas.style.width = viewport.width + 'px';
                canvas.style.height = viewport.height + 'px';
                context.scale(deviceScale, deviceScale);
                wrapper.appendChild(canvas);
                pages.appendChild(wrapper);
                await page.render({ canvasContext: context, viewport }).promise;
              }
              status.remove();
            } catch (error) {
              status.textContent = 'Unable to preview this PDF in-app.';
            }
          }

          renderPdf();
        </script>
      </body>
    </html>
  `;
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
  onBack: () => void;
  onChangeSearchQuery: (value: string) => void;
  onChooseInformalBusiness: () => void;
  onChooseManualBusiness: () => void;
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

type ScrollResponderHandle = {
  scrollResponderScrollNativeHandleToKeyboard?: (nodeHandle: number, additionalOffset: number, preventNegativeScrollOffset: boolean) => void;
};

type KeyboardScrollViewHandle = ScrollView & {
  getScrollResponder?: () => ScrollResponderHandle | null;
};

type AutoScrollTextInputProps = ComponentProps<typeof TextInput> & {
  onBeforeAutoScroll?: () => void;
  scrollViewRef: RefObject<ScrollView | null>;
};

type AutoScrollFormController = {
  handleFieldFocus: () => void;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollToTop: () => void;
  scrollViewRef: RefObject<ScrollView | null>;
};

type PasswordFieldProps = {
  inputStyle?: any;
  onBeforeAutoScroll?: () => void;
  onChangeText: (value: string) => void;
  scrollViewRef: RefObject<ScrollView | null>;
  value: string;
};

function useAutoScrollForm(): AutoScrollFormController {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const currentScrollOffsetRef = useRef(0);
  const restoreScrollOffsetRef = useRef(0);
  const keyboardVisibleRef = useRef(false);

  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(keyboardShowEvent, () => {
      keyboardVisibleRef.current = true;
    });
    const hideSubscription = Keyboard.addListener(keyboardHideEvent, () => {
      keyboardVisibleRef.current = false;
      scrollViewRef.current?.scrollTo({
        animated: true,
        y: restoreScrollOffsetRef.current,
      });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  function handleFieldFocus() {
    if (!keyboardVisibleRef.current) {
      restoreScrollOffsetRef.current = currentScrollOffsetRef.current;
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    currentScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    if (!keyboardVisibleRef.current) {
      restoreScrollOffsetRef.current = currentScrollOffsetRef.current;
    }
  }

  function scrollToTop() {
    restoreScrollOffsetRef.current = 0;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        animated: true,
        y: 0,
      });
    });
  }

  return {
    handleFieldFocus,
    handleScroll,
    scrollToTop,
    scrollViewRef,
  };
}

function useScrollToTopOnError(errorMessage: string | null, scrollToTop: () => void) {
  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    scrollToTop();
  }, [errorMessage, scrollToTop]);
}

function scrollFocusedFieldIntoView(scrollViewRef: RefObject<ScrollView | null>, target: number | null) {
  if (target === null) {
    return;
  }

  requestAnimationFrame(() => {
    const responder = (scrollViewRef.current as KeyboardScrollViewHandle | null)?.getScrollResponder?.();
    responder?.scrollResponderScrollNativeHandleToKeyboard?.(target, 96, true);
  });
}

function AutoScrollTextInput({ onBeforeAutoScroll, onFocus, scrollViewRef, ...props }: AutoScrollTextInputProps) {
  const inputRef = useRef<TextInput | null>(null);

  return (
    <TextInput
      {...props}
      ref={inputRef}
      onFocus={(event) => {
        onBeforeAutoScroll?.();
        scrollFocusedFieldIntoView(scrollViewRef, findNodeHandle(inputRef.current));
        onFocus?.(event);
      }}
    />
  );
}

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

function PasswordField({ inputStyle, onBeforeAutoScroll, onChangeText, scrollViewRef, value }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={styles.passwordFieldRow}>
      <AutoScrollTextInput
        onBeforeAutoScroll={onBeforeAutoScroll}
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
      <Pressable onPress={handleToggle} style={[styles.compactDropdownButton, styles.onboardingDropdownButton, open ? styles.compactDropdownButtonOpen : null, open ? styles.onboardingDropdownButtonOpen : null]}>
        <Text style={[styles.compactDropdownText, styles.onboardingDropdownText, selectedValue.length === 0 ? styles.compactDropdownPlaceholder : null, selectedValue.length === 0 ? styles.onboardingDropdownPlaceholder : null]}>{selectedLabel}</Text>
        <Text style={[styles.compactDropdownCaret, styles.onboardingDropdownCaret]}>{open ? '^' : 'v'}</Text>
      </Pressable>
      {open ? (
        <View style={[styles.compactDropdownMenu, styles.onboardingDropdownMenu]}>
          {options.map((option) => {
            const isSelected = option.value === selectedValue;

            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelect(option.value)}
                style={[styles.compactDropdownOption, isSelected ? styles.compactDropdownOptionSelected : null, isSelected ? styles.onboardingDropdownOptionSelected : null]}
              >
                <Text style={[styles.compactDropdownOptionText, styles.onboardingDropdownText, isSelected ? styles.compactDropdownOptionTextSelected : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function AuthPortalScreen({ authMessage, autoFocusIdentifier, errorMessage, loginForm, loginPortal, onBackToLanding, onChangeField, onForgotPassword, onForgotUsername, onSubmit, showTwoFactorCodeField, submitting }: AuthPortalScreenProps) {
  const { handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const [recoveryMode, setRecoveryMode] = useState<AuthRecoveryMode>(null);
  const [recoveryValue, setRecoveryValue] = useState('');
  const recoveryFade = useRef(new Animated.Value(0)).current;
  const recoveryTranslateY = useRef(new Animated.Value(-14)).current;
  useScrollToTopOnError(errorMessage, scrollToTop);

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
    scrollToTop();
    if (recoveryMode === 'username') {
      onForgotUsername(recoveryValue);
      return;
    }

    if (recoveryMode === 'password') {
      onForgotPassword(recoveryValue);
    }
  }

  function handleSubmitAuth() {
    scrollToTop();
    void onSubmit();
  }

  return (
    <View style={styles.authScreen}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.authScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <OnboardingBackButton label="Back" onPress={onBackToLanding} />
          </View>

          <View style={styles.authFormStack}>
            <View style={[styles.profileCard, styles.onboardingCard]}>
              <Text style={[styles.detailCity, styles.onboardingEyebrow]}>{loginPortal === 'customer' ? 'Customer Login' : 'Business Login'}</Text>
              <Text style={[styles.detailTitle, styles.onboardingHeading]}>Welcome back</Text>
              <Text style={[styles.profileIntroText, styles.onboardingBodyText]}>Enter your username and password to continue.</Text>

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

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Username</Text>
              <AutoScrollTextInput autoCapitalize="none" autoFocus={autoFocusIdentifier} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('identifier', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={loginForm.identifier} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Password</Text>
              <PasswordField inputStyle={styles.onboardingInput} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={loginForm.password} />

              {showTwoFactorCodeField ? (
                <>
                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Authenticator Code</Text>
                  <AutoScrollTextInput
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    onBeforeAutoScroll={handleFieldFocus}
                    onChangeText={(value) => onChangeField('two_factor_code', value)}
                    scrollViewRef={scrollViewRef}
                    style={[styles.profileInput, styles.onboardingInput]}
                    value={loginForm.two_factor_code}
                  />
                  <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>Enter the 6-digit code from your authenticator app to finish signing in.</Text>
                </>
              ) : null}

              <Pressable disabled={submitting} onPress={handleSubmitAuth} style={[styles.linkButton, styles.onboardingPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
                <LoadingButtonLabel
                  color={theme.textDark}
                  label={loginPortal === 'customer' ? 'Log in as Customer' : 'Log in as Business'}
                  loading={submitting}
                  textStyle={[styles.linkButtonText, styles.onboardingPrimaryButtonText]}
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
                    styles.onboardingRecoveryPanel,
                    {
                      opacity: recoveryFade,
                      transform: [{ translateY: recoveryTranslateY }],
                    },
                  ]}
                >
                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>{recoveryMode === 'username' ? 'Account email' : 'Username or email'}</Text>
                  <AutoScrollTextInput
                    autoCapitalize="none"
                    autoFocus
                    keyboardType={recoveryMode === 'username' ? 'email-address' : 'default'}
                    onBeforeAutoScroll={handleFieldFocus}
                    onChangeText={setRecoveryValue}
                    placeholder={recoveryMode === 'username' ? 'Enter your account email' : 'Enter your username or email'}
                    placeholderTextColor={onboardingPlaceholderTextColor}
                    scrollViewRef={scrollViewRef}
                    style={[styles.profileInput, styles.onboardingInput]}
                    value={recoveryValue}
                  />
                  <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>
                    {recoveryMode === 'username'
                      ? 'We will email the username tied to this account.'
                      : 'We will send a password reset link if that account exists.'}
                  </Text>
                  <View style={styles.authRecoveryPanelActions}>
                    <Pressable onPress={handleSubmitRecovery} style={[styles.linkButtonSecondaryWide, styles.onboardingSecondaryButton, submitting ? styles.linkButtonDisabled : null]}>
                      <LoadingButtonLabel
                        color={theme.textDark}
                        label={recoveryMode === 'username' ? 'Email my username' : 'Send password reset link'}
                        loading={submitting}
                        textStyle={[styles.linkButtonSecondaryText, styles.onboardingSecondaryButtonText]}
                      />
                    </Pressable>
                    <Pressable onPress={handleCloseRecovery} style={styles.authRecoveryDismissButton}>
                      <Text style={styles.authRecoveryDismissText}>Cancel</Text>
                    </Pressable>
                  </View>
                </Animated.View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function CreateProfileScreen({ errorMessage, form, isLandscape, message, onBack, onChangeField, onOpenBusinessClaim, onSubmit, submitting }: CreateProfileScreenProps) {
  const { handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  useScrollToTopOnError(errorMessage, scrollToTop);

  function handleSubmitCreateProfile() {
    scrollToTop();
    void onSubmit();
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <OnboardingBackButton label="Back" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.onboardingCard]}>
            <Text style={[styles.detailCity, styles.onboardingEyebrow]}>Create Profile</Text>
            <Text style={[styles.detailTitle, styles.onboardingHeading]}>Create a customer account</Text>
            <Text style={[styles.profileIntroText, styles.onboardingBodyText]}>Customer accounts now move into a short email code check after signup before the dashboard unlocks.</Text>

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

            <View style={styles.profileFormSection}>
              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Username</Text>
              <AutoScrollTextInput autoCapitalize="none" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('username', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.username} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Email</Text>
              <AutoScrollTextInput autoCapitalize="none" keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('email', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.email} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Password</Text>
              <PasswordField inputStyle={styles.onboardingInput} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={form.password} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Confirm password</Text>
              <PasswordField inputStyle={styles.onboardingInput} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('confirm_password', value)} scrollViewRef={scrollViewRef} value={form.confirm_password} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>First name</Text>
              <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('first_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.first_name} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Last name</Text>
              <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('last_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.last_name} />
            </View>

            <Pressable onPress={handleSubmitCreateProfile} style={[styles.linkButton, styles.onboardingPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel color={theme.textDark} label="Create customer profile" loading={submitting} textStyle={[styles.linkButtonText, styles.onboardingPrimaryButtonText]} />
            </Pressable>

            <Pressable onPress={onOpenBusinessClaim} style={[styles.linkButtonSecondaryWide, styles.onboardingSecondaryButton]}>
              <Text style={[styles.linkButtonSecondaryText, styles.onboardingSecondaryButtonText]}>Claim a Business</Text>
            </Pressable>
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
  const { handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  useScrollToTopOnError(errorMessage, scrollToTop);

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
    scrollToTop();
    void onSubmit();
  }

  function handleResendVerificationCode() {
    scrollToTop();
    void onResend();
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <OnboardingBackButton label="Back to login" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.onboardingCard]}>
            <Text style={[styles.detailCity, styles.onboardingEyebrow]}>Email Verification</Text>
            <Text style={[styles.detailTitle, styles.onboardingHeading]}>Enter your 6-digit code</Text>
            <Text style={[styles.profileIntroText, styles.onboardingBodyText]}>
              {pendingVerification?.email
                ? `We sent a code to ${pendingVerification.email}. Enter it before it expires to unlock your dashboard.`
                : 'We sent a code to your email. Enter it before it expires to unlock your dashboard.'}
            </Text>

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

            <View style={styles.profileFormSection}>
              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Verification code</Text>
              <AutoScrollTextInput
                autoCapitalize="none"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                onBeforeAutoScroll={handleFieldFocus}
                onChangeText={(value) => onChangeCode(value.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                placeholderTextColor={onboardingPlaceholderTextColor}
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.verificationCodeInput, styles.onboardingInput]}
                textContentType="oneTimeCode"
                value={verificationCode}
              />

              {secondsRemaining > 0 ? (
                <Text style={styles.verificationCountdownText}>
                  Code expires in {formatVerificationCountdown(secondsRemaining)}
                </Text>
              ) : (
                <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>Your last code expired. Request a new one to continue.</Text>
              )}

              <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>
                Username: {pendingVerification?.username ?? 'Unavailable'}
              </Text>
            </View>

            <Pressable onPress={handleSubmitVerificationCode} style={[styles.linkButton, styles.onboardingPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel color={theme.textDark} label="Verify email and continue" loading={submitting} textStyle={[styles.linkButtonText, styles.onboardingPrimaryButtonText]} />
            </Pressable>

            <Pressable
              disabled={secondsRemaining > 0 || submitting}
              onPress={handleResendVerificationCode}
              style={[styles.linkButtonSecondaryWide, styles.onboardingSecondaryButton, secondsRemaining > 0 || submitting ? styles.linkButtonDisabled : null]}
            >
              <Text style={[styles.linkButtonSecondaryText, styles.onboardingSecondaryButtonText]}>Resend verification code</Text>
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
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <OnboardingBackButton label="Back to login" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.onboardingCard]}>
            <Text style={[styles.detailCity, styles.onboardingEyebrow]}>Business claim status</Text>
            <Text style={[styles.detailTitle, styles.onboardingHeading]}>{reviewTitle}</Text>
            <Text style={[styles.profileIntroText, styles.onboardingBodyText]}>{reviewMessage}</Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={[styles.dashboardSectionCard, styles.onboardingInfoCard]}>
              <Text style={[styles.dashboardSectionTitle, styles.onboardingInfoTitle]}>Review details</Text>
              <Text style={[styles.dashboardSupportText, styles.onboardingInfoText]}>Business: {businessName}</Text>
              <Text style={[styles.dashboardSupportText, styles.onboardingInfoText]}>Claim status: {reviewStatus}</Text>
              <Text style={[styles.dashboardSupportText, styles.onboardingInfoText]}>Account email: {session?.email || 'Unavailable'}</Text>
            </View>

            <View style={[styles.dashboardCalloutCard, styles.onboardingInfoCard]}>
              <Text style={[styles.dashboardSectionTitle, styles.onboardingInfoTitle]}>What happens next</Text>
              <Text style={[styles.dashboardSupportText, styles.onboardingInfoText]}>DiningDealz will send an approval or rejection email after manual review is complete.</Text>
              <Text style={[styles.dashboardSupportText, styles.onboardingInfoText]}>Business dashboard access stays locked until the claim is approved.</Text>
            </View>

            <Pressable onPress={onBack} style={[styles.linkButton, styles.onboardingPrimaryButton]}>
              <Text style={[styles.linkButtonText, styles.onboardingPrimaryButtonText]}>Return to login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function ContactSupportScreen({ errorMessage, initialMessage = '', initialSubject = 'DiningDealz support request', isLandscape, message: successMessage, onBack, onSubmit, session, submitting }: ContactSupportScreenProps) {
  const { handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState(initialMessage);
  useScrollToTopOnError(errorMessage, scrollToTop);

  useEffect(() => {
    setSubject(initialSubject);
  }, [initialSubject]);

  useEffect(() => {
    setMessage(initialMessage);
  }, [initialMessage]);

  function handleSubmitSupport() {
    scrollToTop();
    onSubmit(subject, message);
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
              <Text style={[styles.dashboardSupportText, styles.onboardingInfoText]}>Best for account help, business onboarding, verification issues, billing questions, or general app support.</Text>
            </View>

            <View style={styles.profileFormSection}>
              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Subject</Text>
              <AutoScrollTextInput
                onBeforeAutoScroll={handleFieldFocus}
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
      sections={[
        {
          title: 'Information you provide',
          body: 'DiningDealz collects the information users submit directly, including account details such as username, email address, password, portal type, and profile edits. Business users may also submit claim and onboarding materials such as contact details, work information, verification summaries, social links, public business profile content, uploaded photos, and supporting documents. Users may also send support messages and direct messages, including business-sent direct message images.',
        },
        {
          title: 'Information collected through use of the service',
          body: 'DiningDealz creates and stores service data needed to run the platform, including authentication tokens, email verification status, password reset and two-factor authentication state, favorite businesses, business notification history, direct message threads and receipts, business claim status, feed impression and engagement records, sponsored campaign delivery metrics, and push-device registration details. If an approved service-area or mobile business enables live location features, DiningDealz also stores the business location updates sent from that account.',
        },
        {
          title: 'Website, device, and technical information',
          body: 'The website may process browser and request data needed to secure and operate the service. Web login and contact forms use Cloudflare Turnstile to reduce abuse. The web dashboard stores the signed-in session token in browser localStorage on that device. DiningDealz may also receive technical diagnostics, error reports, IP-related request information, and device or app identifiers from hosting, storage, security, and monitoring providers used to operate the platform.',
        },
        {
          title: 'How DiningDealz uses information',
          body: 'DiningDealz uses information to create and manage accounts, authenticate sign-ins, send verification and password-reset messages, provide business claim review and account support, operate direct messaging, deliver push notifications, power favorites and feed features, review abuse or misuse, maintain billing-related access where applicable, and improve the reliability and safety of the app and website.',
        },
        {
          title: 'How information may be shared',
          body: 'DiningDealz does not sell personal information as part of the standard product experience. Information may be shared with service providers that help operate the platform, such as hosting, database, media storage, email delivery, bot-protection, error-monitoring, mapping, and push-notification providers. Information may also be disclosed when reasonably necessary to enforce the service rules, protect users or businesses, respond to legal requests, or address fraud, security, or safety issues.',
        },
        {
          title: 'Retention, deletion, and direct-message records',
          body: 'DiningDealz keeps information for as long as reasonably needed to operate the service, support business records, resolve disputes, enforce policies, and meet legal obligations. If an account is deleted, certain information may be removed or anonymized, but some records may be retained to preserve service integrity. For example, direct message threads and receipts may remain available in read-only form for the other participant after one account is deleted. Business direct-message images are designed to disappear from the conversation feed after about 24 hours and may be deleted from storage after they expire.',
        },
        {
          title: 'Your choices and contact options',
          body: 'Users can update certain profile details from the product interface, manage direct-messaging settings where available, control device permissions such as notifications or business location access through the device or app settings, and request account deletion from inside the app. Users can also contact DiningDealz support for account, privacy, or policy questions.',
        },
      ]}
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
      sections={[
        {
          title: 'Eligibility and account responsibility',
          body: 'Users are responsible for the accuracy of the information they submit and for activity that occurs through their account credentials. Users must use DiningDealz only for lawful purposes and in a way that does not interfere with the service, other users, or participating businesses.',
        },
        {
          title: 'Listings, offers, and business content',
          body: 'DiningDealz displays business listings, deals, hours, profile information, notifications, and promotional content, but those details can change. DiningDealz does not guarantee uninterrupted availability, accuracy, or redemption of every listing, offer, or feature. Businesses remain responsible for the accuracy of the information they submit and for honoring the offers and public content they publish through the service.',
        },
        {
          title: 'Direct messages, uploads, and user content',
          body: 'Customers and businesses may use direct messaging only as allowed by the product rules in effect at the time of use. Business accounts may send approved direct-message images, and those images are intended to disappear from the message feed after about 24 hours. Users must not submit unlawful, abusive, infringing, deceptive, or harmful content. By submitting content through DiningDealz, users authorize DiningDealz to host, process, display, transmit, and moderate that content as needed to operate and protect the service.',
        },
        {
          title: 'Business claims, verification, and location features',
          body: 'Business users must submit accurate claim, contact, and verification information and may only claim or manage businesses they are authorized to represent. DiningDealz may review, request more information about, approve, reject, limit, or remove claims or related content. If a business uses service-area or mobile location features, the business is responsible for sending accurate location updates and for using those features only with proper permission and authority.',
        },
        {
          title: 'Notifications, billing, and paid features',
          body: 'DiningDealz may send account, support, verification, favorite-business, business-post, or direct-message related notifications. Some business features may be limited to approved or paid accounts. If paid offerings, billing portals, subscriptions, boosted content, or campaign tools are enabled, the pricing, renewal, cancellation, and feature-specific terms presented for that offering will control in addition to these Terms.',
        },
        {
          title: 'Suspension, termination, and retained records',
          body: 'DiningDealz may suspend, restrict, or terminate access when necessary to protect the service or enforce these Terms. Users may also delete their own accounts through supported product flows. Even after deletion or termination, DiningDealz may retain records reasonably necessary to preserve conversation history for the remaining participant, maintain business records, investigate misuse, enforce agreements, or comply with legal obligations.',
        },
        {
          title: 'Disclaimers, liability limits, and changes',
          body: 'DiningDealz is provided on an as-available basis to the extent permitted by law. To the fullest extent permitted by law, DiningDealz disclaims warranties not expressly made and is not responsible for indirect, incidental, or consequential losses arising from use of the service, participating businesses, third-party providers, or changing deal availability. DiningDealz may modify, suspend, or retire features or update these Terms as the platform evolves, and continued use after an update takes effect constitutes acceptance of the revised Terms to the extent permitted by law.',
        },
      ]}
      title="Rules for using DiningDealz services."
    />
  );
}

export function BusinessSearchScreen({ errorMessage, isLandscape, loadingPlaces, onBack, onChangeSearchQuery, onChooseInformalBusiness, onChooseManualBusiness, onSelectBusiness, results, searchQuery }: BusinessSearchScreenProps) {
  const { handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  useScrollToTopOnError(errorMessage, scrollToTop);

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.profileScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <OnboardingBackButton label="Back to create profile" onPress={onBack} style={{ marginLeft: -8 }} />
          </View>

          <View style={[styles.profileCard, styles.onboardingCard]}>
            <Text style={[styles.detailCity, styles.onboardingEyebrow]}>Claim a Business</Text>
            <Text style={[styles.detailTitle, styles.onboardingHeading]}>Search your business</Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} placeholder="Search by business name" placeholderTextColor={onboardingPlaceholderTextColor} onChangeText={onChangeSearchQuery} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={searchQuery} />

            {normalizeSearchText(searchQuery).length === 0 ? (
              <Text style={[styles.centerStateText, styles.onboardingInfoTextMuted]}>Start typing to search for your business.</Text>
            ) : loadingPlaces ? (
              <Text style={[styles.centerStateText, styles.onboardingInfoTextMuted]}>Loading businesses...</Text>
            ) : (
              <View style={styles.claimResultsList}>
                {results.length ? (
                  results.map((place) => (
                    <View key={place.slug} style={[styles.claimResultCard, styles.onboardingInfoCard]}>
                      <Text style={styles.placeTitle}>{place.name}</Text>
                      <Text style={styles.placeMeta}>{place.venue_type_label}</Text>
                      <Text style={[styles.claimBusinessHint, styles.onboardingInfoText]}>
                        {getPlaceLocations(place).length > 1 ? 'Choose the specific address to verify this claim.' : 'Choose this address to continue to verification.'}
                      </Text>
                      <View style={styles.claimLocationList}>
                        {getPlaceLocations(place).map((location) => (
                          <Pressable
                            key={location.id}
                            onPress={() => onSelectBusiness(place, location.id)}
                            style={[styles.claimLocationButton, styles.onboardingSecondaryButton]}
                          >
                            <Text style={[styles.claimLocationButtonTitle, styles.onboardingInfoTitle]}>{location.city_label}</Text>
                            <Text style={[styles.claimLocationButtonText, styles.onboardingInfoText]}>{formatPlaceAddress(location)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.centerStateText, styles.onboardingInfoTextMuted]}>No matching businesses found yet.</Text>
                )}
              </View>
            )}

            <Pressable onPress={onChooseManualBusiness} style={styles.authLinkButton}>
              <Text style={styles.authLinkText}>Can&apos;t find your business? Create a business profile for an established business here.</Text>
            </Pressable>

            <Pressable onPress={onChooseInformalBusiness} style={styles.authLinkButton}>
              <Text style={styles.authLinkText}>For Small Startups & Vendors, create your profile here.</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function BusinessVerificationScreen({ attachments, errorMessage, form, isLandscape, lockAccountIdentityFields = false, mode, onAddAttachments, onAddPhotoUploads, onBack, onChangeField, onRemoveAttachment, onRemoveCurrentPhoto, onRemovePhotoUpload, onToggleAddressNotApplicable, onSubmit, photoUploads, selectedLocation, selectedPlace, submitting }: BusinessVerificationScreenProps) {
  const isClaimed = mode === 'claimed';
  const isEstablished = mode === 'manual';
  const isInformal = mode === 'informal';
  const servesMultipleAreas = form.business_city === 'multiple_areas';
  const requiresHealthPermit = ['restaurant', 'fast_food', 'cafe'].includes(form.business_venue_type);
  const requiresAbcLicense = form.business_venue_type === 'bar';
  const [openDropdown, setOpenDropdown] = useState<'city' | 'venue' | 'job' | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(false);
  const attachmentPreviewRequestIdRef = useRef(0);
  const { handleFieldFocus, handleScroll, scrollToTop, scrollViewRef } = useAutoScrollForm();
  useScrollToTopOnError(errorMessage, scrollToTop);
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
    attachmentPreviewRequestIdRef.current += 1;
    setAttachmentPreviewLoading(false);
    setAttachmentPreview(null);
  }

  async function handleOpenAttachment(uri: string, mimeType: string | null, attachmentName: string) {
    if (!uri) {
      return;
    }

    const previewKind = getAttachmentPreviewKind(mimeType, attachmentName);
    if (previewKind === 'image') {
      setAttachmentPreviewLoading(false);
      setAttachmentPreview({ kind: 'image', name: attachmentName, uri });
      return;
    }

    if (previewKind === 'pdf') {
      const requestId = attachmentPreviewRequestIdRef.current + 1;
      attachmentPreviewRequestIdRef.current = requestId;
      setAttachmentPreviewLoading(true);
      setAttachmentPreview(null);
      try {
        const base64Document = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        if (attachmentPreviewRequestIdRef.current !== requestId) {
          return;
        }
        setAttachmentPreview({
          kind: 'pdf',
          name: attachmentName,
          html: buildPdfPreviewHtml(base64Document, attachmentName),
        });
        return;
      } catch {
        if (attachmentPreviewRequestIdRef.current !== requestId) {
          return;
        }
        await openAttachmentExternally(uri, mimeType, attachmentName);
        return;
      } finally {
        if (attachmentPreviewRequestIdRef.current === requestId) {
          setAttachmentPreviewLoading(false);
        }
      }
    }

    await openAttachmentExternally(uri, mimeType, attachmentName);
  }

  function renderMultilineField(field: keyof ProfileFormState, label: string, value: string, options?: { placeholder?: string; support?: string }) {
    return (
      <>
        <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>{label}</Text>
        <AutoScrollTextInput
          multiline
          onBeforeAutoScroll={handleFieldFocus}
          onChangeText={(nextValue) => onChangeField(field, nextValue)}
          placeholder={options?.placeholder}
          placeholderTextColor={onboardingPlaceholderTextColor}
          scrollViewRef={scrollViewRef}
          style={[styles.profileInput, styles.profileTextarea, styles.onboardingInput]}
          textAlignVertical="top"
          value={value}
        />
        {options?.support ? <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>{options.support}</Text> : null}
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
        <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>{SOCIAL_PLATFORM_LABELS[platform]}</Text>
        <AutoScrollTextInput
          autoCapitalize="none"
          onBeforeAutoScroll={handleFieldFocus}
          onChangeText={(value) => onChangeField(field, value)}
          placeholder={placeholder}
          placeholderTextColor={onboardingPlaceholderTextColor}
          scrollViewRef={scrollViewRef}
          style={[styles.profileInput, styles.onboardingInput]}
          value={fieldValue}
        />
        {fieldError ? <Text style={styles.structuredEntryErrorText}>{fieldError}</Text> : null}
        {!fieldError && preview ? <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>{`Displays as ${preview}`}</Text> : null}
      </View>
    );
  }

  function handleSubmitVerification() {
    scrollToTop();
    if (Object.values(socialFieldErrors).some(Boolean)) {
      return;
    }

    onSubmit();
  }

  function renderAttachmentPicker(kind: BusinessAttachmentKind, label: string, support?: string) {
    const selectedAttachments = attachments[kind];

    return (
      <View style={styles.attachmentSection}>
        <Pressable onPress={() => onAddAttachments(kind)} style={[styles.linkButtonSecondary, styles.onboardingSecondaryButton, styles.attachmentPickerButton]}>
          <Text style={[styles.linkButtonSecondaryText, styles.onboardingSecondaryButtonText]}>{selectedAttachments.length ? `Add more to ${label}` : `Attach files to ${label}`}</Text>
        </Pressable>
        {support ? <Text style={[styles.profileSupportText, styles.onboardingBodyText, styles.attachmentSupportText]}>{support}</Text> : null}
        {selectedAttachments.length ? (
          <View style={styles.attachmentList}>
            {selectedAttachments.map((attachment) => (
              <View key={attachment.id} style={[styles.attachmentCard, styles.onboardingInfoCard]}>
                <Pressable onPress={() => void handleOpenAttachment(attachment.uri, attachment.mimeType, attachment.name)} style={styles.attachmentPreviewButton}>
                  <View style={styles.attachmentMeta}>
                    <Text numberOfLines={1} style={[styles.attachmentName, styles.onboardingInfoTitle]}>{attachment.name}</Text>
                    <Text style={[styles.attachmentDetail, styles.onboardingInfoText]}>{attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB • Tap to view` : 'Selected file • Tap to view'}</Text>
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
      <Modal animationType="slide" onRequestClose={handleCloseAttachmentPreview} transparent visible={attachmentPreview !== null || attachmentPreviewLoading}>
        <View style={styles.attachmentPreviewOverlay}>
          <View style={styles.attachmentPreviewSheet}>
            <View style={styles.attachmentPreviewHeader}>
              <Text numberOfLines={1} style={styles.attachmentPreviewTitle}>{attachmentPreview?.name ?? 'Preparing preview...'}</Text>
              <Pressable onPress={handleCloseAttachmentPreview} style={styles.attachmentPreviewCloseButton}>
                <Text style={styles.attachmentPreviewCloseButtonText}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.attachmentPreviewBody}>
              {attachmentPreviewLoading ? (
                <View style={styles.attachmentPreviewLoadingState}>
                  <ActivityIndicator color="#9e5b49" size="large" />
                  <Text style={styles.attachmentPreviewLoadingText}>Preparing document preview...</Text>
                </View>
              ) : attachmentPreview?.kind === 'image' ? (
                <Image resizeMode="contain" source={{ uri: attachmentPreview.uri }} style={styles.attachmentPreviewImage} />
              ) : attachmentPreview?.kind === 'pdf' ? (
                <WebView originWhitelist={["*"]} source={{ html: attachmentPreview.html }} style={styles.attachmentPreviewWebView} />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.profileScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <OnboardingBackButton label="Back" onPress={onBack} />
          </View>

          <View style={[styles.profileCard, styles.onboardingCard]}>
            <Text style={[styles.detailCity, styles.onboardingEyebrow]}>Verification</Text>
            <Text style={[styles.detailTitle, styles.onboardingHeading]}>{verificationTitle}</Text>
            <Text style={[styles.profileIntroText, styles.onboardingBodyText]}>{verificationIntro}</Text>

            {isClaimed && selectedPlace ? (
              <View style={[styles.claimResultCard, styles.onboardingInfoCard]}>
                <Text style={styles.placeTitle}>{selectedPlace.name}</Text>
                <Text style={styles.placeMeta}>{selectedPlace.venue_type_label}</Text>
                {selectedLocation ? (
                  <>
                    <Text style={[styles.claimBusinessHint, styles.onboardingInfoText]}>Selected address</Text>
                    <Text style={[styles.claimLocationButtonText, styles.onboardingInfoText]}>{formatPlaceAddress(selectedLocation)}</Text>
                  </>
                ) : null}
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.profileFormSection}>
              {!isClaimed ? (
                <>
                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Business name</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('business_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.business_name} />

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>City</Text>
                  <CompactDropdown
                    onSelect={(value) => handleSelectDropdownValue('business_city', value)}
                    onToggle={() => setOpenDropdown((current) => current === 'city' ? null : 'city')}
                    open={openDropdown === 'city'}
                    options={[{ label: 'Select a city', value: '' }, ...manualBusinessCityOptions]}
                    placeholder="Select a city or service area"
                    selectedValue={form.business_city}
                  />

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Business type</Text>
                  <CompactDropdown
                    onSelect={(value) => handleSelectDropdownValue('business_venue_type', value)}
                    onToggle={() => setOpenDropdown((current) => current === 'venue' ? null : 'venue')}
                    open={openDropdown === 'venue'}
                    options={[{ label: 'Select a business type', value: '' }, ...manualBusinessVenueOptions]}
                    placeholder="Select a business type"
                    selectedValue={form.business_venue_type}
                  />

                  {servesMultipleAreas ? (
                    <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>It is highly recommend for small startups and vendors that do not have a dedicated business address to turn on location services for DiningDealz after account is verified so you have can a business pin on the map.</Text>
                  ) : null}

                </>
              ) : null}

              {lockAccountIdentityFields ? (
                <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>Your username, email, and name are locked because this claim is attached to your existing customer account.</Text>
              ) : null}

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Username</Text>
              <AutoScrollTextInput autoCapitalize="none" editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('username', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.username} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Email</Text>
              <AutoScrollTextInput autoCapitalize="none" editable={!lockAccountIdentityFields} keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('email', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.email} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Password</Text>
              <PasswordField inputStyle={styles.onboardingInput} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={form.password} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Confirm password</Text>
              <PasswordField inputStyle={styles.onboardingInput} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('confirm_password', value)} scrollViewRef={scrollViewRef} value={form.confirm_password} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>First name</Text>
              <AutoScrollTextInput editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('first_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.first_name} />

              <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Last name</Text>
              <AutoScrollTextInput editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('last_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.last_name} />

              {!isInformal ? (
                <>
                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Contact name</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('contact_name', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.contact_name} />

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Role</Text>
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

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Employer email</Text>
                  <AutoScrollTextInput autoCapitalize="none" keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('work_email', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.work_email} />

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Employer phone</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('work_phone', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.work_phone} />

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>{isEstablished && servesMultipleAreas ? 'Business address (optional for multi-area businesses)' : 'Business address'}</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('employer_address', value)} scrollViewRef={scrollViewRef} style={[styles.profileInput, styles.onboardingInput]} value={form.employer_address} />

                  {isEstablished && servesMultipleAreas ? (
                    <Pressable onPress={() => onToggleAddressNotApplicable(!form.address_not_applicable)} style={[styles.toggleChip, styles.onboardingChip, form.address_not_applicable ? styles.toggleChipActive : null]}>
                      <Text style={[styles.toggleChipText, styles.onboardingChipText, form.address_not_applicable ? styles.toggleChipTextActive : null]}>Address Not Applicable</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              <View style={styles.profileFormSection}>
                <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Website</Text>
                <AutoScrollTextInput
                  autoCapitalize="none"
                  onBeforeAutoScroll={handleFieldFocus}
                  onChangeText={(value) => onChangeField('business_website_url', value)}
                  placeholder="yourbusiness.com"
                  placeholderTextColor={onboardingPlaceholderTextColor}
                  scrollViewRef={scrollViewRef}
                  style={[styles.profileInput, styles.onboardingInput]}
                  value={form.business_website_url}
                />
                {socialFieldErrors.website ? <Text style={styles.structuredEntryErrorText}>{socialFieldErrors.website}</Text> : null}
                {!socialFieldErrors.website && getSocialProfilePreview('website', form.business_website_url) ? (
                  <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>{`Displays as ${getSocialProfilePreview('website', form.business_website_url)}`}</Text>
                ) : (
                  <Text style={[styles.profileSupportText, styles.onboardingBodyText]}>Paste a full website URL or domain. The public profile shows the site domain instead of the raw link.</Text>
                )}
                {businessSocialFieldDefinitions.map((definition) => renderSocialProfileField(definition.field, definition.platform))}
              </View>

              <BusinessDealsEditor
                label="Deals, discounts, or specials"
                onChange={(value) => onChangeField('deal_overrides', value)}
                supportText={isClaimed
                  ? 'Existing public deals prefill here when available. Edit the actual deal cards instead of adding plain text that only appears in a separate section.'
                  : 'Build each deal the way it will appear on the business profile, including its day and time windows.'}
                value={form.deal_overrides}
              />

              <BusinessHoursEditor
                label="Hours of operation"
                onChange={(value) => onChangeField('operating_hour_overrides', value)}
                supportText={isClaimed
                  ? 'Existing public hours prefill here when available. Update the displayed schedule directly instead of adding extra text below it.'
                  : 'Add business hours by day so the public profile can render the same grouped schedule cards shown to users.'}
                value={form.operating_hour_overrides}
              />

              <View style={styles.attachmentSection}>
                <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Business photos</Text>
                <Pressable
                  disabled={remainingPhotoSlots <= 0}
                  onPress={onAddPhotoUploads}
                  style={[styles.linkButtonSecondary, styles.onboardingSecondaryButton, styles.attachmentPickerButton, remainingPhotoSlots <= 0 ? styles.linkButtonDisabled : null]}
                >
                  <Text style={[styles.linkButtonSecondaryText, styles.onboardingSecondaryButtonText]}>
                    {currentPhotoUrls.length || photoUploads.length ? 'Add more photos from Photo Library' : 'Select photos from Photo Library'}
                  </Text>
                </Pressable>
                <Text style={[styles.profileSupportText, styles.onboardingBodyText, styles.attachmentSupportText]}>
                  {isClaimed
                    ? 'Existing business photos prefill here when available. You can remove them or add up to 8 total photos from the photo library.'
                    : 'Upload up to 8 business photos from the photo library. Camera capture is not used here.'}
                </Text>
                {currentPhotoUrls.length ? (
                  <>
                    <Text style={[styles.attachmentGalleryLabel, styles.onboardingLabel]}>Current public photos</Text>
                    <ScrollView
                      contentContainerStyle={styles.photoGalleryRow}
                      horizontal
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
                    <Text style={[styles.attachmentGalleryLabel, styles.onboardingLabel]}>Selected photos</Text>
                    <ScrollView
                      contentContainerStyle={styles.photoGalleryRow}
                      horizontal
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
                            <Text numberOfLines={1} style={[styles.attachmentName, styles.onboardingInfoTitle]}>{attachment.name}</Text>
                            <Text style={[styles.attachmentDetail, styles.onboardingInfoText]}>{formatAttachmentSize(attachment.size)}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
              </View>

              {!isInformal ? (
                <>
                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Business registration documents</Text>
                  {renderAttachmentPicker('business_registration', 'business registration documents', 'Attach one or more business registration files.')}

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Proof of authority</Text>
                  {renderAttachmentPicker('proof_of_authority', 'proof of authority', 'Attach a work badge, payroll stub, authorization letter, or similar proof that you represent this business.')}

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>{requiresHealthPermit ? 'Health permit documents' : 'Health permit documents (if applicable)'}</Text>
                  {renderAttachmentPicker('health_permit', 'health permit documents', 'Attach one or more health permit files when they apply to this business type.')}

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>{requiresAbcLicense ? 'ABC license documents' : 'ABC license documents (bars only)'}</Text>
                  {renderAttachmentPicker('abc_license', 'ABC license documents', 'Attach one or more ABC license files when required.')}

                  <Text style={[styles.profileFieldLabel, styles.onboardingLabel]}>Proof of address control (optional)</Text>
                  {renderAttachmentPicker('proof_of_address_control', 'proof of address control', 'Attach leases, utility documents, or similar supporting files if needed.')}

                  {renderMultilineField(
                    'supporting_details',
                    'Anything else for review? (optional)',
                    form.supporting_details,
                    {
                      placeholder: 'Add any context the review team should know.',
                    },
                  )}
                </>
              ) : null}

              {isInformal ? renderMultilineField(
                'supporting_details',
                'Tell us about your business',
                form.supporting_details,
                {
                  placeholder: 'Briefly explain how you operate, where customers can find you, and anything that helps verify the business.',
                  support: 'Keep this short. Small startups and vendors need a quick summary plus at least one social link, website, or photo reference before submission.',
                },
              ) : null}
            </View>

            <Pressable onPress={() => void handleSubmitVerification()} style={[styles.linkButton, styles.onboardingPrimaryButton, submitting ? styles.linkButtonDisabled : null]}>
              <LoadingButtonLabel color={theme.textDark} label={submitLabel} loading={submitting} textStyle={[styles.linkButtonText, styles.onboardingPrimaryButtonText]} />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}
