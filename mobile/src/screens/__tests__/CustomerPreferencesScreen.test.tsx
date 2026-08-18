import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { fetchCustomerPreferences, saveCustomerPreferences } from '../../api';
import { CustomerPreferencesScreen } from '../CustomerPreferencesScreen';
import type { CustomerPreferenceBusiness, SignupResponse } from '../../types';

jest.mock('../../api', () => ({
  fetchCustomerPreferences: jest.fn(),
  saveCustomerPreferences: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return <Text testID={`icon-${name}`}>{name}</Text>;
  },
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
  NativeIOSLiquidGlassHeaderButton: ({ fallback }: { fallback: React.ReactNode }) => fallback,
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

function buildPreferenceBusiness(overrides: Partial<CustomerPreferenceBusiness> = {}): CustomerPreferenceBusiness {
  return {
    address_line_1: '100 Main Street',
    city: 'oxnard',
    city_label: 'Oxnard',
    deal_count: 1,
    has_deals: true,
    has_happy_hours: true,
    location_id: 1,
    name: 'Preference Business',
    slug: 'preference-business',
    venue_type: 'bar',
    venue_type_label: 'Bar',
    website_url: 'https://example.com/preference-business',
    ...overrides,
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
        has_happy_hours: true,
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

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    fireEvent.press(screen.getByText('Continue'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    expect(screen.getByText('Choose businesses')).toBeTruthy();

    fireEvent.press(screen.getByText('Yard House'));
    fireEvent.press(screen.getByText('Continue'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    expect(screen.getByText('What should each business send you?')).toBeTruthy();

    fireEvent.press(screen.getByText('Happy Hour Notifications'));
    fireEvent.press(screen.getByText('Continue'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    fireEvent.press(screen.getByText('Continue'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

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
        notifications_paused: false,
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

  it('lets settings advance from the first screen while preferences load', async () => {
    mockFetchCustomerPreferences.mockReturnValue(new Promise(() => undefined));

    render(
      <CustomerPreferencesScreen
        apiBaseUrl="https://api.example.com"
        authToken="token-123"
        isLandscape={false}
        mode="settings"
        onBack={jest.fn()}
        onComplete={jest.fn()}
        onSkip={jest.fn()}
        session={buildSession()}
      />,
    );

    fireEvent.press(screen.getByText('Continue'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    expect(screen.getByText('Choose businesses')).toBeTruthy();
  });

  it('does not display preference businesses without happy hours', async () => {
    mockFetchCustomerPreferences.mockResolvedValue({
      ...buildSession(),
      preference_businesses: [
        {
          slug: 'yard-house',
          location_id: 71,
          name: 'Yard House',
          city: 'oxnard',
          city_label: 'Oxnard',
          venue_type: 'bar',
          venue_type_label: 'Bar',
          address_line_1: '501 Collection Blvd',
          website_url: 'https://example.com/yard-house',
          has_happy_hours: true,
        },
        {
          slug: 'regular-deal-business',
          location_id: 72,
          name: 'Regular Deal Business',
          city: 'oxnard',
          city_label: 'Oxnard',
          venue_type: 'restaurant',
          venue_type_label: 'Restaurant',
          address_line_1: '502 Collection Blvd',
          website_url: 'https://example.com/regular-deal-business',
          has_happy_hours: false,
        },
      ],
    });

    render(
      <CustomerPreferencesScreen
        apiBaseUrl="https://api.example.com"
        authToken="token-123"
        isLandscape={false}
        mode="settings"
        onBack={jest.fn()}
        onComplete={jest.fn()}
        onSkip={jest.fn()}
        session={buildSession()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByText('Continue'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    expect(screen.getByText('Yard House')).toBeTruthy();
    expect(screen.queryByText('Regular Deal Business')).toBeNull();
  });

  it('groups businesses by city and loads more independently for each city', async () => {
    mockFetchCustomerPreferences.mockResolvedValue({
      ...buildSession(),
      preference_businesses: [
        ...Array.from({ length: 6 }, (_, index) => buildPreferenceBusiness({
          city: 'camarillo',
          city_label: 'Camarillo',
          location_id: 100 + index,
          name: `Camarillo Business ${index + 1}`,
          slug: `camarillo-business-${index + 1}`,
        })),
        ...Array.from({ length: 6 }, (_, index) => buildPreferenceBusiness({
          city: 'oxnard',
          city_label: 'Oxnard',
          location_id: 200 + index,
          name: `Oxnard Business ${index + 1}`,
          slug: `oxnard-business-${index + 1}`,
        })),
      ],
    });

    render(
      <CustomerPreferencesScreen
        apiBaseUrl="https://api.example.com"
        authToken="token-123"
        isLandscape={false}
        mode="settings"
        onBack={jest.fn()}
        onComplete={jest.fn()}
        onSkip={jest.fn()}
        session={buildSession()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByText('Continue'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 360));
    });

    expect(screen.getByTestId('preference-city-camarillo')).toBeTruthy();
    expect(screen.getByTestId('preference-city-oxnard')).toBeTruthy();
    expect(screen.getByText('Camarillo Business 5')).toBeTruthy();
    expect(screen.queryByText('Camarillo Business 6')).toBeNull();
    expect(screen.getByText('Oxnard Business 5')).toBeTruthy();
    expect(screen.queryByText('Oxnard Business 6')).toBeNull();

    fireEvent.press(screen.getByLabelText('Load more Camarillo businesses'));

    expect(screen.getByText('Camarillo Business 6')).toBeTruthy();
    expect(screen.queryByText('Oxnard Business 6')).toBeNull();

    fireEvent.press(screen.getByLabelText('Load more Oxnard businesses'));

    expect(screen.getByText('Oxnard Business 6')).toBeTruthy();
  });
});
