import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountSettingsScreen } from '../screens/DashboardScreen';
import type { SignupResponse } from '../types';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('../components/NativeIOSLiquidGlass', () => ({
  NativeIOSLiquidGlassBackButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');

    return (
      <Pressable accessibilityLabel={label} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  },
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

function renderAccountSettings(portal: SignupResponse['portal'], onChangeDeleteAccountPassword: (value: string) => void, deleteAccountErrorMessage: string | null = null) {
  return render(
    <AccountSettingsScreen
      deleteAccountPassword=""
      deleteAccountErrorMessage={deleteAccountErrorMessage}
      errorMessage={null}
      isLandscape={false}
      message={null}
      onBack={jest.fn()}
      onBeginTwoFactorSetup={jest.fn()}
      onChangeDeleteAccountPassword={onChangeDeleteAccountPassword}
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

describe('AccountSettingsScreen delete account field', () => {
  it.each(['customer', 'business'] as const)('keeps the password field keyboard-aware for the %s portal', (portal) => {
    const onChangeDeleteAccountPassword = jest.fn();
    renderAccountSettings(portal, onChangeDeleteAccountPassword);

    const passwordField = screen.getByLabelText('Current password for account deletion');

    expect(passwordField.props.onFocus).toEqual(expect.any(Function));
    fireEvent.changeText(passwordField, 'current-password');

    expect(onChangeDeleteAccountPassword).toHaveBeenCalledWith('current-password');
  });

  it('shows account deletion errors beside the password field', () => {
    renderAccountSettings('customer', jest.fn(), 'The password was incorrect. Use Forgot password from the login screen.');

    expect(screen.getByText('The password was incorrect. Use Forgot password from the login screen.')).toBeTruthy();
  });
});