import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, ScrollView, type KeyboardEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useAutoScrollForm } from './AutoScrollTextInput';

const keyboardEvent: KeyboardEvent = {
  duration: 250,
  easing: 'keyboard',
  endCoordinates: { height: 344, screenX: 0, screenY: 500, width: 390 },
  startCoordinates: { height: 344, screenX: 0, screenY: 844, width: 390 },
};

let keyboardListeners: Record<string, ((event: KeyboardEvent) => void) | undefined>;
let animationFrames: FrameRequestCallback[];

function flushAnimationFrames() {
  act(() => {
    const pendingFrames = animationFrames;
    animationFrames = [];
    pendingFrames.forEach((callback) => callback(0));
  });
}

function showKeyboard() {
  act(() => {
    keyboardListeners.keyboardWillShow?.(keyboardEvent);
    keyboardListeners.keyboardDidShow?.(keyboardEvent);
  });
}

function setupForm() {
  const { result } = renderHook(useAutoScrollForm);
  const scrollTo = jest.fn();
  result.current.scrollViewRef.current = { scrollTo } as unknown as ScrollView;
  return { controller: result.current, scrollTo };
}

describe('shared onboarding and logged-in focus scrolling', () => {
  beforeEach(() => {
    keyboardListeners = {};
    animationFrames = [];
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      keyboardListeners[event] = listener;
      return { remove: () => { delete keyboardListeners[event]; } } as ReturnType<typeof Keyboard.addListener>;
    });
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('scrolls a focused field flush with the keyboard to the established 140-point gap', () => {
    const { controller, scrollTo } = setupForm();
    act(() => {
      controller.handleScroll({ nativeEvent: { contentOffset: { x: 0, y: 200 } } } as NativeSyntheticEvent<NativeScrollEvent>);
      controller.handleFieldFocus(1, (measure) => measure(460, 40));
    });
    flushAnimationFrames();
    expect(scrollTo).not.toHaveBeenCalled();

    showKeyboard();
    flushAnimationFrames();

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ animated: true, y: 340 });
  });

  it('focuses the next field without requiring another keyboard-show event', () => {
    const { controller, scrollTo } = setupForm();
    showKeyboard();
    act(() => controller.handleFieldFocus(1, (measure) => measure(460, 40)));
    flushAnimationFrames();
    scrollTo.mockClear();

    act(() => controller.handleFieldFocus(2, (measure) => measure(420, 40)));
    flushAnimationFrames();

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ animated: true, y: 100 });
  });

  it('does not scroll a field that already has sufficient keyboard clearance', () => {
    const { controller, scrollTo } = setupForm();
    showKeyboard();
    act(() => controller.handleFieldFocus(1, (measure) => measure(270, 40)));
    flushAnimationFrames();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('ignores queued scrolling for a field when a different field is selected', () => {
    const { controller, scrollTo } = setupForm();
    const measurePreviousField = jest.fn();
    showKeyboard();
    act(() => {
      controller.handleFieldFocus(1, measurePreviousField);
      controller.handleFieldFocus(2, (measure) => measure(420, 40));
    });
    flushAnimationFrames();
    expect(measurePreviousField).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ animated: true, y: 100 });
  });

  it.each(['blur', 'manual drag', 'keyboard dismissal'])('cancels pending focus scrolling after %s', (action) => {
    const { controller, scrollTo } = setupForm();
    showKeyboard();
    act(() => controller.handleFieldFocus(1, (measure) => measure(460, 40)));
    act(() => {
      if (action === 'blur') {
        controller.handleFieldBlur(1);
      } else if (action === 'manual drag') {
        controller.handleScrollBeginDrag();
      } else {
        keyboardListeners.keyboardWillHide?.(keyboardEvent);
        keyboardListeners.keyboardDidHide?.(keyboardEvent);
      }
    });
    flushAnimationFrames();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
