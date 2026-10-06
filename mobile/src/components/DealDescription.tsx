import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../appStyles';
import { formatDealDescription } from '../dealDescription';

type DealDescriptionProps = {
  description: string;
  variant?: 'deal' | 'offer';
};

export function DealDescription({ description, variant = 'deal' }: DealDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => formatDealDescription(description), [description]);
  const isLong = rows.length > 2 || description.length > 180;
  const visibleRows = expanded || !isLong ? rows : rows.slice(0, 2);

  if (!rows.length) {
    return null;
  }

  return (
    <View style={variant === 'offer' ? styles.dealDescriptionOffer : styles.dealDescriptionBlock}>
      {visibleRows.map((row, index) => (
        <View key={`${index}:${row.label ?? ''}`} style={styles.dealDescriptionRow}>
          {row.label ? <Text style={styles.dealDescriptionDay}>{row.label}</Text> : null}
          <Text
            numberOfLines={!expanded && isLong ? 3 : undefined}
            style={variant === 'offer' ? styles.dealDescriptionOfferText : styles.dealDescriptionText}
          >
            {row.text}
          </Text>
        </View>
      ))}
      {isLong ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={styles.dealDescriptionToggle}
        >
          <Text style={styles.dealDescriptionToggleText}>{expanded ? 'Show fewer details' : 'Show all details'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
