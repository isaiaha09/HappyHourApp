import { Image, Text, View } from 'react-native';

import { styles } from '../appStyles';

export function SplashScreen() {
  return (
    <View style={styles.splashScreen}>
      <View style={styles.splashLogoShell}>
        <Image source={require('../../assets/DiningDealz-Logo-Transparent.png')} style={styles.splashLogoImage} resizeMode="contain" />
      </View>
      <Text style={styles.splashTitle}>DiningDealz</Text>
      <Text style={styles.splashSubtitle}>Find your next deal or claim your business profile.</Text>
    </View>
  );
}
