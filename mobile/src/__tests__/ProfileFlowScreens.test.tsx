import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Animated, TextInput } from 'react-native';

import type { BusinessAttachmentBuckets, EmailVerificationChallengeResponse } from '../types';
import type { LoginFormState, ProfileFormState } from '../appFlowTypes';

const mockScrollToTop = jest.fn();
const mockHandleFieldFocus = jest.fn();
const mockHandleFieldBlur = jest.fn();
const mockHandleScroll = jest.fn();
const mockScrollViewRef = { current: null };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../components/AutoScrollTextInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');

  return {
    AutoScrollTextInput: ({ onBeforeAutoScroll, onFieldBlur, onBlur, scrollViewRef, ...props }: Record<string, unknown>) => React.createElement(TextInput, {
      ...props,
      onBlur: () => {
        if (typeof onFieldBlur === 'function') {
          (onFieldBlur as (...args: any[]) => void)(1);
        }
        if (typeof onBlur === 'function') {
          (onBlur as () => void)();
        }
      },
    }),
    useAutoScrollForm: () => ({
      handleFieldBlur: mockHandleFieldBlur,
      handleFieldFocus: mockHandleFieldFocus,
      handleScroll: mockHandleScroll,
      scrollToTop: mockScrollToTop,
      scrollViewRef: mockScrollViewRef,
    }),
  };
});

jest.mock('../components/BusinessProfileStructuredEditors', () => ({
  BusinessDealsEditor: () => null,
  BusinessHoursEditor: () => null,
}));

jest.mock('../components/NativeIOSLiquidGlass', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');

  return {
    NativeIOSLiquidGlassBackButton: ({ label, onPress }: { label: string; onPress: () => void }) => React.createElement(
      Pressable,
      { accessibilityLabel: label, onPress },
      React.createElement(Text, null, label),
    ),
    isNativeIOSLiquidGlassHeaderButtonAvailable: () => false,
  };
});

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));

import {
  AuthPortalScreen,
  BusinessClaimRetryScreen,
  BusinessSearchScreen,
  BusinessVerificationScreen,
  CreateProfileScreen,
  EmailVerificationScreen,
  ForgotPasswordScreen,
  ForgotUsernameScreen,
} from '../screens/ProfileFlowScreens';

const emptyLoginForm: LoginFormState = {
  identifier: '',
  password: '',
  two_factor_code: '',
};

const emptyProfileForm: ProfileFormState = {
  username: '',
  email: '',
  confirm_email: '',
  password: '',
  confirm_password: '',
  first_name: '',
  last_name: '',
  business_slug: '',
  business_name: '',
  business_city: '',
  business_venue_type: '',
  business_website_url: '',
  instagram_profile: '',
  facebook_profile: '',
  tiktok_profile: '',
  youtube_profile: '',
  contact_name: '',
  job_title: '',
  work_email: '',
  work_phone: '',
  employer_address: '',
  address_not_applicable: false,
  social_media_links_text: '',
  deal_overrides: [],
  operating_hour_overrides: [],
  offer_entries_text: '',
  hours_of_operation_entries_text: '',
  photo_references_text: '',
  verification_summary: '',
  supporting_details: '',
  verification_data_consent: false,
  terms_accepted: false,
};

const emptyAttachments: BusinessAttachmentBuckets = {
  social_media: [],
  business_registration: [],
  health_permit: [],
  abc_license: [],
  proof_of_address_control: [],
  proof_of_authority: [],
};

const pendingVerification = {
  id: 1,
  username: 'hopper',
  email: 'hopper@example.com',
  first_name: 'Happy',
  last_name: 'Hopper',
  auth_token: '',
  portal: 'customer',
  profile_type: 'customer',
  email_verified: false,
  two_factor_enabled: false,
} as EmailVerificationChallengeResponse;

