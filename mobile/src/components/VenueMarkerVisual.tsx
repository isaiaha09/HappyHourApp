import { Ionicons } from '@expo/vector-icons';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { getVenueMarkerStyle } from '../browseConfig';
import { styles } from '../appStyles';

type VenueMarkerVisualProps = {
  markerStyle: ReturnType<typeof getVenueMarkerStyle>;
  style?: StyleProp<ViewStyle>;
};

export function VenueMarkerVisual({ markerStyle, style }: VenueMarkerVisualProps) {
  const markerSize = 32;
  const coreSize = 14;
  const iconSize = 12;

  return (
    <View style={[styles.mapMarker, style]}>
      <Ionicons color={markerStyle.fill} name="location-sharp" size={markerSize} style={styles.mapMarkerLayer} />
      <Ionicons color={markerStyle.stroke} name="location-outline" size={markerSize} style={styles.mapMarkerLayer} />
      <View
        style={[
          styles.mapMarkerCore,
          {
            backgroundColor: markerStyle.fill,
            borderColor: markerStyle.stroke,
            height: coreSize,
            left: (markerSize - coreSize) / 2,
            top: 6,
            width: coreSize,
          },
        ]}
      />
      <View style={[styles.mapMarkerIcon, { height: 19, top: 5, width: markerSize }]}> 
        <Ionicons color="#fffaf4" name={markerStyle.icon} size={iconSize} />
      </View>
    </View>
  );
}