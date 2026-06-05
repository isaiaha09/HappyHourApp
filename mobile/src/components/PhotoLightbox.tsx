import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '../appStyles';

type PhotoLightboxProps = {
  imageUrls: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
};

export function PhotoLightbox({
  imageUrls,
  initialIndex = 0,
  visible,
  onClose,
}: PhotoLightboxProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const flatListRef = useRef<FlatList<string> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!visible || !imageUrls.length) {
      return;
    }

    const safeIndex = Math.min(Math.max(initialIndex, 0), imageUrls.length - 1);
    setCurrentIndex(safeIndex);
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({ index: safeIndex, animated: false });
    });
  }, [imageUrls.length, initialIndex, visible]);

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) {
      return;
    }

    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(Math.min(Math.max(nextIndex, 0), Math.max(imageUrls.length - 1, 0)));
  }

  if (!imageUrls.length) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.photoLightboxOverlay}>
        <View style={[styles.photoLightboxHeader, { paddingTop: Math.max(insets.top + 8, 18) }]}>
          <Text style={styles.photoLightboxCounter}>{`${currentIndex + 1} / ${imageUrls.length}`}</Text>
          <Pressable onPress={onClose} style={styles.photoLightboxCloseButton}>
            <Text style={styles.photoLightboxCloseButtonText}>X</Text>
          </Pressable>
        </View>
        <FlatList
          data={imageUrls}
          getItemLayout={(_, index) => ({ index, length: width, offset: width * index })}
          horizontal
          initialNumToRender={1}
          keyExtractor={(item) => item}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          pagingEnabled
          ref={flatListRef}
          renderItem={({ item }) => (
            <View style={[styles.photoLightboxSlide, { width }]}> 
              <Image resizeMode="contain" source={{ uri: item }} style={styles.photoLightboxImage} />
            </View>
          )}
          showsHorizontalScrollIndicator={false}
        />
      </View>
    </Modal>
  );
}