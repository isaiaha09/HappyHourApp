import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';

import { AccountSettingsScreen, BusinessProfileEditorScreen, DashboardScreen } from '../screens/DashboardScreen';
import type { SignupResponse } from '../types';

const mockHandleFieldFocus = jest.fn();
const mockHandleFieldBlur = jest.fn();
const mockHandleScrollBeginDrag = jest.fn();

jest.mock('../components/AutoScrollTextInput', () => {
  const React = require('react');
  return {
    ...jest.requireActual('../components/AutoScrollTextInput'),
    useAutoScrollForm: () => ({
      handleFieldBlur: mockHandleFieldBlur,
      handleFieldFocus: mockHandleFieldFocus,
      handleScroll: jest.fn(),
      handleScrollBeginDrag: mockHandleScrollBeginDrag,
      scrollToTop: jest.fn(),
      scrollViewRef: React.useRef(null),
    }),
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../components/NativeIOSLiquidGlass', () => ({
  NativeIOSLiquidGlassBackButton: () => null,
  NativeIOSLiquidGlassHeaderButton: () => null,
}));

function buildSession(portal: SignupResponse['portal']): SignupResponse {
  return {
    auth_token: 'test-token',
    email: `${portal}@example.com`,
    email_verified: true,
    first_name: 'Test',
    id: 1,
    last_name: 'User',
    portal,
    profile_type: portal,
    two_factor_enabled: false,
    username: `${portal}_user`,
  };
}

function renderDashboard(portal: SignupResponse['portal']) {
  const onSaveProfileDetails = jest.fn();
  const result = render(
    <DashboardScreen
      errorMessage={null}
      isLandscape={false}
      loading={false}
      message={null}
      onBack={jest.fn()}
      onOpenApprovedBusiness={jest.fn()}
      onOpenBusinessProfileEditor={jest.fn()}
      onOpenFavoriteBusiness={jest.fn()}
      onOpenFavoriteBusinesses={jest.fn()}
      onOpenBusinessNotifications={jest.fn()}
      onOpenDirectMessages={jest.fn()}
      onOpenPlaces={jest.fn()}
      onOpenSettings={jest.fn()}
      onRefresh={jest.fn()}
      onResendVerification={jest.fn()}
      onSaveProfileDetails={onSaveProfileDetails}
      session={buildSession(portal)}
      submitting={false}
    />,
  );
  return { ...result, onSaveProfileDetails };
}

function renderBusinessEditor() {
  return render(
    <BusinessProfileEditorScreen
      errorMessage={null}
      isLandscape={false}
      message={null}
      onBack={jest.fn()}
      onSaveProfileDetails={jest.fn()}
      onViewInMap={jest.fn()}
      session={buildSession('business')}
      submitting={false}
    />,
  );
}

function renderAccountSettings(portal: SignupResponse['portal']) {
  return render(
    <AccountSettingsScreen
      deleteAccountPassword=""
      errorMessage={null}
      isLandscape={false}
      message={null}
      onBack={jest.fn()}
      onBeginTwoFactorSetup={jest.fn()}
      onChangeDeleteAccountPassword={jest.fn()}
      onChangeTwoFactorDisableCode={jest.fn()}
      onChangeTwoFactorSetupCode={jest.fn()}
      onConfirmTwoFactorSetup={jest.fn()}
      onDeleteAccount={jest.fn()}
      onDisableTwoFactor={jest.fn()}
      onLogout={jest.fn()}
      onOpenBlockedDirectMessageCustomers={jest.fn()}
      onOpenContactSupport={jest.fn()}
      onOpenPrivacyPolicy={jest.fn()}
      onOpenTermsOfService={jest.fn()}
      onToggleBusinessLocationTracking={jest.fn()}
      onToggleDirectMessaging={jest.fn()}
      pendingBusinessLocationTrackingEnabled={null}
      pendingDirectMessagingEnabled={null}
      session={buildSession(portal)}
      settingsSubmittingAction={null}
      twoFactorDisableCode=""
      twoFactorSetup={null}
      twoFactorSetupCode=""
    />,
  );
}

