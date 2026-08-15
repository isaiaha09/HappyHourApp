import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { fetchCustomerPreferences, saveCustomerPreferences } from '../../api';
import { CustomerPreferencesScreen } from '../CustomerPreferencesScreen';
import type { SignupResponse } from '../../types';

jest.mock('../../api', () => ({
  fetchCustomerPreferences: jest.fn(),
  saveCustomerPreferences: jest.fn(),
}));

jest.mock('../../components/NativeIOSLiquidGlass', () => ({
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

const mockFetchCustomerPreferences = fetchCustomerPreferences as jest.MockedFunction<typeof fetchCustomerPreferences>;
const mockSaveCustomerPreferences = saveCustomerPreferences as jest.MockedFunction<typeof saveCustomerPreferences>;

function buildSession(): SignupResponse {
  return {
    auth_token: 'token-123',
    email: 'customer@example.com',
    email_verified: true,
    first_name: 'Customer',
    id: 1,
    last_name: 'User',
    portal: 'customer',
    profile_type: 'customer',
    two_factor_enabled: false,
    username: 'customer',
  };
}

describe('CustomerPreferencesScreen', () => {
  beforeEach(() => {
    mockFetchCustomerPreferences.mockResolvedValue({
      ...buildSession(),
      preference_businesses: [{
        slug: 'yard-house',
        location_id: 71,
        name: 'Yard House',
        city: 'oxnard',
        city_label: 'Oxnard',
        venue_type: 'bar',
        venue_type_label: 'Bar',
        address_line_1: '501 Collection Blvd',
        website_url: 'https://example.com/yard-house',
        deal_count: 1,
        has_deals: true,
      }],
    });
    mockSaveCustomerPreferences.mockResolvedValue({ ...buildSession(), detail: 'Preferences saved.' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('walks through onboarding and saves an exact business location', async () => {
    const onComplete = jest.fn();
    const onSkip = jest.fn();

    render(
      <CustomerPreferencesScreen
        apiBaseUrl="https://api.example.com"
        authToken="token-123"
        isLandscape={false}
        mode="onboarding"
        onBack={jest.fn()}
        onComplete={onComplete}
        onSkip={onSkip}
        session={buildSession()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Personalize your happy hour experience')).toBeTruthy();
    fireEvent.press(screen.getByText('Start'));
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Choose businesses')).toBeTruthy();

    fireEvent.press(screen.getByText('Yard House'));
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('What should each business send you?')).toBeTruthy();

    fireEvent.press(screen.getByText('Happy hour notifications'));
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Review your preferences')).toBeTruthy();

    fireEvent.press(screen.getByText('Finish setup'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSaveCustomerPreferences).toHaveBeenCalledWith(
      'https://api.example.com',
      'token-123',
      expect.objectContaining({
        action: 'complete',
        businesses: [expect.objectContaining({
          slug: 'yard-house',
          location_id: 71,
          happy_hour_notifications_enabled: true,
        })],
      }),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });
});
