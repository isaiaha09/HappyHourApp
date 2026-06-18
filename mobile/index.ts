import { registerRootComponent } from 'expo';
import { createElement } from 'react';
import { SafeAreaView, ScrollView, Text } from 'react-native';

let RootComponent: () => ReturnType<typeof createElement>;

try {
	const moduleValue = require('./App') as { default?: () => ReturnType<typeof createElement> };
	if (!moduleValue.default) {
		throw new Error('App module loaded without a default export.');
	}

	RootComponent = moduleValue.default;
} catch (error) {
	const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown startup error';
	RootComponent = function StartupErrorScreen() {
		return createElement(
			SafeAreaView,
			{ style: { backgroundColor: '#f7efe2', flex: 1 } },
			createElement(
				ScrollView,
				{ contentContainerStyle: { padding: 24 } },
				createElement(
					Text,
					{ style: { color: '#7a1d1d', fontSize: 18, fontWeight: '700', marginBottom: 12 } },
					'App startup failed',
				),
				createElement(
					Text,
					{ style: { color: '#2d221a', fontSize: 15, lineHeight: 22 } },
					errorMessage,
				),
			),
		);
	};
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootComponent);
