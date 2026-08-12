import { memo } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { getVenueMarkerStyle } from '../browseConfig';
import { styles } from '../appStyles';

type VenueMarkerVisualProps = {
  markerStyle: ReturnType<typeof getVenueMarkerStyle>;
  style?: StyleProp<ViewStyle>;
};

export const VenueMarkerVisual = memo(function VenueMarkerVisual({ markerStyle, style }: VenueMarkerVisualProps) {
  const markerSize = 34;
  const neonBorderSize = 31;
  const innerBodySize = 27;
  const markerCoreSize = 14;
  const iconSize = 11;

  return (
    <View style={[styles.mapMarker, style]}>
      <MaterialCommunityIcons
        color={markerStyle.fill}
        name="map-marker"
        size={markerSize}
        style={[styles.mapMarkerLayer, { left: -1, opacity: 0.2, top: 0 }]}
      />
      <MaterialCommunityIcons
        color={markerStyle.stroke}
        name="map-marker"
        size={markerSize}
        style={[styles.mapMarkerLayer, { top: 0 }]}
      />
      <MaterialCommunityIcons
        color={markerStyle.fill}
        name="map-marker"
        size={neonBorderSize}
        style={[styles.mapMarkerLayer, { left: 1.5, top: 2 }]}
      />
      <MaterialCommunityIcons
        color={markerStyle.fill}
        name="map-marker"
        size={innerBodySize}
        style={[styles.mapMarkerLayer, { left: 3.5, top: 4 }]}
      />
      <MaterialCommunityIcons
        color="rgba(255, 250, 244, 0.72)"
        name="map-marker-outline"
        size={innerBodySize}
        style={[styles.mapMarkerLayer, { left: 3.5, top: 4 }]}
      />
      <View
        style={[
          styles.mapMarkerCore,
          {
            backgroundColor: markerStyle.stroke,
            borderColor: markerStyle.fill,
            height: markerCoreSize,
            left: (markerSize - markerCoreSize) / 2,
            top: 7,
            width: markerCoreSize,
          },
        ]}
      />
      <View style={styles.mapMarkerHighlight} />
      <View
        style={[
          styles.mapMarkerIcon,
          {
            height: markerCoreSize,
            left: (markerSize - markerCoreSize) / 2,
            top: 7,
            width: markerCoreSize,
          },
        ]}
      >
        <MaterialCommunityIcons
          color="#fffaf4"
          name={markerStyle.icon}
          size={iconSize}
          style={styles.mapMarkerIconGlyph}
        />
      </View>
    </View>
  );
});