import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { styles } from '../appStyles';

type ProfilePhotoGalleryProps = {
  imageUrls: string[];
  onOpenPhoto: (index: number) => void;
};

export function ProfilePhotoGallery({ imageUrls, onOpenPhoto }: ProfilePhotoGalleryProps) {
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [galleryWidth, setGalleryWidth] = useState(Math.max(1, windowWidth - 32));
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const visibleIndex = Math.min(activeIndex, Math.max(0, imageUrls.length - 1));

  useEffect(() => {
    const nextIndex = Math.min(activeIndexRef.current, Math.max(0, imageUrls.length - 1));
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    scrollRef.current?.scrollTo({ x: nextIndex * galleryWidth, animated: false });
  }, [galleryWidth, imageUrls.length]);

  function handlePageChange(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / galleryWidth);
    const clampedIndex = Math.max(0, Math.min(nextIndex, imageUrls.length - 1));
    if (clampedIndex !== activeIndexRef.current) {
      activeIndexRef.current = clampedIndex;
      setActiveIndex(clampedIndex);
    }
  }

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        bounces={imageUrls.length > 1}
        contentContainerStyle={styles.publicProfilePhotoGalleryRow}
        horizontal
        keyboardShouldPersistTaps="handled"
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth > 0) {
            setGalleryWidth((current) => Math.abs(current - nextWidth) > 1 ? nextWidth : current);
          }
        }}
        onMomentumScrollEnd={handlePageChange}
        onScroll={Platform.OS === 'web' ? handlePageChange : undefined}
        pagingEnabled
        scrollEventThrottle={Platform.OS === 'web' ? 16 : undefined}
        showsHorizontalScrollIndicator={false}
        style={styles.publicProfilePhotoGalleryScroll}
        testID="profile-photo-gallery"
      >
        {imageUrls.map((imageUrl, index) => (
          <Pressable
            accessibilityLabel={`Open business photo ${index + 1} of ${imageUrls.length}`}
            accessibilityRole="button"
            key={imageUrl}
            onPress={() => onOpenPhoto(index)}
            style={({ pressed }) => [
              styles.publicProfilePhotoCard,
              { width: galleryWidth },
              pressed ? styles.publicProfilePressed : null,
            ]}
          >
            <Image
              resizeMode="cover"
              source={{ uri: imageUrl }}
              style={[styles.publicProfilePhotoImage, { height: Math.min(galleryWidth * 0.65, 300) }]}
            />
          </Pressable>
        ))}
      </ScrollView>
      {imageUrls.length > 1 ? (
        <View style={styles.publicProfilePhotoPagination}>
          <Text style={styles.publicProfilePhotoPaginationText}>Swipe photos</Text>
          <Text
            accessibilityLabel={`Photo ${visibleIndex + 1} of ${imageUrls.length}`}
            style={styles.publicProfilePhotoPaginationText}
          >
            {visibleIndex + 1} / {imageUrls.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