function buildBusinessVerificationProps(mode: 'claimed' | 'manual' | 'informal', errorMessage: string | null = 'Please fix the highlighted fields.') {
  return {
    attachments: emptyAttachments,
    errorMessage,
    form: emptyProfileForm,
    isLandscape: false,
    mode,
    onAddAttachments: jest.fn(),
    onAddPhotoUploads: jest.fn(),
    onBack: jest.fn(),
    onChangeField: jest.fn(),
    onRemoveCurrentPhoto: jest.fn(),
    onRemoveAttachment: jest.fn(),
    onRemovePhotoUpload: jest.fn(),
    onToggleAddressNotApplicable: jest.fn(),
    onSubmit: jest.fn(),
    photoUploads: [],
    selectedLocation: null,
    selectedPlace: null,
    submitting: false,
  };
}

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('onboarding form layout preserves existing controls', () => {
  const accountFields = ['username', 'email', 'confirm_email', 'password', 'confirm_password', 'first_name', 'last_name'] as const;
  const contactFields = ['contact_name', 'work_email', 'work_phone', 'employer_address'] as const;
  const publicFields = ['business_website_url', 'instagram_profile', 'facebook_profile', 'tiktok_profile', 'youtube_profile', 'supporting_details'] as const;

  it.each(['claimed', 'manual', 'informal'] as const)('keeps field order and upload actions for %s business onboarding', (mode) => {
    const props = buildBusinessVerificationProps(mode, null);
    const form = { ...emptyProfileForm };
    for (const field of ['business_name', ...accountFields, ...contactFields, ...publicFields] as const) {
      form[field] = field;
    }
    const { rerender } = render(<BusinessVerificationScreen {...props} form={form} />);
    const expectedFields = mode === 'informal'
      ? ['business_name', 'employer_address', ...accountFields, ...publicFields]
      : [...(mode === 'manual' ? ['business_name'] : []), ...accountFields, ...contactFields, ...publicFields];
    const inputs = screen.UNSAFE_getAllByType(TextInput);

    expect(inputs.map((input) => input.props.value)).toEqual(expectedFields);
    fireEvent.changeText(screen.getByDisplayValue('username'), 'owner');
    expect(props.onChangeField).toHaveBeenCalledWith('username', 'owner');

    fireEvent.press(screen.getByText('Select photos from Photo Library'));
    expect(props.onAddPhotoUploads).toHaveBeenCalledTimes(1);

    if (mode === 'informal') {
      expect(screen.queryByText('Business registration documents')).toBeNull();
      expect(screen.queryByText('Contact name')).toBeNull();
    } else {
      fireEvent.press(screen.getByText('Attach files to business registration documents'));
      expect(props.onAddAttachments).toHaveBeenCalledWith('business_registration');
    }

    if (mode === 'claimed') {
      rerender(<BusinessVerificationScreen {...props} form={form} lockAccountIdentityFields />);
      for (const field of ['username', 'email', 'confirm_email', 'first_name', 'last_name']) {
        expect(screen.getByDisplayValue(field).props.editable).toBe(false);
      }
    }
  });
});

