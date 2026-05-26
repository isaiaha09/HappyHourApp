import { Text, View } from 'react-native';

import { styles } from '../appStyles';

export function SplashScreen() {
  return (
    <View style={styles.splashScreen}>
      <View style={styles.splashLogoShell}>
        <Text style={styles.splashLogoText}>HH</Text>
      </View>
      <Text style={styles.splashTitle}>HappyHourApp</Text>
      <Text style={styles.splashSubtitle}>Find your next deal or claim your business profile.</Text>
    </View>
  );
}
