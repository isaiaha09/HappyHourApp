import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { BusinessAttachmentBuckets, EmailVerificationChallengeResponse } from '../types';
import type { LoginFormState, ProfileFormState } from '../appFlowTypes';

const mockScrollToTop = jest.fn();
const mockHandleFieldFocus = jest.fn();
const mockHandleScroll = jest.fn();
const mockScrollViewRef = { current: null };

jest.mock('../components/AutoScrollTextInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');

  return {
    AutoScrollTextInput: ({ onBeforeAutoScroll, scrollViewRef, ...props }: Record<string, unknown>) => React.createElement(TextInput, props),
    useAutoScrollForm: () => ({
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

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

import {
  AuthPortalScreen,
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
});