describe('login layout preserves authentication controls', () => {
  function loginProps(loginPortal: 'customer' | 'business') {
    return {
      authMessage: null,
      autoFocusIdentifier: true,
      errorMessage: null,
      loginForm: { identifier: 'account-user', password: 'sample-password', two_factor_code: '123456' },
      loginPortal,
      onBackToLanding: jest.fn(),
      onChangeField: jest.fn(),
      onForgotPassword: jest.fn(),
      onForgotUsername: jest.fn(),
      onSubmit: jest.fn(),
      showTwoFactorCodeField: false,
      submitting: false,
    };
  }

  it.each(['customer', 'business'] as const)('keeps credentials, masking, optional 2FA, and submit behavior for %s login', (portal) => {
    const props = loginProps(portal);
    const { rerender } = render(<AuthPortalScreen {...props} />);
    const submitLabel = portal === 'customer' ? 'Log in as Customer' : 'Log in as Business';

    expect(screen.getByDisplayValue('account-user').props.autoFocus).toBe(true);
    expect(screen.queryByDisplayValue('123456')).toBeNull();
    expect(screen.getByDisplayValue('sample-password').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByDisplayValue('sample-password').props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByDisplayValue('sample-password').props.secureTextEntry).toBe(true);

    fireEvent.changeText(screen.getByDisplayValue('account-user'), 'updated-user');
    expect(props.onChangeField).toHaveBeenCalledWith('identifier', 'updated-user');
    fireEvent.press(screen.getByText(submitLabel));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);

    rerender(<AuthPortalScreen {...props} showTwoFactorCodeField />);
    fireEvent.changeText(screen.getByDisplayValue('123456'), '654321');
    expect(props.onChangeField).toHaveBeenCalledWith('two_factor_code', '654321');

    rerender(<AuthPortalScreen {...props} submitting />);
    fireEvent.press(screen.getByText(submitLabel));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('cancels pending auto-scroll when sign-in text and password fields blur', () => {
    mockHandleFieldBlur.mockClear();
    render(<AuthPortalScreen {...loginProps('customer')} />);

    fireEvent(screen.getByDisplayValue('account-user'), 'blur');
    fireEvent(screen.getByDisplayValue('sample-password'), 'blur');

    expect(mockHandleFieldBlur).toHaveBeenCalledTimes(2);
    expect(mockHandleFieldBlur).toHaveBeenNthCalledWith(1, 1);
    expect(mockHandleFieldBlur).toHaveBeenNthCalledWith(2, 1);
  });

  it('keeps both inline recovery actions and cancellation', () => {
    const timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (onComplete) => onComplete?.({ finished: true }),
      stop: jest.fn(),
      reset: jest.fn(),
    }));
    try {
      const props = loginProps('customer');
      render(<AuthPortalScreen {...props} />);
      fireEvent.press(screen.getByText('Forgot username?'));
      fireEvent.changeText(screen.getByPlaceholderText('Enter your account email'), 'owner@example.com');
      fireEvent.press(screen.getByText('Email my username'));
      expect(props.onForgotUsername).toHaveBeenCalledWith('owner@example.com');

      fireEvent.press(screen.getByText('Forgot password?'));
      fireEvent.changeText(screen.getByPlaceholderText('Enter your username or email'), 'account-user');
      fireEvent.press(screen.getByText('Send password reset link'));
      expect(props.onForgotPassword).toHaveBeenCalledWith('account-user');
      fireEvent.press(screen.getByText('Cancel'));
      expect(screen.queryByPlaceholderText('Enter your username or email')).toBeNull();
    } finally {
      timing.mockRestore();
    }
  });
});

