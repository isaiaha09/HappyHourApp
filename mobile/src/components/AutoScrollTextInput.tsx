import { useCallback, useEffect, useRef, type ComponentProps, type RefObject } from 'react';
import {
  findNodeHandle,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

type FocusedFieldMeasurer = (onMeasure: (top: number, height: number) => void) => void;
const FOCUSED_FIELD_KEYBOARD_GAP = 140;

export type AutoScrollTextInputProps = ComponentProps<typeof TextInput> & {
  onBeforeAutoScroll?: (target?: number | null, measureFocusedField?: FocusedFieldMeasurer) => void;
  onFieldBlur?: (target?: number | null) => void;
  scrollViewRef: RefObject<ScrollView | null>;
};

export type AutoScrollFormController = {
  handleFieldBlur: (target?: number | null) => void;
  handleFieldFocus: (target?: number | null, measureFocusedField?: FocusedFieldMeasurer) => void;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleScrollBeginDrag: () => void;
  scrollToTop: () => void;
  scrollViewRef: RefObject<ScrollView | null>;
};

export function useAutoScrollForm(): AutoScrollFormController {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const currentScrollOffsetRef = useRef(0);
  const restoreScrollOffsetRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  const keyboardReadyRef = useRef(false);
  const keyboardTopYRef = useRef<number | null>(null);
  const focusedFieldTargetRef = useRef<number | null>(null);
  const focusedFieldMeasurerRef = useRef<FocusedFieldMeasurer | null>(null);
  const focusScrollRequestRef = useRef(0);

  useEffect(() => {
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const keyboardWillShowSubscription = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillShow', (event) => {
        keyboardVisibleRef.current = true;
        keyboardReadyRef.current = false;
        keyboardTopYRef.current = event.endCoordinates.screenY;
      })
      : null;
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardVisibleRef.current = true;
      keyboardReadyRef.current = true;
      keyboardTopYRef.current = event.endCoordinates.screenY;
      const target = focusedFieldTargetRef.current;
      const measureFocusedField = focusedFieldMeasurerRef.current;
      const requestId = focusScrollRequestRef.current;
      scheduleFocusedFieldScroll(scrollViewRef, currentScrollOffsetRef, target, measureFocusedField, keyboardTopYRef.current, requestId, focusScrollRequestRef, focusedFieldTargetRef);
    });
    const hideSubscription = Keyboard.addListener(keyboardHideEvent, () => {
      keyboardVisibleRef.current = false;
      keyboardReadyRef.current = false;
      keyboardTopYRef.current = null;
      focusedFieldTargetRef.current = null;
      focusedFieldMeasurerRef.current = null;
      focusScrollRequestRef.current += 1;
    });

    return () => {
      keyboardWillShowSubscription?.remove();
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleFieldFocus = useCallback((target?: number | null, measureFocusedField?: FocusedFieldMeasurer) => {
    focusedFieldTargetRef.current = target ?? null;
    focusedFieldMeasurerRef.current = measureFocusedField ?? null;
    focusScrollRequestRef.current += 1;
    if (!keyboardVisibleRef.current) {
      restoreScrollOffsetRef.current = currentScrollOffsetRef.current;
    } else if (keyboardReadyRef.current) {
      scheduleFocusedFieldScroll(scrollViewRef, currentScrollOffsetRef, focusedFieldTargetRef.current, focusedFieldMeasurerRef.current, keyboardTopYRef.current, focusScrollRequestRef.current, focusScrollRequestRef, focusedFieldTargetRef);
    }
  }, []);

  const handleFieldBlur = useCallback((target?: number | null) => {
    if (focusedFieldTargetRef.current !== (target ?? null)) {
      return;
    }
    focusedFieldTargetRef.current = null;
    focusedFieldMeasurerRef.current = null;
    focusScrollRequestRef.current += 1;
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    // A deliberate drag takes precedence over any keyboard-triggered scroll
    // that may still be queued for the previously focused field.
    focusedFieldTargetRef.current = null;
    focusedFieldMeasurerRef.current = null;
    focusScrollRequestRef.current += 1;
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    if (!keyboardVisibleRef.current) {
      restoreScrollOffsetRef.current = currentScrollOffsetRef.current;
    }
  }, []);

  const scrollToTop = useCallback(() => {
    restoreScrollOffsetRef.current = 0;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        animated: true,
        y: 0,
      });
    });
  }, []);

  return {
    handleFieldBlur,
    handleFieldFocus,
    handleScroll,
    handleScrollBeginDrag,
    scrollToTop,
    scrollViewRef,
  };
}

function scheduleFocusedFieldScroll(
  scrollViewRef: RefObject<ScrollView | null>,
  currentScrollOffsetRef: { current: number },
  target: number | null,
  measureFocusedField: FocusedFieldMeasurer | null,
  keyboardTopY: number | null,
  requestId: number,
  currentRequestRef: { current: number },
  focusedTargetRef: { current: number | null },
) {
  if (target === null || measureFocusedField === null || keyboardTopY === null) {
    return;
  }

  requestAnimationFrame(() => {
    if (currentRequestRef.current !== requestId || focusedTargetRef.current !== target) {
      return;
    }
    measureFocusedField((top, height) => {
      if (currentRequestRef.current !== requestId || focusedTargetRef.current !== target) {
        return;
      }
      const gap = keyboardTopY - (top + height);
      const requiredScroll = FOCUSED_FIELD_KEYBOARD_GAP - gap;
      if (requiredScroll <= 0) {
        return;
      }
      scrollViewRef.current?.scrollTo({
        animated: true,
        y: currentScrollOffsetRef.current + requiredScroll,
      });
    });
  });
}

export function AutoScrollTextInput({ keyboardAppearance = 'dark', onBeforeAutoScroll, onFieldBlur, onBlur, onFocus, scrollViewRef, ...props }: AutoScrollTextInputProps) {
  const inputRef = useRef<TextInput | null>(null);
  const focusedTargetRef = useRef<number | null>(null);

  return (
    <TextInput
      {...props}
      keyboardAppearance={keyboardAppearance}
      ref={inputRef}
      onFocus={(event) => {
        const target = findNodeHandle(inputRef.current);
        focusedTargetRef.current = target;
        onBeforeAutoScroll?.(target, (onMeasure) => {
          inputRef.current?.measureInWindow((_x, top, _width, height) => onMeasure(top, height));
        });
        onFocus?.(event);
      }}
      onBlur={(event) => {
        onFieldBlur?.(focusedTargetRef.current);
        focusedTargetRef.current = null;
        onBlur?.(event);
      }}
    />
  );
}
