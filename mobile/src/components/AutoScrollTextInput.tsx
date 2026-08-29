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

type ScrollResponderHandle = {
  scrollResponderScrollNativeHandleToKeyboard?: (nodeHandle: number, additionalOffset: number, preventNegativeScrollOffset: boolean) => void;
};

type KeyboardScrollViewHandle = ScrollView & {
  getScrollResponder?: () => ScrollResponderHandle | null;
};

export type AutoScrollTextInputProps = ComponentProps<typeof TextInput> & {
  onBeforeAutoScroll?: (target?: number | null) => void;
  scrollViewRef: RefObject<ScrollView | null>;
};

export type AutoScrollFormController = {
  handleFieldFocus: (target?: number | null) => void;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollToTop: () => void;
  scrollViewRef: RefObject<ScrollView | null>;
};

export function useAutoScrollForm(): AutoScrollFormController {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const currentScrollOffsetRef = useRef(0);
  const restoreScrollOffsetRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  const focusedFieldTargetRef = useRef<number | null>(null);

  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(keyboardShowEvent, () => {
      keyboardVisibleRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollFocusedFieldIntoView(scrollViewRef, focusedFieldTargetRef.current);
        });
      });
    });
    const hideSubscription = Keyboard.addListener(keyboardHideEvent, () => {
      keyboardVisibleRef.current = false;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleFieldFocus = useCallback((target?: number | null) => {
    focusedFieldTargetRef.current = target ?? null;
    if (!keyboardVisibleRef.current) {
      restoreScrollOffsetRef.current = currentScrollOffsetRef.current;
    }
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
    handleFieldFocus,
    handleScroll,
    scrollToTop,
    scrollViewRef,
  };
}

function scrollFocusedFieldIntoView(scrollViewRef: RefObject<ScrollView | null>, target: number | null) {
  if (target === null) {
    return;
  }

  requestAnimationFrame(() => {
    const responder = (scrollViewRef.current as KeyboardScrollViewHandle | null)?.getScrollResponder?.();
    responder?.scrollResponderScrollNativeHandleToKeyboard?.(target, 140, true);
  });
}

export function AutoScrollTextInput({ onBeforeAutoScroll, onFocus, scrollViewRef, ...props }: AutoScrollTextInputProps) {
  const inputRef = useRef<TextInput | null>(null);

  return (
    <TextInput
      {...props}
      ref={inputRef}
      onFocus={(event) => {
        const target = findNodeHandle(inputRef.current);
        onBeforeAutoScroll?.(target);
        scrollFocusedFieldIntoView(scrollViewRef, target);
        onFocus?.(event);
      }}
    />
  );
}
