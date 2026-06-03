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
import { manualBusinessCityOptions, manualBusinessVenueOptions } from '../browseConfig';
import { formatPlaceAddress, getPlaceLocations, normalizeSearchText } from '../placeHelpers';
import type { BusinessAttachmentBuckets, BusinessAttachmentKind, EmailVerificationChallengeResponse, PlaceListItem, PlaceLocation, SignupResponse } from '../types';

const SUPPORT_EMAIL = 'support@diningdealz.com';

type CompactDropdownProps = {
  onSelect: (value: string) => void;
  open: boolean;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
  selectedValue: string;
  onToggle: () => void;
};

type StructuredListField = 'social_media_links_text' | 'offer_entries_text' | 'hours_of_operation_entries_text' | 'photo_references_text';

type AttachmentPreviewState =
  | { kind: 'image'; name: string; uri: string }
  | { kind: 'pdf'; name: string; html: string };

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
                const viewport = page.getViewport({ scale: 1.25 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const wrapper = document.createElement('div');
                wrapper.className = 'page';
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
  onChangeField: (field: keyof ProfileFormState, value: string) => void;
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
  onBack: () => void;
  onChangeField: (field: keyof ProfileFormState, value: string) => void;
  onRemoveAttachment: (kind: BusinessAttachmentKind, attachmentId: string) => void;
  onToggleAddressNotApplicable: (value: boolean) => void;
  onSubmit: () => void;
  selectedLocation: PlaceLocation | null;
  selectedPlace: PlaceListItem | null;
  submitting: boolean;
};

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
  onBack: () => void;
  session: SignupResponse;
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
  scrollViewRef: RefObject<ScrollView | null>;
};

