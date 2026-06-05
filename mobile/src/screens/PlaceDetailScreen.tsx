import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';

import { styles } from '../appStyles';
import { buildGoogleReviewsUrl, dedupeImageUrls, formatPlaceAddress, getPlacePreviewRegion, openMapsAddress } from '../placeHelpers';
import type { Deal, HappyHourWindow, OperatingHourWindow, PlaceDetail, PlaceLocationDetail } from '../types';

export type PlaceDetailScreenProps = {
  backButtonLabel?: string;
  distanceLabel?: string | null;
  onEditBusinessProfile?: () => void;
  onClaimBusiness?: () => void;
  showClaimBusinessControl?: boolean;
  showEditBusinessProfileControl?: boolean;
  detailLoading: boolean;
  errorMessage: string | null;
  favoriteHelperText: string | null;
  favoriteSubmitting: boolean;
  isLandscape: boolean;
  isFavorited: boolean;
  onBack: () => void;
  onSelectLocation: (locationId: number) => void;
  onToggleFavorite: () => void;
  showFavoriteControl: boolean;
  selectedPlace: PlaceDetail | null;
  selectedPlaceDeals: Deal[];
  selectedPlaceLocation: PlaceDetail | PlaceLocationDetail | null;
  selectedPlaceOperatingHours: OperatingHourWindow[];
};

