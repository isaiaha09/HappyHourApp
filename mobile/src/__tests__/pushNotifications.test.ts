import * as Notifications from 'expo-notifications';

import { registerForPushNotificationsAsync } from '../pushNotifications';

let mockApplicationId = 'com.ia09.diningdealz';
let mockPlatform: 'ios' | 'android' = 'ios';

jest.mock('expo-application', () => ({
	get applicationId() {
		return mockApplicationId;
	},
}));

jest.mock('expo-constants', () => ({
	__esModule: true,
	default: {
		easConfig: { projectId: 'test-project-id' },
		expoConfig: null,
	},
}));

jest.mock('expo-file-system', () => ({
	File: jest.fn(),
	Paths: { document: null },
}));

jest.mock('expo-notifications', () => ({
	AndroidImportance: { DEFAULT: 3 },
	getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test-token]' })),
	getPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: true })),
	setNotificationChannelAsync: jest.fn(async () => undefined),
}));

jest.mock('react-native', () => ({
	Platform: {
		get OS() {
			return mockPlatform;
		},
	},
}));

describe('registerForPushNotificationsAsync', () => {
	beforeEach(() => {
		mockApplicationId = 'com.ia09.diningdealz';
		mockPlatform = 'ios';
		jest.clearAllMocks();
	});

	it('binds an iOS push token to the DiningDealz standalone bundle', async () => {
		await registerForPushNotificationsAsync();

		expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
			applicationId: 'com.ia09.diningdealz',
			projectId: 'test-project-id',
		});
	});

	it('refuses to register an Expo Go token as the standalone app', async () => {
		mockApplicationId = 'host.exp.exponent';

		await expect(registerForPushNotificationsAsync()).rejects.toThrow('Expo Go cannot register');
	});

	it('configures the Android notification channel with the default sound', async () => {
		mockPlatform = 'android';

		await registerForPushNotificationsAsync();

		expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('business-updates', {
			name: 'Business updates',
			importance: Notifications.AndroidImportance.DEFAULT,
			sound: 'default',
		});
	});
});