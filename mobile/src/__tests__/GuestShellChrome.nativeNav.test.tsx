import { render } from '@testing-library/react-native';

const mockNativeBottomNav = jest.fn((_props: unknown) => null);

jest.mock('../components/NativeIOSLiquidGlass', () => ({
  NativeIOSLiquidGlassBottomNav: (props: unknown) => mockNativeBottomNav(props),
  NativeIOSLiquidGlassHeaderButton: () => null,
  isNativeIOSLiquidGlassBottomNavAvailable: () => true,
  isNativeIOSLiquidGlassHeaderButtonAvailable: () => true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

import { GuestShellChrome } from '../components/GuestShellChrome';

describe('GuestShellChrome native navigation', () => {
  beforeEach(() => {
    mockNativeBottomNav.mockClear();
  });

  it('requests the guest chrome entrance on the native tab bar', () => {
    render(
      <GuestShellChrome
        onCreateAccount={jest.fn()}
        onSelectPortal={jest.fn()}
      />,
    );

    expect(mockNativeBottomNav).toHaveBeenCalled();
    expect(mockNativeBottomNav.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ entranceMode: 'guest-chrome' }),
    );
  });

  it('keeps the native tab bar visible in the non-interactive outgoing map', () => {
    const onCreateAccount = jest.fn();
    const onSelectPortal = jest.fn();
    const screen = render(
      <GuestShellChrome
        onCreateAccount={onCreateAccount}
        onSelectPortal={onSelectPortal}
        showBottomNav
      />,
    );

    mockNativeBottomNav.mockClear();
    screen.rerender(
      <GuestShellChrome
        interactive={false}
        onCreateAccount={onCreateAccount}
        onSelectPortal={onSelectPortal}
        showBottomNav
      />,
    );
    expect(mockNativeBottomNav).toHaveBeenCalledWith(
      expect.objectContaining({ entranceMode: 'guest-chrome' }),
    );
    expect(mockNativeBottomNav.mock.calls[0]?.[0]).not.toHaveProperty('presentationVisible');

    mockNativeBottomNav.mockClear();
    screen.rerender(
      <GuestShellChrome
        interactive={false}
        onCreateAccount={onCreateAccount}
        onSelectPortal={onSelectPortal}
        showBottomNav={false}
      />,
    );
    expect(mockNativeBottomNav).not.toHaveBeenCalled();
  });
});