export function PlaceDetailScreen({
  backButtonLabel = 'Back to Places',
  distanceLabel = null,
  onEditBusinessProfile,
  onClaimBusiness,
  showClaimBusinessControl = false,
  showEditBusinessProfileControl = false,
  detailLoading,
  errorMessage,
  favoriteHelperText,
  favoriteSubmitting,
  isLandscape,
  isFavorited,
  onBack,
  onSelectLocation,
  onToggleFavorite,
  showFavoriteControl,
  selectedPlace,
  selectedPlaceDeals,
  selectedPlaceLocation,
  selectedPlaceOperatingHours,
}: PlaceDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const selectedPlaceMapRegion = getPlacePreviewRegion(selectedPlaceLocation ?? selectedPlace);
  const showVerifiedBadge = !!selectedPlace && (selectedPlace.is_claimed || selectedPlace.is_verified);
  const selectedPlaceImageUrls = dedupeImageUrls([
    ...(selectedPlaceLocation?.image_urls ?? []),
    ...(selectedPlace?.image_urls ?? []),
  ]);

  return (
    <View style={[styles.detailScreenRoot, isLandscape ? styles.detailScreenLandscape : null]}>
      <ScrollView
        contentContainerStyle={[
          styles.detailScrollContent,
          isLandscape ? styles.detailScrollContentLandscape : null,
          { paddingBottom: Math.max(insets.bottom + 118, 132) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.screenHeaderBar, styles.screenHeaderBarSingle]}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>{backButtonLabel}</Text>
          </Pressable>
        </View>

        {detailLoading && !selectedPlace ? (
          <View style={styles.centerState}>
            <Text style={styles.centerStateText}>Loading place details...</Text>
          </View>
        ) : null}

        {selectedPlace ? (
          <View style={[styles.detailCard, isLandscape ? styles.detailCardLandscape : null]}>
            <View style={styles.detailHeaderRow}>
              <View style={styles.detailHeaderCopy}>
                <Text style={styles.detailCity}>{selectedPlaceLocation?.city_label ?? selectedPlace.city_label}</Text>
                <Text style={styles.detailTitle}>{selectedPlace.name}</Text>
                <Text style={styles.detailMeta}>{selectedPlace.venue_type_label}</Text>
                {distanceLabel ? <Text style={styles.detailMeta}>{distanceLabel}</Text> : null}
              </View>
              <View style={styles.detailHeaderActions}>
                {showVerifiedBadge ? (
                  <View accessibilityLabel="Claimed or verified business" style={styles.verifiedStatusBadge}>
                    <Text style={styles.verifiedStatusBadgeIcon}>✓</Text>
                  </View>
                ) : null}
                {showFavoriteControl ? (
                  <Pressable
                    accessibilityLabel={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    onPress={onToggleFavorite}
                    style={[
                      styles.favoriteStarButton,
                      isFavorited ? styles.favoriteStarButtonActive : null,
                      favoriteSubmitting ? styles.linkButtonDisabled : null,
                    ]}
                  >
                    <Text style={[styles.favoriteStarIcon, isFavorited ? styles.favoriteStarIconActive : null]}>
                      {isFavorited ? '★' : '☆'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {showFavoriteControl && favoriteHelperText ? <Text style={styles.dashboardSupportText}>{favoriteHelperText}</Text> : null}
            {selectedPlace.locations.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.locationsSectionTitle]}>
                  {selectedPlace.locations.length === 1 ? 'Location' : 'Locations'}
                </Text>
                <View style={styles.filterRow}>
                  {selectedPlace.locations.map((location) => {
                    const isActive = location.id === selectedPlaceLocation?.id;

                    return (
                      <Pressable
                        key={location.id}
                        onPress={() => onSelectLocation(location.id)}
                        style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                      >
                        <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                          {location.city_label} - {location.address_line_1}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
            <Pressable onPress={() => void openMapsAddress(selectedPlaceLocation ?? selectedPlace)} style={styles.addressButton}>
              <Text selectable style={styles.detailLinkText}>{formatPlaceAddress(selectedPlaceLocation ?? selectedPlace)}</Text>
            </Pressable>

            {(selectedPlaceLocation?.phone_number ?? selectedPlace.phone_number) ? (
              <Text selectable style={styles.detailMeta}>Phone: {selectedPlaceLocation?.phone_number ?? selectedPlace.phone_number}</Text>
            ) : null}

            {selectedPlaceImageUrls.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Photos</Text>
                <ScrollView
                  contentContainerStyle={styles.photoGalleryRow}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoGalleryScroll}
                >
                  {selectedPlaceImageUrls.map((imageUrl) => (
                    <View key={imageUrl} style={styles.photoGalleryCard}>
                      <Image resizeMode="cover" source={{ uri: imageUrl }} style={styles.photoGalleryImage} />
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {selectedPlaceMapRegion ? (
              <Pressable
                onPress={() => void openMapsAddress(selectedPlaceLocation ?? selectedPlace)}
                style={styles.detailMapCard}
              >
                <MapView
                  region={selectedPlaceMapRegion}
                  pointerEvents="none"
                  rotateEnabled={false}
                  scrollEnabled={false}
                  style={styles.detailMap}
                  zoomEnabled={false}
                >
                  <Marker
                    coordinate={{
                      latitude: selectedPlaceMapRegion.latitude,
                      longitude: selectedPlaceMapRegion.longitude,
                    }}
                    tracksViewChanges={false}
                  />
                </MapView>
                <View style={styles.detailMapCaption}>
                  <Text style={styles.detailMapCaptionText}>Tap to open in Maps</Text>
                </View>
              </Pressable>
            ) : null}

            {(selectedPlaceLocation?.website_url ?? selectedPlace.website_url) ? (
              <Pressable onPress={() => void Linking.openURL(selectedPlaceLocation?.website_url ?? selectedPlace.website_url)} style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Open website</Text>
              </Pressable>
            ) : null}

            {selectedPlace.social_media_links?.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Social Media</Text>
                <View style={styles.hourList}>
                  {selectedPlace.social_media_links.map((link) => (
                    <Pressable key={link} onPress={() => void Linking.openURL(link)} style={styles.linkButtonSecondaryWide}>
                      <Text style={styles.linkButtonSecondaryText}>{link}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Pressable
              onPress={() => void Linking.openURL(buildGoogleReviewsUrl(selectedPlaceLocation ?? selectedPlace))}
              style={styles.linkButtonSecondary}
            >
              <Text style={styles.linkButtonSecondaryText}>View Google Reviews</Text>
            </Pressable>

            {showClaimBusinessControl && onClaimBusiness ? (
              <Pressable onPress={onClaimBusiness} style={styles.linkButtonSecondaryWide}>
                <Text style={styles.linkButtonSecondaryText}>Do you own or manage this business? Claim this Business!</Text>
              </Pressable>
            ) : null}

            {showEditBusinessProfileControl && onEditBusinessProfile ? (
              <Pressable onPress={onEditBusinessProfile} style={styles.linkButtonSecondaryWide}>
                <Text style={styles.linkButtonSecondaryText}>Edit Business Profile</Text>
              </Pressable>
            ) : null}

            {selectedPlaceOperatingHours.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Hours of Operations</Text>
                <View style={styles.hourList}>
                  {formatOperatingHourGroups(selectedPlaceOperatingHours).map((group) => (
                    <View key={group.id} style={styles.hourGroupCard}>
                      <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
                      <Text style={styles.hourRow}>{group.timeLabel}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {selectedPlace.hours_of_operation_entries?.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Additional Hours Information</Text>
                <View style={styles.hourList}>
                  {selectedPlace.hours_of_operation_entries.map((entry) => (
                    <View key={entry} style={styles.hourGroupCard}>
                      <Text style={styles.hourRow}>{entry}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Current Deals</Text>

            {selectedPlaceDeals.length ? (
              selectedPlaceDeals.map((deal) => (
                <View key={deal.id} style={styles.dealCard}>
                  <View style={styles.dealHeaderRow}>
                    <Text style={styles.dealTitle}>{deal.title}</Text>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{deal.deal_type_label}</Text>
                    </View>
                  </View>
                  {deal.price_text ? <Text style={styles.dealPrice}>{deal.price_text}</Text> : null}
                  {deal.description ? <Text style={styles.dealDescription}>{deal.description}</Text> : null}
                  {deal.terms ? <Text style={styles.dealTerms}>Terms: {deal.terms}</Text> : null}
                  <View style={styles.hourList}>
                    {formatHappyHourGroups(deal.happy_hours, selectedPlaceOperatingHours).map((group) => (
                      <View key={group.id} style={styles.hourGroupCard}>
                        <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
                        <Text style={styles.hourRow}>{group.timeLabel}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyStateText}>No active deals were returned for this place yet.</Text>
            )}

            {selectedPlace.offer_entries?.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>More Deals and Specials</Text>
                <View style={styles.hourList}>
                  {selectedPlace.offer_entries.map((entry) => (
                    <View key={entry} style={styles.hourGroupCard}>
                      <Text style={styles.hourRow}>{entry}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {selectedPlace.supporting_details ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Business Details</Text>
                <Text style={styles.detailMeta}>{selectedPlace.supporting_details}</Text>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

function formatHappyHourGroups(happyHours: HappyHourWindow[], operatingHours: OperatingHourWindow[] = []) {
  const groupedHours = new Map<string, HappyHourWindow[]>();

  happyHours.forEach((happyHour) => {
    const key = `${happyHour.start_time}-${happyHour.end_time}-${happyHour.all_day}`;
    const existingGroup = groupedHours.get(key);

    if (existingGroup) {
      existingGroup.push(happyHour);
      return;
    }

    groupedHours.set(key, [happyHour]);
  });

  return Array.from(groupedHours.entries()).map(([key, group]) => {
    const weekdays = group.map((happyHour) => happyHour.weekday);
    const endLabel = isCloseLabel(group[0].end_time, weekdays, operatingHours)
      ? 'Close'
      : formatTime(group[0].end_time);

    return {
      id: key,
      dayLabel: formatWeekdayRanges(weekdays),
      timeLabel: group[0].all_day
        ? 'All day'
        : `${formatTime(group[0].start_time)} - ${endLabel}`,
    };
  });
}

function formatOperatingHourGroups(operatingHours: OperatingHourWindow[]) {
  const groupedHours = new Map<string, OperatingHourWindow[]>();

  operatingHours.forEach((operatingHour) => {
    const key = `${operatingHour.open_time}-${operatingHour.close_time}`;
    const existingGroup = groupedHours.get(key);

    if (existingGroup) {
      existingGroup.push(operatingHour);
      return;
    }

    groupedHours.set(key, [operatingHour]);
  });

  return Array.from(groupedHours.entries()).map(([key, group]) => ({
    id: key,
    dayLabel: formatWeekdayRanges(group.map((operatingHour) => operatingHour.weekday)),
    timeLabel: `${formatTime(group[0].open_time)} - ${formatTime(group[0].close_time)}`,
  }));
}

function formatWeekdayRanges(weekdayValues: number[]) {
  const orderedDays = Array.from(new Set(weekdayValues));

  if (!orderedDays.length) {
    return '';
  }

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const segments: string[] = [];
  let rangeStart = orderedDays[0];
  let previousDay = orderedDays[0];

  for (let index = 1; index < orderedDays.length; index += 1) {
    const day = orderedDays[index];
    if (day === ((previousDay + 1) % dayLabels.length)) {
      previousDay = day;
      continue;
    }

    segments.push(formatWeekdaySegment(rangeStart, previousDay, dayLabels));
    rangeStart = day;
    previousDay = day;
  }

  segments.push(formatWeekdaySegment(rangeStart, previousDay, dayLabels));
  return segments.join(', ');
}

function formatWeekdaySegment(startDay: number, endDay: number, dayLabels: string[]) {
  const startLabel = dayLabels[startDay] ?? '';
  const endLabel = dayLabels[endDay] ?? '';

  if (startDay === endDay) {
    return startLabel;
  }

  return `${startLabel}-${endLabel}`;
}

function formatTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return value;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function isCloseLabel(endTime: string, weekdays: number[], operatingHours: OperatingHourWindow[]) {
  if (endTime === '23:59') {
    return true;
  }

  if (!operatingHours.length) {
    return false;
  }

  const closeTimesByWeekday = new Map<number, string>(
    operatingHours.map((operatingHour) => [operatingHour.weekday, operatingHour.close_time]),
  );

  return weekdays.every((weekday) => closeTimesByWeekday.get(weekday) === endTime);
}
