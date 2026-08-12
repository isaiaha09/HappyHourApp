const { NativeModules } = require('react-native');

const nativeAnimationTimeouts = new Map();
const nativeAnimatedModule = NativeModules.NativeAnimatedModule;
if (nativeAnimatedModule) {
  nativeAnimatedModule.startAnimatingNode = jest.fn((animationId, _nodeTag, _config, endCallback) => {
    const timeout = setTimeout(() => {
      nativeAnimationTimeouts.delete(animationId);
      endCallback({ finished: true });
    }, 16);
    nativeAnimationTimeouts.set(animationId, timeout);
  });
  nativeAnimatedModule.stopAnimation = jest.fn((animationId) => {
    const timeout = nativeAnimationTimeouts.get(animationId);
    if (timeout !== undefined) {
      clearTimeout(timeout);
      nativeAnimationTimeouts.delete(animationId);
    }
  });
}

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
  PanGestureHandler: ({ children, ...props }) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { ...props, testID: 'mock-pan-gesture-handler' }, children);
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
