const { NativeModules } = require('react-native');

const pendingAnimationFrameTimers = new Set();

global.cancelAnimationFrame = (timer) => {
  pendingAnimationFrameTimers.delete(timer);
  clearTimeout(timer);
};

global.requestAnimationFrame = (callback) => {
  const timer = setTimeout(() => {
    pendingAnimationFrameTimers.delete(timer);
    callback(jest.now());
  }, 0);
  pendingAnimationFrameTimers.add(timer);
  return timer;
};

global.clearPendingAnimationFrameTimers = () => {
  pendingAnimationFrameTimers.forEach((timer) => clearTimeout(timer));
  pendingAnimationFrameTimers.clear();
};

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

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: React.forwardRef(({ children }, ref) => {
      React.useImperativeHandle(ref, () => ({
        close: jest.fn(),
        openLeft: jest.fn(),
        openRight: jest.fn(),
        reset: jest.fn(),
      }));
      return React.createElement(View, null, children);
    }),
  };
});

jest.mock('react-native-gesture-handler/src/RNGestureHandlerModule', () => ({
  __esModule: true,
  default: {
    install: jest.fn(),
  },
}));

jest.mock('@kishannareshpal/expo-pdf', () => ({
  PdfView: ({ uri, style }) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, {
      accessibilityLabel: uri,
      style,
      testID: 'readonly-pdf-view',
    });
  },
}));