describe('submission-scoped onboarding error scrolling', () => {
  it('does not scroll while a customer form rerenders from typing, then scrolls once per failed submission', async () => {
    const onSubmit = jest.fn();
    const { rerender } = render(
      <CreateProfileScreen
        errorMessage="Email and confirm email must match."
        form={emptyProfileForm}
        isLandscape={false}
        message={null}
        onBack={jest.fn()}
        onChangeField={jest.fn()}
        onOpenBusinessClaim={jest.fn()}
        onSubmit={onSubmit}
        submitting={false}
      />,
    );

    expect(mockScrollToTop).not.toHaveBeenCalled();

    rerender(
      <CreateProfileScreen
        errorMessage="Email and confirm email must match."
        form={{ ...emptyProfileForm, first_name: 'Typing' }}
        isLandscape={false}
        message={null}
        onBack={jest.fn()}
        onChangeField={jest.fn()}
        onOpenBusinessClaim={jest.fn()}
        onSubmit={onSubmit}
        submitting={false}
      />,
    );

    expect(mockScrollToTop).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Create customer profile'));
    await waitFor(() => expect(mockScrollToTop).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('Create customer profile'));
    await waitFor(() => expect(mockScrollToTop).toHaveBeenCalledTimes(2));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('waits for an async login error and does not scroll on a valid submission', async () => {
    const onSubmit = jest.fn();
    const { rerender } = render(
      <AuthPortalScreen
        authMessage={null}
        autoFocusIdentifier={false}
        errorMessage={null}
        loginForm={emptyLoginForm}
        loginPortal="customer"
        onBackToLanding={jest.fn()}
        onChangeField={jest.fn()}
        onForgotPassword={jest.fn()}
        onForgotUsername={jest.fn()}
        onSubmit={onSubmit}
        showTwoFactorCodeField={false}
        submitting={false}
      />,
    );

    fireEvent.press(screen.getByText('Log in as Customer'));
    expect(mockScrollToTop).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(
      <AuthPortalScreen
        authMessage={null}
        autoFocusIdentifier={false}
        errorMessage="Invalid credentials."
        loginForm={{ ...emptyLoginForm, identifier: 'hopper' }}
        loginPortal="customer"
        onBackToLanding={jest.fn()}
        onChangeField={jest.fn()}
        onForgotPassword={jest.fn()}
        onForgotUsername={jest.fn()}
        onSubmit={onSubmit}
        showTwoFactorCodeField={false}
        submitting
      />,
    );
    expect(mockScrollToTop).not.toHaveBeenCalled();

    rerender(
      <AuthPortalScreen
        authMessage={null}
        autoFocusIdentifier={false}
        errorMessage="Invalid credentials."
        loginForm={{ ...emptyLoginForm, identifier: 'hopper' }}
        loginPortal="customer"
        onBackToLanding={jest.fn()}
        onChangeField={jest.fn()}
        onForgotPassword={jest.fn()}
        onForgotUsername={jest.fn()}
        onSubmit={onSubmit}
        showTwoFactorCodeField={false}
        submitting={false}
      />,
    );
    await waitFor(() => expect(mockScrollToTop).toHaveBeenCalledTimes(1));

    rerender(
      <AuthPortalScreen
        authMessage={null}
        autoFocusIdentifier={false}
        errorMessage="Invalid credentials."
        loginForm={{ ...emptyLoginForm, identifier: 'typed-after-error' }}
        loginPortal="customer"
        onBackToLanding={jest.fn()}
        onChangeField={jest.fn()}
        onForgotPassword={jest.fn()}
        onForgotUsername={jest.fn()}
        onSubmit={onSubmit}
        showTwoFactorCodeField={false}
        submitting={false}
      />,
    );
    expect(mockScrollToTop).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('Log in as Customer'));
    await waitFor(() => expect(mockScrollToTop).toHaveBeenCalledTimes(2));
  });

  it('scrolls once when the forgot username form submits with an error', async () => {
    const onSubmit = jest.fn();
    render(
      <ForgotUsernameScreen
        email=""
        errorMessage="Enter the email address for your account."
        isLandscape={false}
        message={null}
        onBack={jest.fn()}
        onChangeEmail={jest.fn()}
        onSubmit={onSubmit}
        submitting={false}
      />,
    );

    fireEvent.press(screen.getByText('Email my username'));

    await waitFor(() => expect(mockScrollToTop).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('scrolls once when the forgot password form submits with an error', async () => {
    const onSubmit = jest.fn();
    render(
      <ForgotPasswordScreen
        confirmPassword=""
        errorMessage="Enter a new password."
        isLandscape={false}
        message={null}
        newPassword=""
        onBack={jest.fn()}
        onChangeConfirmPassword={jest.fn()}
        onChangeNewPassword={jest.fn()}
        onSubmit={onSubmit}
        submitting={false}
      />,
    );

    fireEvent.press(screen.getByText('Update password'));

    await waitFor(() => expect(mockScrollToTop).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('scrolls for email verification errors and not for typing changes', async () => {
    const onSubmit = jest.fn();
    const { rerender } = render(
      <EmailVerificationScreen
        errorMessage="Enter the 6-digit verification code."
        isLandscape={false}
        message={null}
        onBack={jest.fn()}
        onChangeCode={jest.fn()}
        onResend={jest.fn()}
        onSubmit={onSubmit}
        pendingVerification={pendingVerification}
        submitting={false}
        verificationCode=""
      />,
    );

    rerender(
      <EmailVerificationScreen
        errorMessage="Enter the 6-digit verification code."
        isLandscape={false}
        message={null}
        onBack={jest.fn()}
        onChangeCode={jest.fn()}
        onResend={jest.fn()}
        onSubmit={onSubmit}
        pendingVerification={pendingVerification}
        submitting={false}
        verificationCode="1"
      />,
    );
    expect(mockScrollToTop).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Verify email and continue'));
    await waitFor(() => expect(mockScrollToTop).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['claimed', 'Submit business claim'],
    ['manual', 'Create business profile'],
    ['informal', 'Create small startup or vendor profile'],
  ] as const)('scrolls failed %s business submissions once', async (mode, buttonLabel) => {
    render(<BusinessVerificationScreen {...buildBusinessVerificationProps(mode)} />);

    fireEvent.press(screen.getByText(buttonLabel));
    await waitFor(() => expect(mockScrollToTop).toHaveBeenCalledTimes(1));
  });

  it('scrolls once for inline business social validation and again only after a new submit', () => {
    const props = {
      ...buildBusinessVerificationProps('informal', null),
      form: { ...emptyProfileForm, business_website_url: 'https://' },
    };
    render(<BusinessVerificationScreen {...props} />);

    fireEvent.press(screen.getByText('Create small startup or vendor profile'));
    expect(mockScrollToTop).toHaveBeenCalledTimes(1);

    fireEvent.changeText(screen.getAllByDisplayValue('https://')[0], 'https://');
    expect(mockScrollToTop).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('Create small startup or vendor profile'));
    expect(mockScrollToTop).toHaveBeenCalledTimes(2);
  });

  it('does not auto-scroll the live business search screen when its error remains during typing', () => {
    const { rerender } = render(
      <BusinessSearchScreen
        errorMessage="Businesses could not be loaded."
        isLandscape={false}
        loadingPlaces={false}
        onBack={jest.fn()}
        onChangeSearchQuery={jest.fn()}
        onChooseInformalBusiness={jest.fn()}
        onChooseManualBusiness={jest.fn()}
        onSelectBusiness={jest.fn()}
        results={[]}
        searchQuery=""
      />,
    );

    rerender(
      <BusinessSearchScreen
        errorMessage="Businesses could not be loaded."
        isLandscape={false}
        loadingPlaces={false}
        onBack={jest.fn()}
        onChangeSearchQuery={jest.fn()}
        onChooseInformalBusiness={jest.fn()}
        onChooseManualBusiness={jest.fn()}
        onSelectBusiness={jest.fn()}
        results={[]}
        searchQuery="typed"
      />,
    );

    expect(mockScrollToTop).not.toHaveBeenCalled();
  });

  it('offers the rejected-claim retry request and code verification actions', () => {
    const onRequestCode = jest.fn();
    const onVerifyCode = jest.fn();
    const props = {
      codeRequested: false,
      errorMessage: null,
      email: 'claim-owner@example.com',
      isLandscape: false,
      message: null,
      onBack: jest.fn(),
      onChangeCode: jest.fn(),
      onChangeEmail: jest.fn(),
      onRequestCode,
      onVerifyCode,
      submitting: false,
      verificationCode: '',
    };
    const { rerender } = render(<BusinessClaimRetryScreen {...props} />);

    expect(screen.getByText('Email used for the rejected claim')).toBeTruthy();
    expect(screen.getByPlaceholderText('Email address')).toBeTruthy();
    expect(screen.getByText(/no username or rejection-email link is needed/i)).toBeTruthy();
    expect(screen.getByText(/choose a new username/i)).toBeTruthy();
    fireEvent.press(screen.getByText('Email me a verification code'));
    expect(onRequestCode).toHaveBeenCalledTimes(1);

    rerender(<BusinessClaimRetryScreen {...props} codeRequested verificationCode="123456" />);
    expect(screen.getByText('6-digit verification code')).toBeTruthy();
    fireEvent.press(screen.getByText('Verify email and continue'));
    expect(onVerifyCode).toHaveBeenCalledTimes(1);
  });
});
