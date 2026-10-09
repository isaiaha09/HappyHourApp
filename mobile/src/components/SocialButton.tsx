import { FontAwesome5 } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../appStyles';
import { SOCIAL_PLATFORM_LABELS, formatSocialProfileUsername } from '../socialProfiles';
import { theme } from '../styles/theme';
import type { SocialPlatform } from '../types';

type SocialButtonProps = {
  onPress: () => void;
  platform: SocialPlatform;
  username: string;
};

const iconNames: Record<SocialPlatform, string> = {
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  website: 'globe',
};

export function SocialButton({ onPress, platform, username }: SocialButtonProps) {
  const displayUsername = formatSocialProfileUsername(platform, username);
  return (
    <Pressable
      accessibilityLabel={`Open ${SOCIAL_PLATFORM_LABELS[platform]}: ${displayUsername}`}
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButtonCard,
        styles.publicProfileSocialCard,
        pressed ? styles.publicProfilePressed : null,
      ]}
    >
      <View style={styles.publicProfileSocialHeadingRow}>
        <View style={[styles.socialButtonIconWrap, styles.publicProfileSocialIconWrap]}>
          <FontAwesome5 color={theme.accentStrong} name={iconNames[platform] as any} size={16} />
        </View>
        <Text style={[styles.socialButtonLabel, styles.publicProfileSocialLabel]}>{SOCIAL_PLATFORM_LABELS[platform]}</Text>
      </View>
      <Text style={[styles.socialButtonHandle, styles.publicProfileSocialHandle]}>{displayUsername}</Text>
    </Pressable>
  );
}
