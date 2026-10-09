import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { styles } from '../appStyles';

// A visual group, not a step or disclosure: every existing control stays visible.
export function AccountSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.accountSection}>
      <Text accessibilityRole="header" style={styles.accountSectionTitle}>{title}</Text>
      <View style={styles.accountFields}>{children}</View>
    </View>
  );
}
