import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('../components/NativeIOSLiquidGlass', () => ({
  NativeIOSLiquidGlassBottomNav: () => null,
  NativeIOSLiquidGlassHeaderButton: ({ fallback }: { fallback: React.ReactNode }) => fallback,
  isNativeIOSLiquidGlassBottomNavAvailable: () => false,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { resetSplashIntroState, SplashScreen } from '../screens/SplashScreen';

describe('SplashScreen startup flow', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    resetSplashIntroState();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('waits for the logo asset, shows a closable Home Feed notice, and opens the guest map after the intro', () => {
    const onIntroComplete = jest.fn();
    const onCreateAccount = jest.fn();
    const onSelectPortal = jest.fn();

    const view = render(
      <SplashScreen
        assetsReady={false}
        onCreateAccount={onCreateAccount}
        onIntroComplete={onIntroComplete}
        onSelectPortal={onSelectPortal}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Open Home Feed' }));
    expect(screen.getByText('Coming Soon')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Close Home Feed message' }));
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Coming Soon')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onIntroComplete).not.toHaveBeenCalled();

    view.rerender(
      <SplashScreen
        assetsReady
        onCreateAccount={onCreateAccount}
        onIntroComplete={onIntroComplete}
        onSelectPortal={onSelectPortal}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2800);
    });

    expect(onIntroComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(onIntroComplete).toHaveBeenCalledTimes(1);
  });

  it('does not auto-open the guest map when the splash remounts after the intro already played', () => {
    const firstIntroComplete = jest.fn();

    const firstView = render(
      <SplashScreen
        assetsReady
        onCreateAccount={jest.fn()}
        onIntroComplete={firstIntroComplete}
        onSelectPortal={jest.fn()}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(3400);
    });

    expect(firstIntroComplete).toHaveBeenCalledTimes(1);
    firstView.unmount();

    const replayIntroComplete = jest.fn();

    render(
      <SplashScreen
        assetsReady
        onCreateAccount={jest.fn()}
        onIntroComplete={replayIntroComplete}
        onSelectPortal={jest.fn()}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(replayIntroComplete).not.toHaveBeenCalled();
  });

  it('disables guest chrome interactions while the splash stays mounted under another screen', () => {
    const view = render(
      <SplashScreen
        assetsReady
        onCreateAccount={jest.fn()}
        onIntroComplete={jest.fn()}
        onSelectPortal={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Open Home Feed' }));
    expect(screen.getByText('Coming Soon')).toBeTruthy();

    view.rerender(
      <SplashScreen
        assetsReady
        chromeInteractive={false}
        onCreateAccount={jest.fn()}
        onIntroComplete={jest.fn()}
        onSelectPortal={jest.fn()}
      />,
    );

    expect(screen.queryByText('Coming Soon')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Open Home Feed' }));
    expect(screen.queryByText('Coming Soon')).toBeNull();
  });
});