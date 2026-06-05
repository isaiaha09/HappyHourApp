import { FontAwesome5 } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../appStyles';
import { SOCIAL_PLATFORM_LABELS, formatSocialProfileUsername } from '../socialProfiles';
import type { SocialPlatform } from '../types';

type SocialButtonProps = {
  onPress: () => void;
  platform: SocialPlatform;
  username: string;
};

const iconNames: Record<SocialPlatform, string> = {
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'music',
  youtube: 'youtube',
  website: 'globe',
};

export function SocialButton({ onPress, platform, username }: SocialButtonProps) {
  return (
    <Pressable onPress={onPress} style={styles.socialButtonCard}>
      <View style={styles.socialButtonIconWrap}>
        <FontAwesome5 color="#9e5b49" name={iconNames[platform] as any} size={16} />
      </View>
      <View style={styles.socialButtonTextWrap}>
        <Text style={styles.socialButtonLabel}>{SOCIAL_PLATFORM_LABELS[platform]}</Text>
        <Text numberOfLines={1} style={styles.socialButtonHandle}>{formatSocialProfileUsername(platform, username)}</Text>
      </View>
    </Pressable>
  );
}
