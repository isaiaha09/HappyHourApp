import { fireEvent, render, screen } from '@testing-library/react-native';

import { SocialButton } from '../components/SocialButton';

jest.mock('@expo/vector-icons', () => ({
  FontAwesome5: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text testID="social-platform-icon">{name}</Text>;
  },
}));

describe('business social links', () => {
  it('uses the installed TikTok brand glyph and keeps the social-link action intact', () => {
    const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome5Free.json');
    const metadata = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome5Free_meta.json');
    const onPress = jest.fn();
    render(<SocialButton platform="tiktok" username="diningdealz" onPress={onPress} />);

    const iconName = screen.getByTestId('social-platform-icon').props.children;
    expect(iconName).toBe('tiktok');
    expect(glyphs[iconName]).toBeDefined();
    expect(metadata.brands).toContain(iconName);
    fireEvent.press(screen.getByRole('link', { name: 'Open TikTok: @diningdealz' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
