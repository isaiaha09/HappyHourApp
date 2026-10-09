import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation, Pressable, Text, View } from 'react-native';

import { styles } from '../appStyles';
import { formatDealDescription } from '../dealDescription';
import type { BusinessDealMenuItem } from '../types';

type DealDescriptionProps = {
  description: string;
  descriptionPrice?: string;
  menuItems?: BusinessDealMenuItem[];
  presentation?: 'default' | 'profile';
  variant?: 'deal' | 'offer';
};

export function DealDescription({ description, descriptionPrice = '', menuItems = [], presentation = 'default', variant = 'deal' }: DealDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useRef(true);
  const isProfile = presentation === 'profile';
  const rows = useMemo(() => formatDealDescription(description, menuItems, descriptionPrice), [description, descriptionPrice, menuItems]);
  const isLong = rows.length > 2 || rows.some((row) => row.text.length > 180) || description.length > 180;
  const visibleRows = expanded || !isLong ? rows : rows.slice(0, 2);

  useEffect(() => {
    if (!isProfile) {
      return;
    }

    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotion.current = enabled;
    });
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then((enabled) => {
      if (active) {
        reduceMotion.current = enabled !== false;
      }
    }).catch(() => {
      reduceMotion.current = true;
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [isProfile]);

  function handleToggle() {
    if (isProfile && !reduceMotion.current) {
      LayoutAnimation.configureNext({
        duration: 180,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
    }
    setExpanded((current) => !current);
  }

  if (!rows.length) {
    return null;
  }

  return (
    <View style={[
      variant === 'offer' ? styles.dealDescriptionOffer : styles.dealDescriptionBlock,
      isProfile ? styles.publicProfileDealDescriptionBlock : null,
    ]}>
      {visibleRows.map((row, index) => {
        const menuItem = row.menuItem;
        return (
          <View
            accessibilityLabel={menuItem ? row.text : undefined}
            accessible={menuItem ? true : undefined}
            key={`${index}:${row.label ?? ''}`}
            style={[styles.dealDescriptionRow, isProfile ? styles.publicProfileDealDescriptionRow : null]}
          >
            {row.label ? (
              <Text style={[styles.dealDescriptionDay, isProfile ? styles.publicProfileDealDescriptionDay : null]}>
                {row.label}
              </Text>
            ) : null}
            {menuItem ? (
              <View style={styles.dealDescriptionMenuItem}>
                <View style={styles.dealDescriptionMenuHeadingRow}>
                  <Text
                    numberOfLines={!expanded && isLong ? 3 : undefined}
                    style={[
                      variant === 'offer' ? styles.dealDescriptionOfferText : styles.dealDescriptionText,
                      styles.dealDescriptionMenuName,
                      menuItem.detail ? styles.dealDescriptionMenuNameWithDetail : null,
                    ]}
                  >
                    {menuItem.name}
                  </Text>
                  {menuItem.price ? <Text style={styles.publicProfileMenuPrice}>{menuItem.price}</Text> : null}
                </View>
                {menuItem.detail ? (
                  <Text numberOfLines={!expanded && isLong ? 3 : undefined} style={styles.dealDescriptionMenuDetail}>
                    {menuItem.detail}
                  </Text>
                ) : null}
              </View>
            ) : (
              row.descriptionPrice ? (
                <View style={styles.dealDescriptionMenuHeadingRow}>
                  <Text
                    numberOfLines={!expanded && isLong ? 3 : undefined}
                    style={[
                      variant === 'offer' ? styles.dealDescriptionOfferText : styles.dealDescriptionText,
                      styles.dealDescriptionMenuName,
                      isProfile ? styles.publicProfileDealDescriptionText : null,
                    ]}
                  >
                    {row.text}
                  </Text>
                  <Text style={styles.publicProfileMenuPrice}>{row.descriptionPrice}</Text>
                </View>
              ) : (
                <Text
                  numberOfLines={!expanded && isLong ? 3 : undefined}
                  style={[
                    variant === 'offer' ? styles.dealDescriptionOfferText : styles.dealDescriptionText,
                    isProfile ? styles.publicProfileDealDescriptionText : null,
                  ]}
                >
                  {row.text}
                </Text>
              )
            )}
          </View>
        );
      })}
      {isLong ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={handleToggle}
          style={styles.dealDescriptionToggle}
        >
          <Text style={styles.dealDescriptionToggleText}>{expanded ? 'Show fewer details' : 'Show all details'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
