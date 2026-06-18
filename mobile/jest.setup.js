const { NativeModules } = require('react-native');

NativeModules.RNGestureHandlerModule = {
  ...(NativeModules.RNGestureHandlerModule || {}),
  install: jest.fn(),
};

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, null, children);
  },
  PanGestureHandler: ({ children }) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, null, children);
  },
  State: {
    UNDETERMINED: 0,
    FAILED: 1,
    BEGAN: 2,
    CANCELLED: 3,
    ACTIVE: 4,
    END: 5,
  },
}));

jest.mock('react-native-gesture-handler/src/RNGestureHandlerModule', () => ({
  __esModule: true,
  default: {
    install: jest.fn(),
  },
}));