function expectFieldToRegisterFocus(label: string) {
  mockHandleFieldFocus.mockClear();
  mockHandleFieldBlur.mockClear();
  const input = screen.getByLabelText(label);

  // Use the real AutoScrollTextInput: the screen must register both the target
  // and its measurer with onboarding's controller, not merely expose onFocus.
  fireEvent(input, 'focus', { nativeEvent: { target: 1 } });
  expect(mockHandleFieldFocus).toHaveBeenCalledTimes(1);
  expect(mockHandleFieldFocus.mock.calls[0][1]).toEqual(expect.any(Function));

  fireEvent.changeText(input, 'Updated value');
  expect(mockHandleFieldFocus).toHaveBeenCalledTimes(1);

  fireEvent(input, 'blur', { nativeEvent: { target: 1 } });
  expect(mockHandleFieldBlur).toHaveBeenCalledTimes(1);
}

describe('logged-in form keyboard scrolling', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['customer', 'business'] as const)('keeps the profile fields and save payload for the %s dashboard', (portal) => {
    const { onSaveProfileDetails } = renderDashboard(portal);
    fireEvent.changeText(screen.getByLabelText('Username'), 'updated-user');
    fireEvent.press(screen.getByText(portal === 'business' ? 'Save dashboard changes' : 'Save profile details'));
    expect(onSaveProfileDetails).toHaveBeenCalledWith(expect.objectContaining({
      portal,
      username: 'updated-user',
      email: `${portal}@example.com`,
      first_name: 'Test',
      last_name: 'User',
    }));
    expect(Boolean(screen.queryByText('Business status'))).toBe(portal === 'business');
    expect(Boolean(screen.queryByText('Business notifications'))).toBe(portal === 'customer');
  });

  it.each(['customer', 'business'] as const)('registers every dashboard field for the %s portal', (portal) => {
    renderDashboard(portal);
    ['Username', 'Email', 'First name', 'Last name'].forEach(expectFieldToRegisterFocus);
  });

  it('registers business contact, address, website, social and multiline fields', () => {
    renderBusinessEditor();
    [
      'Contact name', 'Job title', 'Work email', 'Public phone', 'Public address',
      'Business website', 'Instagram', 'Facebook', 'TikTok', 'YouTube', 'Business details',
    ].forEach(expectFieldToRegisterFocus);
  });

  it('registers fields added inside the business deal, menu-item and hours editors', () => {
    renderBusinessEditor();
    fireEvent.press(screen.getByText('Add deal or special'));
    fireEvent.press(screen.getByRole('button', { name: 'Add menu item' }));
    fireEvent.press(screen.getByText('Add deal day/time'));
    fireEvent.press(screen.getByText('Add hours row'));

    [
      'Deal title', 'Menu item 1 name', 'Menu item 1 price', 'Menu item 1 details',
      'Schedule 1 start time', 'Schedule 1 end time',
      'Opening time for schedule 1', 'Closing time for schedule 1',
    ].forEach(expectFieldToRegisterFocus);
  });

  it.each(['customer', 'business'] as const)('registers the deletion password for the %s portal', (portal) => {
    renderAccountSettings(portal);
    expectFieldToRegisterFocus('Current password for account deletion');
  });

  it.each([
    ['dashboard', () => renderDashboard('customer')],
    ['business editor', renderBusinessEditor],
    ['account settings', () => renderAccountSettings('customer')],
  ] as const)('gives manual scrolling priority in the %s', (_name, renderForm) => {
    renderForm();
    fireEvent(screen.UNSAFE_getAllByType(ScrollView)[0], 'scrollBeginDrag');
    expect(mockHandleScrollBeginDrag).toHaveBeenCalledTimes(1);
  });
});