type PasswordFieldProps = {
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

  return {
    handleFieldFocus,
    handleScroll,
    scrollViewRef,
  };
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

function PasswordField({ onBeforeAutoScroll, onChangeText, scrollViewRef, value }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={styles.passwordFieldRow}>
      <AutoScrollTextInput
        onBeforeAutoScroll={onBeforeAutoScroll}
        onChangeText={onChangeText}
        scrollViewRef={scrollViewRef}
        secureTextEntry={!isVisible}
        style={[styles.profileInput, styles.passwordFieldInput]}
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
      <Pressable onPress={handleToggle} style={[styles.compactDropdownButton, open ? styles.compactDropdownButtonOpen : null]}>
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
  const { handleFieldFocus, handleScroll, scrollViewRef } = useAutoScrollForm();
  const [recoveryMode, setRecoveryMode] = useState<AuthRecoveryMode>(null);
  const [recoveryValue, setRecoveryValue] = useState('');
  const recoveryFade = useRef(new Animated.Value(0)).current;
  const recoveryTranslateY = useRef(new Animated.Value(-14)).current;

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
    if (recoveryMode === 'username') {
      onForgotUsername(recoveryValue);
      return;
    }

    if (recoveryMode === 'password') {
      onForgotPassword(recoveryValue);
    }
  }

  return (
    <View style={styles.authScreen}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.authScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <Pressable onPress={onBackToLanding} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          </View>

          <View style={styles.authFormStack}>
            <Text style={styles.detailCity}>{loginPortal === 'customer' ? 'Customer Login' : 'Business Login'}</Text>
            <Text style={styles.detailTitle}>Welcome back</Text>
            <Text style={styles.profileIntroText}>Enter your username and password to continue.</Text>

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

            <Text style={styles.profileFieldLabel}>Username</Text>
            <AutoScrollTextInput autoCapitalize="none" autoFocus={autoFocusIdentifier} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('identifier', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={loginForm.identifier} />

            <Text style={styles.profileFieldLabel}>Password</Text>
            <PasswordField onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={loginForm.password} />

            {showTwoFactorCodeField ? (
              <>
                <Text style={styles.profileFieldLabel}>Authenticator Code</Text>
                <AutoScrollTextInput
                  autoCapitalize="none"
                  keyboardType="number-pad"
                  onBeforeAutoScroll={handleFieldFocus}
                  onChangeText={(value) => onChangeField('two_factor_code', value)}
                  scrollViewRef={scrollViewRef}
                  style={styles.profileInput}
                  value={loginForm.two_factor_code}
                />
                <Text style={styles.profileSupportText}>Enter the 6-digit code from your authenticator app to finish signing in.</Text>
              </>
            ) : null}

            <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonText}>{submitting ? 'Logging in...' : loginPortal === 'customer' ? 'Log in as Customer' : 'Log in as Business'}</Text>
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
                  {
                    opacity: recoveryFade,
                    transform: [{ translateY: recoveryTranslateY }],
                  },
                ]}
              >
                <Text style={styles.profileFieldLabel}>{recoveryMode === 'username' ? 'Account email' : 'Username or email'}</Text>
                <AutoScrollTextInput
                  autoCapitalize="none"
                  autoFocus
                  keyboardType={recoveryMode === 'username' ? 'email-address' : 'default'}
                  onBeforeAutoScroll={handleFieldFocus}
                  onChangeText={setRecoveryValue}
                  placeholder={recoveryMode === 'username' ? 'Enter your account email' : 'Enter your username or email'}
                  placeholderTextColor="#9a7f6c"
                  scrollViewRef={scrollViewRef}
                  style={styles.profileInput}
                  value={recoveryValue}
                />
                <Text style={styles.profileSupportText}>
                  {recoveryMode === 'username'
                    ? 'We will email the username tied to this account.'
                    : 'We will send a password reset link if that account exists.'}
                </Text>
                <View style={styles.authRecoveryPanelActions}>
                  <Pressable onPress={handleSubmitRecovery} style={[styles.linkButtonSecondaryWide, submitting ? styles.linkButtonDisabled : null]}>
                    <Text style={styles.linkButtonSecondaryText}>{submitting ? 'Sending...' : recoveryMode === 'username' ? 'Email my username' : 'Send password reset link'}</Text>
                  </Pressable>
                  <Pressable onPress={handleCloseRecovery} style={styles.authRecoveryDismissButton}>
                    <Text style={styles.authRecoveryDismissText}>Cancel</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function CreateProfileScreen({ errorMessage, form, isLandscape, message, onBack, onChangeField, onOpenBusinessClaim, onSubmit, submitting }: CreateProfileScreenProps) {
  const { handleFieldFocus, handleScroll, scrollViewRef } = useAutoScrollForm();

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to login</Text>
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Create Profile</Text>
            <Text style={styles.detailTitle}>Create a customer account</Text>
            <Text style={styles.profileIntroText}>Customer accounts now move into a short email code check after signup before the dashboard unlocks.</Text>

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
              <Text style={styles.profileFieldLabel}>Username</Text>
              <AutoScrollTextInput autoCapitalize="none" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('username', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.username} />

              <Text style={styles.profileFieldLabel}>Email</Text>
              <AutoScrollTextInput autoCapitalize="none" keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('email', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.email} />

              <Text style={styles.profileFieldLabel}>Password</Text>
              <PasswordField onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={form.password} />

              <Text style={styles.profileFieldLabel}>Confirm password</Text>
              <PasswordField onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('confirm_password', value)} scrollViewRef={scrollViewRef} value={form.confirm_password} />

              <Text style={styles.profileFieldLabel}>First name</Text>
              <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('first_name', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.first_name} />

              <Text style={styles.profileFieldLabel}>Last name</Text>
              <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('last_name', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.last_name} />
            </View>

            <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonText}>{submitting ? 'Submitting...' : 'Create customer profile'}</Text>
            </Pressable>

            <Pressable onPress={onOpenBusinessClaim} style={styles.linkButtonSecondaryWide}>
              <Text style={styles.linkButtonSecondaryText}>Claim a Business</Text>
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
  const { handleFieldFocus, handleScroll, scrollViewRef } = useAutoScrollForm();
  const [secondsRemaining, setSecondsRemaining] = useState(0);

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

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to login</Text>
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Email Verification</Text>
            <Text style={styles.detailTitle}>Enter your 6-digit code</Text>
            <Text style={styles.profileIntroText}>
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
              <Text style={styles.profileFieldLabel}>Verification code</Text>
              <AutoScrollTextInput
                autoCapitalize="none"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                onBeforeAutoScroll={handleFieldFocus}
                onChangeText={(value) => onChangeCode(value.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                placeholderTextColor="#9a7f6c"
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.verificationCodeInput]}
                textContentType="oneTimeCode"
                value={verificationCode}
              />

              {secondsRemaining > 0 ? (
                <Text style={styles.verificationCountdownText}>
                  Code expires in {formatVerificationCountdown(secondsRemaining)}
                </Text>
              ) : (
                <Text style={styles.profileSupportText}>Your last code expired. Request a new one to continue.</Text>
              )}

              <Text style={styles.profileSupportText}>
                Username: {pendingVerification?.username ?? 'Unavailable'}
              </Text>
            </View>

            <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonText}>{submitting ? 'Verifying...' : 'Verify email and continue'}</Text>
            </Pressable>

            <Pressable
              disabled={secondsRemaining > 0 || submitting}
              onPress={() => void onResend()}
              style={[styles.linkButtonSecondaryWide, secondsRemaining > 0 || submitting ? styles.linkButtonDisabled : null]}
            >
              <Text style={styles.linkButtonSecondaryText}>Resend verification code</Text>
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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to login</Text>
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Business claim status</Text>
            <Text style={styles.detailTitle}>{reviewTitle}</Text>
            <Text style={styles.profileIntroText}>{reviewMessage}</Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.dashboardSectionCard}>
              <Text style={styles.dashboardSectionTitle}>Review details</Text>
              <Text style={styles.dashboardSupportText}>Business: {businessName}</Text>
              <Text style={styles.dashboardSupportText}>Claim status: {reviewStatus}</Text>
              <Text style={styles.dashboardSupportText}>Account email: {session?.email || 'Unavailable'}</Text>
            </View>

            <View style={styles.dashboardCalloutCard}>
              <Text style={styles.dashboardSectionTitle}>What happens next</Text>
              <Text style={styles.dashboardSupportText}>DiningDealz will send an approval or rejection email after manual review is complete.</Text>
              <Text style={styles.dashboardSupportText}>Business dashboard access stays locked until the claim is approved.</Text>
            </View>

            <Pressable onPress={onBack} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Return to login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function ContactSupportScreen({ errorMessage, initialMessage = '', initialSubject = 'DiningDealz support request', isLandscape, onBack, session }: ContactSupportScreenProps) {
  const { handleFieldFocus, handleScroll, scrollViewRef } = useAutoScrollForm();
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState(initialMessage);
  const displayName = [session.first_name, session.last_name].filter(Boolean).join(' ') || session.username;

  useEffect(() => {
    setSubject(initialSubject);
  }, [initialSubject]);

  useEffect(() => {
    setMessage(initialMessage);
  }, [initialMessage]);

  async function handleOpenEmailDraft() {
    const body = [
      `Name: ${displayName}`,
      `Username: ${session.username}`,
      `Email: ${session.email}`,
      `Account type: ${session.profile_type}`,
      '',
      message.trim(),
    ].join('\n');
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject.trim() || 'DiningDealz support request')}&body=${encodeURIComponent(body)}`;
    await Linking.openURL(mailtoUrl);
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={[styles.profileScrollContent, styles.createProfileScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to Settings</Text>
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Contact Support</Text>
            <Text style={styles.detailTitle}>Reach the DiningDealz support team</Text>
            <Text style={styles.profileIntroText}>Use this page to prepare a support email with your account details already included, so Apple review and real users both have a clear contact path inside the app.</Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.dashboardSectionCard}>
              <Text style={styles.dashboardSectionTitle}>Direct email</Text>
              <Text style={styles.dashboardDetailValue}>{SUPPORT_EMAIL}</Text>
              <Text style={styles.dashboardSupportText}>Best for account help, business onboarding, verification issues, billing questions, or general app support.</Text>
            </View>

            <View style={styles.profileFormSection}>
              <Text style={styles.profileFieldLabel}>Subject</Text>
              <AutoScrollTextInput
                onBeforeAutoScroll={handleFieldFocus}
                onChangeText={setSubject}
                scrollViewRef={scrollViewRef}
                style={styles.profileInput}
                value={subject}
              />

              <Text style={styles.profileFieldLabel}>Message</Text>
              <AutoScrollTextInput
                multiline
                numberOfLines={7}
                onBeforeAutoScroll={handleFieldFocus}
                onChangeText={setMessage}
                placeholder="Tell us what you need help with."
                placeholderTextColor="#9a7f6c"
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.supportMessageInput]}
                textAlignVertical="top"
                value={message}
              />

              <Text style={styles.profileSupportText}>Your name, username, email, and account type will be added to the email draft automatically.</Text>
            </View>

            <Pressable onPress={() => void handleOpenEmailDraft()} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Open support email draft</Text>
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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to Settings</Text>
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>{eyebrow}</Text>
            <Text style={styles.detailTitle}>{title}</Text>
            <Text style={styles.profileIntroText}>{intro}</Text>

            {sections.map((section) => (
              <View key={section.title} style={styles.legalSectionCard}>
                <Text style={styles.dashboardSectionTitle}>{section.title}</Text>
                <Text style={styles.dashboardSupportText}>{section.body}</Text>
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
      intro="This page outlines the types of information DiningDealz may collect, how that information supports the service, and the controls users have over their data."
      isLandscape={isLandscape}
      onBack={onBack}
      sections={[
        {
          title: 'Information we collect',
          body: 'DiningDealz may collect account details such as usernames, email addresses, profile type, verification state, and business information submitted through signup, claims, contact requests, or dashboard features.',
        },
        {
          title: 'How information is used',
          body: 'Information is used to operate the app and website, authenticate users, send account-related messages, respond to support requests, improve listings, and support business features such as verification and billing access.',
        },
        {
          title: 'Sharing and disclosure',
          body: 'DiningDealz does not sell personal information as part of the standard product experience. Information may be shared with service providers that support operations such as hosting, email delivery, analytics, payment processing, or security, but only as needed to run the platform.',
        },
        {
          title: 'Your choices',
          body: 'Users may contact DiningDealz to request account help, update certain information, or ask privacy-related questions. Where applicable, users may also manage their own account details from the product interface.',
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
      intro="These terms describe the baseline expectations for customers, businesses, and visitors using the DiningDealz app, website, and related services."
      isLandscape={isLandscape}
      onBack={onBack}
      sections={[
        {
          title: 'Use of the platform',
          body: 'DiningDealz may be used only for lawful purposes and in a way that does not interfere with the service, other users, or participating businesses. Account holders are responsible for activity performed through their account credentials.',
        },
        {
          title: 'Business listings and offers',
          body: 'Business information, offers, hours, and promotional details may change. DiningDealz does not guarantee uninterrupted availability of any specific deal, listing, reservation option, or billing feature. Businesses remain responsible for the accuracy of their submitted information and the fulfillment of their published offers.',
        },
        {
          title: 'Accounts and billing',
          body: 'Some features are available only to verified or subscribed business accounts. If billing features are enabled, recurring charges, renewal timing, cancellation terms, and related account controls will be presented within the applicable billing flow or business dashboard.',
        },
        {
          title: 'Changes to the service',
          body: 'DiningDealz may modify, suspend, or retire features as the platform evolves. Continued use of the service after an update takes effect constitutes acceptance of the revised terms to the extent permitted by law.',
        },
      ]}
      title="Rules for using DiningDealz services."
    />
  );
}

export function BusinessSearchScreen({ errorMessage, isLandscape, loadingPlaces, onBack, onChangeSearchQuery, onChooseInformalBusiness, onChooseManualBusiness, onSelectBusiness, results, searchQuery }: BusinessSearchScreenProps) {
  const { handleFieldFocus, handleScroll, scrollViewRef } = useAutoScrollForm();

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.profileScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to create profile</Text>
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Claim a Business</Text>
            <Text style={styles.detailTitle}>Search your business</Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} placeholder="Search by business name" placeholderTextColor="#9a7f6c" onChangeText={onChangeSearchQuery} scrollViewRef={scrollViewRef} style={styles.profileInput} value={searchQuery} />

            {normalizeSearchText(searchQuery).length === 0 ? (
              <Text style={styles.centerStateText}>Start typing to search for your business.</Text>
            ) : loadingPlaces ? (
              <Text style={styles.centerStateText}>Loading businesses...</Text>
            ) : (
              <View style={styles.claimResultsList}>
                {results.length ? (
                  results.map((place) => (
                    <View key={place.slug} style={styles.claimResultCard}>
                      <Text style={styles.placeTitle}>{place.name}</Text>
                      <Text style={styles.placeMeta}>{place.venue_type_label}</Text>
                      <Text style={styles.claimBusinessHint}>
                        {getPlaceLocations(place).length > 1 ? 'Choose the specific address to verify this claim.' : 'Choose this address to continue to verification.'}
                      </Text>
                      <View style={styles.claimLocationList}>
                        {getPlaceLocations(place).map((location) => (
                          <Pressable
                            key={location.id}
                            onPress={() => onSelectBusiness(place, location.id)}
                            style={styles.claimLocationButton}
                          >
                            <Text style={styles.claimLocationButtonTitle}>{location.city_label}</Text>
                            <Text style={styles.claimLocationButtonText}>{formatPlaceAddress(location)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.centerStateText}>No matching businesses found yet.</Text>
                )}
              </View>
            )}

            <Pressable onPress={onChooseManualBusiness} style={styles.authLinkButton}>
              <Text style={styles.authLinkText}>Can&apos;t find your business? Create a business profile for an established business here.</Text>
            </Pressable>

            <Pressable onPress={onChooseInformalBusiness} style={styles.authLinkButton}>
              <Text style={styles.authLinkText}>For Informal Businesses and Vendors, create your profile here.</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function BusinessVerificationScreen({ attachments, errorMessage, form, isLandscape, lockAccountIdentityFields = false, mode, onAddAttachments, onBack, onChangeField, onRemoveAttachment, onToggleAddressNotApplicable, onSubmit, selectedLocation, selectedPlace, submitting }: BusinessVerificationScreenProps) {
  const isClaimed = mode === 'claimed';
  const isEstablished = mode === 'manual';
  const isInformal = mode === 'informal';
  const servesMultipleAreas = form.business_city === 'multiple_areas';
  const requiresHealthPermit = ['restaurant', 'fast_food', 'cafe'].includes(form.business_venue_type);
  const requiresAbcLicense = form.business_venue_type === 'bar';
  const [openDropdown, setOpenDropdown] = useState<'city' | 'venue' | 'job' | null>(null);
  const [entryDrafts, setEntryDrafts] = useState<Record<StructuredListField, string>>({
    social_media_links_text: '',
    offer_entries_text: '',
    hours_of_operation_entries_text: '',
    photo_references_text: '',
  });
  const [entryErrors, setEntryErrors] = useState<Partial<Record<StructuredListField, string>>>({});
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(false);
  const { handleFieldFocus, handleScroll, scrollViewRef } = useAutoScrollForm();

  const verificationTitle = isClaimed
    ? 'Verify this business claim'
    : isInformal
      ? 'Set up an informal business or vendor profile'
      : 'Create a business profile';
  const verificationIntro = isClaimed
    ? 'Claimed businesses need ownership or manager verification details before they move into review.'
    : isInformal
      ? 'Use this path for smaller vendors, pop-ups, and informal businesses that still need a clean profile on DiningDealz.'
      : 'Use this path for established businesses that are not on DiningDealz yet and need full verification review.';
  const submitLabel = isClaimed
    ? 'Submit business claim'
    : isInformal
      ? 'Create informal business profile'
      : 'Create business profile';
  const jobTitleOptions = [
    { label: 'Owner', value: 'owner' },
    { label: 'Manager', value: 'manager' },
  ] as const;
  const socialLinkEntries = form.social_media_links_text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  function parseStructuredEntries(value: string) {
    return value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function handleSelectDropdownValue(field: 'business_city' | 'business_venue_type', value: string) {
    onChangeField(field, value);
    setOpenDropdown(null);
  }

  function normalizeSocialLink(value: string) {
    if (!value) {
      return null;
    }

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(value)) {
      return `https://${value}`;
    }

    return null;
  }

  async function handleOpenSocialLink(value: string) {
    const normalizedLink = normalizeSocialLink(value);
    if (!normalizedLink) {
      return;
    }

    const supported = await Linking.canOpenURL(normalizedLink);
    if (!supported) {
      return;
    }

    await Linking.openURL(normalizedLink);
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
      setAttachmentPreviewLoading(true);
      try {
        const base64Document = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        setAttachmentPreview({
          kind: 'pdf',
          name: attachmentName,
          html: buildPdfPreviewHtml(base64Document, attachmentName),
        });
        return;
      } catch {
        await openAttachmentExternally(uri, mimeType, attachmentName);
        return;
      } finally {
        setAttachmentPreviewLoading(false);
      }
    }

    await openAttachmentExternally(uri, mimeType, attachmentName);
  }

  function renderMultilineField(field: keyof ProfileFormState, label: string, value: string, options?: { placeholder?: string; support?: string }) {
    return (
      <>
        <Text style={styles.profileFieldLabel}>{label}</Text>
        <AutoScrollTextInput
          multiline
          onBeforeAutoScroll={handleFieldFocus}
          onChangeText={(nextValue) => onChangeField(field, nextValue)}
          placeholder={options?.placeholder}
          placeholderTextColor="#9a7f6c"
          scrollViewRef={scrollViewRef}
          style={[styles.profileInput, styles.profileTextarea]}
          textAlignVertical="top"
          value={value}
        />
        {options?.support ? <Text style={styles.profileSupportText}>{options.support}</Text> : null}
      </>
    );
  }

  function validateStructuredEntry(field: StructuredListField, value: string) {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return 'Enter a value before adding it.';
    }

    if (field === 'social_media_links_text' && !normalizeSocialLink(normalizedValue)) {
      return 'Enter a full social profile URL such as https://instagram.com/yourbusiness.';
    }

    if (field === 'hours_of_operation_entries_text' && !/[a-z]{3}/i.test(normalizedValue)) {
      return 'Use a readable schedule like Mon-Fri 3:00 PM - 6:00 PM.';
    }

    return null;
  }

  function setStructuredFieldEntries(field: StructuredListField, entries: string[]) {
    onChangeField(field, entries.join('\n'));
  }

  function handleChangeStructuredDraft(field: StructuredListField, value: string) {
    setEntryDrafts((current) => ({ ...current, [field]: value }));
    setEntryErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleAddStructuredEntry(field: StructuredListField) {
    const draftValue = entryDrafts[field].trim();
    const validationError = validateStructuredEntry(field, draftValue);
    if (validationError) {
      setEntryErrors((current) => ({ ...current, [field]: validationError }));
      return;
    }

    const currentEntries = parseStructuredEntries(form[field]);
    if (currentEntries.includes(draftValue)) {
      setEntryErrors((current) => ({ ...current, [field]: 'That item is already added.' }));
      return;
    }

    setStructuredFieldEntries(field, [...currentEntries, draftValue]);
    setEntryDrafts((current) => ({ ...current, [field]: '' }));
    setEntryErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleRemoveStructuredEntry(field: StructuredListField, entryToRemove: string) {
    setStructuredFieldEntries(
      field,
      parseStructuredEntries(form[field]).filter((entry) => entry !== entryToRemove),
    );
  }

  function renderStructuredEntryField(field: StructuredListField, label: string, options?: { placeholder?: string; support?: string; addLabel?: string }) {
    const entries = parseStructuredEntries(form[field]);

    return (
      <View style={styles.structuredEntrySection}>
        <Text style={styles.profileFieldLabel}>{label}</Text>
        <View style={styles.structuredEntryInputRow}>
          <AutoScrollTextInput
            onBeforeAutoScroll={handleFieldFocus}
            onChangeText={(value) => handleChangeStructuredDraft(field, value)}
            placeholder={options?.placeholder}
            placeholderTextColor="#9a7f6c"
            scrollViewRef={scrollViewRef}
            style={[styles.profileInput, styles.structuredEntryInput]}
            value={entryDrafts[field]}
          />
          <Pressable onPress={() => handleAddStructuredEntry(field)} style={styles.structuredEntryAddButton}>
            <Text style={styles.structuredEntryAddButtonText}>{options?.addLabel ?? 'Add'}</Text>
          </Pressable>
        </View>
        {options?.support ? <Text style={styles.profileSupportText}>{options.support}</Text> : null}
        {entryErrors[field] ? <Text style={styles.structuredEntryErrorText}>{entryErrors[field]}</Text> : null}
        {entries.length ? (
          <View style={styles.structuredEntryList}>
            {entries.map((entry) => (
              <View key={`${field}:${entry}`} style={styles.structuredEntryCard}>
                <Text style={styles.structuredEntryText}>{entry}</Text>
                <Pressable onPress={() => handleRemoveStructuredEntry(field, entry)} style={styles.structuredEntryRemoveButton}>
                  <Text style={styles.structuredEntryRemoveButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function renderAttachmentPicker(kind: BusinessAttachmentKind, label: string, support?: string) {
    const selectedAttachments = attachments[kind];

    return (
      <View style={styles.attachmentSection}>
        <Pressable onPress={() => onAddAttachments(kind)} style={[styles.linkButtonSecondary, styles.attachmentPickerButton]}>
          <Text style={styles.linkButtonSecondaryText}>{selectedAttachments.length ? `Add more to ${label}` : `Attach files to ${label}`}</Text>
        </Pressable>
        {support ? <Text style={[styles.profileSupportText, styles.attachmentSupportText]}>{support}</Text> : null}
        {selectedAttachments.length ? (
          <View style={styles.attachmentList}>
            {selectedAttachments.map((attachment) => (
              <View key={attachment.id} style={styles.attachmentCard}>
                <Pressable onPress={() => void handleOpenAttachment(attachment.uri, attachment.mimeType, attachment.name)} style={styles.attachmentPreviewButton}>
                  <View style={styles.attachmentMeta}>
                    <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                    <Text style={styles.attachmentDetail}>{attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB • Tap to view` : 'Selected file • Tap to view'}</Text>
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
      <Modal animationType="slide" onRequestClose={() => setAttachmentPreview(null)} transparent visible={attachmentPreview !== null || attachmentPreviewLoading}>
        <View style={styles.attachmentPreviewOverlay}>
          <View style={styles.attachmentPreviewSheet}>
            <View style={styles.attachmentPreviewHeader}>
              <Text numberOfLines={1} style={styles.attachmentPreviewTitle}>{attachmentPreview?.name ?? 'Preparing preview...'}</Text>
              <Pressable onPress={() => setAttachmentPreview(null)} style={styles.attachmentPreviewCloseButton}>
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
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          ref={scrollViewRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Verification</Text>
            <Text style={styles.detailTitle}>{verificationTitle}</Text>
            <Text style={styles.profileIntroText}>{verificationIntro}</Text>

            {isClaimed && selectedPlace ? (
              <View style={styles.claimResultCard}>
                <Text style={styles.placeTitle}>{selectedPlace.name}</Text>
                <Text style={styles.placeMeta}>{selectedPlace.venue_type_label}</Text>
                {selectedLocation ? (
                  <>
                    <Text style={styles.claimBusinessHint}>Selected address</Text>
                    <Text style={styles.claimLocationButtonText}>{formatPlaceAddress(selectedLocation)}</Text>
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
                  <Text style={styles.profileFieldLabel}>Business name</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('business_name', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.business_name} />

                  <Text style={styles.profileFieldLabel}>City</Text>
                  <CompactDropdown
                    onSelect={(value) => handleSelectDropdownValue('business_city', value)}
                    onToggle={() => setOpenDropdown((current) => current === 'city' ? null : 'city')}
                    open={openDropdown === 'city'}
                    options={[{ label: 'Select a city', value: '' }, ...manualBusinessCityOptions]}
                    placeholder="Select a city or service area"
                    selectedValue={form.business_city}
                  />

                  <Text style={styles.profileFieldLabel}>Business type</Text>
                  <CompactDropdown
                    onSelect={(value) => handleSelectDropdownValue('business_venue_type', value)}
                    onToggle={() => setOpenDropdown((current) => current === 'venue' ? null : 'venue')}
                    open={openDropdown === 'venue'}
                    options={[{ label: 'Select a business type', value: '' }, ...manualBusinessVenueOptions]}
                    placeholder="Select a business type"
                    selectedValue={form.business_venue_type}
                  />

                  {servesMultipleAreas ? (
                    <Text style={styles.profileSupportText}>It is highly recommend for smaller businesses and vendors that do not have a dedicated business address to turn on location services for DiningDealz after account is verified so you have can a business pin on the map.</Text>
                  ) : null}

                  <Text style={styles.profileFieldLabel}>{isInformal ? 'Website URL (optional)' : 'Website URL'}</Text>
                  <AutoScrollTextInput autoCapitalize="none" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('business_website_url', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.business_website_url} />
                </>
              ) : null}

              {isClaimed ? (
                <>
                  <Text style={styles.profileFieldLabel}>Website URL (optional)</Text>
                  <AutoScrollTextInput autoCapitalize="none" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('business_website_url', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.business_website_url} />
                </>
              ) : null}

              {lockAccountIdentityFields ? (
                <Text style={styles.profileSupportText}>Your username, email, and name are locked because this claim is attached to your existing customer account.</Text>
              ) : null}

              <Text style={styles.profileFieldLabel}>Username</Text>
              <AutoScrollTextInput autoCapitalize="none" editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('username', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.username} />

              <Text style={styles.profileFieldLabel}>Email</Text>
              <AutoScrollTextInput autoCapitalize="none" editable={!lockAccountIdentityFields} keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('email', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.email} />

              <Text style={styles.profileFieldLabel}>Password</Text>
              <PasswordField onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('password', value)} scrollViewRef={scrollViewRef} value={form.password} />

              <Text style={styles.profileFieldLabel}>Confirm password</Text>
              <PasswordField onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('confirm_password', value)} scrollViewRef={scrollViewRef} value={form.confirm_password} />

              <Text style={styles.profileFieldLabel}>First name</Text>
              <AutoScrollTextInput editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('first_name', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.first_name} />

              <Text style={styles.profileFieldLabel}>Last name</Text>
              <AutoScrollTextInput editable={!lockAccountIdentityFields} onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('last_name', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.last_name} />

              {!isInformal ? (
                <>
                  <Text style={styles.profileFieldLabel}>Contact name</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('contact_name', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.contact_name} />

                  <Text style={styles.profileFieldLabel}>Role</Text>
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

                  <Text style={styles.profileFieldLabel}>Employer email</Text>
                  <AutoScrollTextInput autoCapitalize="none" keyboardType="email-address" onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('work_email', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.work_email} />

                  <Text style={styles.profileFieldLabel}>Employer phone</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('work_phone', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.work_phone} />

                  <Text style={styles.profileFieldLabel}>{isEstablished && servesMultipleAreas ? 'Business address (optional for multi-area businesses)' : 'Business address'}</Text>
                  <AutoScrollTextInput onBeforeAutoScroll={handleFieldFocus} onChangeText={(value) => onChangeField('employer_address', value)} scrollViewRef={scrollViewRef} style={styles.profileInput} value={form.employer_address} />

                  {isEstablished && servesMultipleAreas ? (
                    <Pressable onPress={() => onToggleAddressNotApplicable(!form.address_not_applicable)} style={[styles.toggleChip, form.address_not_applicable ? styles.toggleChipActive : null]}>
                      <Text style={[styles.toggleChipText, form.address_not_applicable ? styles.toggleChipTextActive : null]}>Address Not Applicable</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {renderStructuredEntryField('social_media_links_text', 'Social media links', {
                placeholder: 'https://instagram.com/yourbusiness',
                support: 'Add each social profile as its own entry so the business profile can reuse them cleanly.',
                addLabel: 'Add link',
              })}
              {socialLinkEntries.length ? (
                <View style={styles.socialPreviewList}>
                  {socialLinkEntries.map((entry) => {
                    const normalizedLink = normalizeSocialLink(entry);
                    return (
                      <Pressable
                        key={entry}
                        disabled={!normalizedLink}
                        onPress={() => void handleOpenSocialLink(entry)}
                        style={[styles.socialPreviewCard, !normalizedLink ? styles.socialPreviewCardDisabled : null]}
                      >
                        <Text numberOfLines={1} style={styles.socialPreviewLink}>{entry}</Text>
                        <Text style={styles.socialPreviewAction}>{normalizedLink ? 'Open link' : 'Invalid link format'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {isClaimed ? renderMultilineField(
                'offer_entries_text',
                'Deals, discounts, or specials (optional)',
                form.offer_entries_text,
                {
                  placeholder: 'Taco Tuesday: 2 tacos for $5',
                  support: 'Existing business deals will prefill here when available, and you can edit each line before submitting.',
                },
              ) : renderStructuredEntryField('offer_entries_text', 'Deals, discounts, or specials (optional)', {
                placeholder: 'Taco Tuesday: 2 tacos for $5',
                support: 'Add each offer separately so it can be listed individually on the business profile.',
                addLabel: 'Add offer',
              })}

              {isClaimed ? renderMultilineField(
                'hours_of_operation_entries_text',
                'Hours of operation (optional)',
                form.hours_of_operation_entries_text,
                {
                  placeholder: 'Mon-Fri 3:00 PM - 6:00 PM',
                  support: 'Existing operating hours will prefill here when available, and you can edit the schedule lines before submitting.',
                },
              ) : renderStructuredEntryField('hours_of_operation_entries_text', 'Hours of operation (optional)', {
                placeholder: 'Mon-Fri 3:00 PM - 6:00 PM',
                support: 'Add each schedule line separately using a readable day and time format.',
                addLabel: 'Add hours',
              })}

              {isClaimed ? renderMultilineField(
                'photo_references_text',
                'Photo links or references (optional)',
                form.photo_references_text,
                {
                  placeholder: 'https://example.com/storefront.jpg',
                  support: 'Existing media references will prefill here when available, and you can edit them before submitting.',
                },
              ) : renderStructuredEntryField('photo_references_text', 'Photo links or references (optional)', {
                placeholder: 'https://example.com/storefront.jpg',
                support: 'Add each photo reference separately so the system can treat them as individual media items.',
                addLabel: 'Add photo',
              })}

              {!isInformal ? (
                <>
                  <Text style={styles.profileFieldLabel}>Business registration documents</Text>
                  {renderAttachmentPicker('business_registration', 'business registration documents', 'Attach one or more business registration files.')}

                  <Text style={styles.profileFieldLabel}>Proof of authority</Text>
                  {renderAttachmentPicker('proof_of_authority', 'proof of authority', 'Attach a work badge, payroll stub, authorization letter, or similar proof that you represent this business.')}

                  <Text style={styles.profileFieldLabel}>{requiresHealthPermit ? 'Health permit documents' : 'Health permit documents (if applicable)'}</Text>
                  {renderAttachmentPicker('health_permit', 'health permit documents', 'Attach one or more health permit files when they apply to this business type.')}

                  <Text style={styles.profileFieldLabel}>{requiresAbcLicense ? 'ABC license documents' : 'ABC license documents (bars only)'}</Text>
                  {renderAttachmentPicker('abc_license', 'ABC license documents', 'Attach one or more ABC license files when required.')}

                  <Text style={styles.profileFieldLabel}>Proof of address control (optional)</Text>
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
                  support: 'Keep this short. Informal businesses need a quick summary plus at least one social link, website, or photo reference before submission.',
                },
              ) : null}
            </View>

            <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonText}>{submitting ? 'Submitting...' : submitLabel}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}
