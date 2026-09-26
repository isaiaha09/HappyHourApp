import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Image, Keyboard, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';

import { styles } from '../appStyles';
import { ContentReportModal } from '../components/ContentReportModal';
import { NativeIOSLiquidGlassHeaderButton } from '../components/NativeIOSLiquidGlass';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { SocialButton } from '../components/SocialButton';
import { ReadOnlyPdfPreviewModal } from '../components/ReadOnlyPdfPreviewModal';
import { buildGoogleReviewsUrl, dedupeImageUrls, formatLastKnownLocationLabel, formatPlaceAddress, getPlacePreviewRegion, openMapsAddress } from '../placeHelpers';
import { getSocialProfilesForDisplay } from '../socialProfiles';
import { theme } from '../styles/theme';
import type { ContentReportReason, ContentReportRequest, ContentReportScreenshotDraft, Deal, HappyHourWindow, OperatingHourWindow, PlaceDetail, PlaceLocationDetail } from '../types';

type AttachmentPreviewState =
  | { kind: 'image'; name: string; uri: string };

function getAttachmentPreviewKind(mimeType: string | null | undefined, fileName: string) {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  const normalizedFileName = String(fileName || '').trim().toLowerCase();

  if (normalizedMimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(normalizedFileName)) {
    return 'image' as const;
  }
  if (normalizedMimeType === 'application/pdf' || normalizedFileName.endsWith('.pdf')) {
    return 'pdf' as const;
  }
  return null;
}

const dismissKeyboardOnScrollProps = {
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
  onScrollBeginDrag: Keyboard.dismiss,
  onTouchStart: Keyboard.dismiss,
} as const;

export type PlaceDetailScreenProps = {
  backButtonLabel?: string;
  canSubmitPlaceAccuracyReport?: boolean;
  canSubmitContentReport?: boolean;
  distanceLabel?: string | null;
  onOpenDirectMessages?: () => void;
  onAddToCalendar?: (deal?: Deal) => void;
  onSharePlace?: (deal?: Deal) => void;
  onEditBusinessProfile?: () => void;
  onClaimBusiness?: () => void;
  onRequirePlaceAccuracyAccount?: () => void;
  onRequireContentReportAccount?: () => void;
  onSubmitContentReport?: (payload: ContentReportRequest) => Promise<string>;
  onSubmitPlaceAccuracyReport?: (subject: string, message: string) => Promise<string>;
  showClaimBusinessControl?: boolean;
  showDirectMessageControl?: boolean;
  showEditBusinessProfileControl?: boolean;
  detailLoading: boolean;
  errorMessage: string | null;
  favoriteHelperText: string | null;
  favoriteSubmitting: boolean;
  isLandscape: boolean;
  isFavorited: boolean;
  liveLocationOverride?: {
    latitude: number;
    longitude: number;
  } | null;
  onBack: () => void;
  onSelectLocation: (locationId: number) => void;
  onToggleFavorite: () => void;
  showFavoriteControl: boolean;
  selectedPlace: PlaceDetail | null;
  selectedPlaceDeals: Deal[];
  selectedPlaceLocation: PlaceDetail | PlaceLocationDetail | null;
  selectedPlaceOperatingHours: OperatingHourWindow[];
  locationStatusNow: number;
};

export function PlaceDetailScreen({
  backButtonLabel = 'Back to Places',
  canSubmitContentReport = false,
  canSubmitPlaceAccuracyReport = true,
  distanceLabel = null,
  onOpenDirectMessages,
  onAddToCalendar,
  onSharePlace,
  onEditBusinessProfile,
  onClaimBusiness,
  onRequirePlaceAccuracyAccount,
  onRequireContentReportAccount,
  onSubmitContentReport,
  onSubmitPlaceAccuracyReport,
  showClaimBusinessControl = false,
  showDirectMessageControl = false,
  showEditBusinessProfileControl = false,
  detailLoading,
  errorMessage,
  favoriteHelperText,
  favoriteSubmitting,
  isLandscape,
  isFavorited,
  liveLocationOverride = null,
  onBack,
  onSelectLocation,
  onToggleFavorite,
  showFavoriteControl,
  selectedPlace,
  selectedPlaceDeals,
  selectedPlaceLocation,
  selectedPlaceOperatingHours,
  locationStatusNow,
}: PlaceDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const [photoLightboxVisible, setPhotoLightboxVisible] = useState(false);
  const [photoLightboxIndex, setPhotoLightboxIndex] = useState(0);
  const [accuracyModalVisible, setAccuracyModalVisible] = useState(false);
  const [accuracySuccessModalVisible, setAccuracySuccessModalVisible] = useState(false);
  const [selectedAccuracySubject, setSelectedAccuracySubject] = useState<string>('hours');
  const [customAccuracySubject, setCustomAccuracySubject] = useState('');
  const [accuracyMessage, setAccuracyMessage] = useState('');
  const [accuracySubmitting, setAccuracySubmitting] = useState(false);
  const [accuracyErrorMessage, setAccuracyErrorMessage] = useState<string | null>(null);
  const [accuracySuccessMessage, setAccuracySuccessMessage] = useState<string | null>(null);
  const [contentReportVisible, setContentReportVisible] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ name: string; uri: string } | null>(null);
  const selectedPlaceAddressSource = selectedPlaceLocation ?? selectedPlace;
  const selectedPlaceMapSource = selectedPlaceAddressSource && liveLocationOverride
    ? {
      ...selectedPlaceAddressSource,
      latitude: liveLocationOverride.latitude,
      longitude: liveLocationOverride.longitude,
    }
    : selectedPlaceAddressSource;
  const selectedPlaceMapRegion = getPlacePreviewRegion(selectedPlaceMapSource);
  const selectedPlaceCityLabel = (selectedPlaceLocation?.city_label ?? selectedPlace?.city_label ?? '').trim();
  const showStarredBadge = !!(selectedPlace?.is_starred || selectedPlaceLocation?.is_starred);
  const showVerifiedBadge = !!selectedPlace?.is_claimed;
  const showGoogleReviews = selectedPlace?.is_informal !== true;
  const selectedPlaceLastKnownLocationLabel = selectedPlaceAddressSource && !liveLocationOverride
    ? formatLastKnownLocationLabel(
      selectedPlaceAddressSource.live_location_updated_at,
      formatPlaceAddress(selectedPlaceAddressSource),
      locationStatusNow,
    )
    : null;
  const selectedPlaceImageUrls = dedupeImageUrls([
    ...(selectedPlaceLocation?.image_urls ?? []),
    ...(selectedPlace?.image_urls ?? []),
  ]);
  const socialButtons = selectedPlace
    ? getSocialProfilesForDisplay(selectedPlace.social_profiles, selectedPlaceLocation?.website_url ?? selectedPlace.website_url)
    : [];
  const accuracySubjectOptions = useMemo(() => ([
    { label: 'Address or pin', value: 'address-or-pin' },
    { label: 'Hours of operation', value: 'hours' },
    { label: 'Phone number', value: 'phone' },
    { label: 'Website or social links', value: 'website-social' },
    { label: 'Deals or specials', value: 'deals' },
    { label: 'Photos', value: 'photos' },
    { label: 'Business details', value: 'business-details' },
    { label: 'Other', value: 'other' },
  ]), []);
  const resolvedAccuracySubject = selectedAccuracySubject === 'other'
    ? customAccuracySubject.trim()
    : accuracySubjectOptions.find((option) => option.value === selectedAccuracySubject)?.label ?? '';

  function handleOpenContentReport() {
    if (!canSubmitContentReport) {
      onRequireContentReportAccount?.();
      return;
    }

    setContentReportVisible(true);
  }

  async function handleSubmitContentReport(reason: ContentReportReason, details: string, screenshot: ContentReportScreenshotDraft | null) {
    if (!selectedPlace || !onSubmitContentReport) {
      throw new Error('This report form is not available right now.');
    }

    return onSubmitContentReport({
      business_name: selectedPlace.name,
      details,
      listing_slug: selectedPlace.slug,
      reason,
      screenshot,
      target_type: 'business_profile',
    });
  }

  function handleOpenAccuracyModal() {
    setAccuracyModalVisible(true);
    setAccuracyErrorMessage(null);
    setAccuracySuccessMessage(null);
    setAccuracySuccessModalVisible(false);
  }

  function handleCloseAccuracyModal() {
    if (accuracySubmitting) {
      return;
    }

    setAccuracyModalVisible(false);
    setAccuracyErrorMessage(null);
  }

  function handleAccuracyModalBackdropPress() {
    if (accuracySubmitting) {
      return;
    }

    Keyboard.dismiss();
  }

  function handleCloseAccuracySuccessModal() {
    setAccuracySuccessModalVisible(false);
  }

  async function handleSubmitAccuracyReport() {
    if (!canSubmitPlaceAccuracyReport) {
      Keyboard.dismiss();
      setAccuracyErrorMessage(null);
      setAccuracyModalVisible(false);
      onRequirePlaceAccuracyAccount?.();
      return;
    }

    if (!onSubmitPlaceAccuracyReport) {
      setAccuracyErrorMessage('This report form is not available right now. Close and reopen the business profile and try again.');
      return;
    }

    const nextSubject = resolvedAccuracySubject;
    const nextMessage = accuracyMessage.trim();

    if (!nextSubject.length) {
      setAccuracyErrorMessage('Choose what needs to be updated. If you select Other, enter a subject.');
      return;
    }

    if (!nextMessage.length) {
      setAccuracyErrorMessage('Explain what is wrong with the business profile before sending your report.');
      return;
    }

    Keyboard.dismiss();
    setAccuracySubmitting(true);
    setAccuracyErrorMessage(null);
    setAccuracySuccessMessage(null);

    try {
      const detail = await onSubmitPlaceAccuracyReport(nextSubject, nextMessage);
      setAccuracySuccessMessage(detail);
      setAccuracyModalVisible(false);
      setAccuracySuccessModalVisible(true);
      setAccuracyMessage('');
      setCustomAccuracySubject('');
      setSelectedAccuracySubject('hours');
    } catch (error) {
      setAccuracyErrorMessage(error instanceof Error ? error.message : 'Unable to send your report right now.');
    } finally {
      setAccuracySubmitting(false);
    }
  }

  function handleOpenPhotoLightbox(index: number) {
    setPhotoLightboxIndex(index);
    setPhotoLightboxVisible(true);
  }

  function handleCloseAttachmentPreview() {
    setAttachmentPreview(null);
  }

  function handleOpenDealAttachment(deal: Deal) {
    const uri = deal.attachment?.url ?? '';
    const attachmentName = deal.attachment?.name ?? 'Attachment';
    if (!uri) {
      return;
    }

    const previewKind = getAttachmentPreviewKind(deal.attachment?.content_type, attachmentName);
    if (previewKind === 'image') {
      setAttachmentPreview({ kind: 'image', name: attachmentName, uri });
      return;
    }

    if (previewKind === 'pdf') {
      setAttachmentPreview(null);
      setPdfPreview({ name: attachmentName, uri });
    }
  }

  return (
    <View style={[styles.detailScreenRoot, isLandscape ? styles.detailScreenLandscape : null]}>
      <ContentReportModal
        onClose={() => setContentReportVisible(false)}
        onSubmit={handleSubmitContentReport}
        targetLabel="business profile"
        visible={contentReportVisible}
      />
      <ScrollView
        contentContainerStyle={[
          styles.detailScrollContent,
          isLandscape ? styles.detailScrollContentLandscape : null,
          { paddingBottom: Math.max(insets.bottom + 118, 132) },
        ]}
        {...dismissKeyboardOnScrollProps}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.screenHeaderBar, styles.screenHeaderBarRow]}>
          <NativeIOSLiquidGlassHeaderButton
            fallback={(
              <Pressable onPress={onBack} style={styles.backButton}>
                <Text style={styles.backButtonText}>{backButtonLabel}</Text>
              </Pressable>
            )}
            label={backButtonLabel}
            onPress={onBack}
            variant="pill"
          />
          {showDirectMessageControl ? (
            <NativeIOSLiquidGlassHeaderButton
              accessibilityLabel="Open direct messages"
              fallback={(
                <Pressable
                  accessibilityLabel="Open direct messages"
                  onPress={onOpenDirectMessages}
                  style={[styles.directMessageHeaderActionButton, { marginRight: 16 }]}
                >
                  <Ionicons color={theme.accentStrong} name="paper-plane" size={19} />
                </Pressable>
              )}
              onPress={() => onOpenDirectMessages?.()}
              style={{ marginRight: 16 }}
              systemImage="paperplane"
              variant="icon"
            />
          ) : null}
        </View>

        {detailLoading && !selectedPlace ? (
          <View style={styles.centerState}>
            <Text style={styles.centerStateText}>Loading place details...</Text>
          </View>
        ) : null}

        {selectedPlace ? (
          <View style={[styles.detailCard, isLandscape ? styles.detailCardLandscape : null]}>
            <View style={styles.detailHeaderRow}>
              <View style={styles.detailHeaderActions}>
                {onAddToCalendar ? (
                  <Pressable accessibilityLabel={`Add ${selectedPlace.name} to Calendar`} onPress={() => onAddToCalendar()} style={styles.contentReportButton}>
                    <Ionicons color={theme.accentStrong} name="calendar-outline" size={22} />
                  </Pressable>
                ) : null}
                {onSharePlace ? (
                  <Pressable accessibilityLabel={`Share ${selectedPlace.name}`} onPress={() => onSharePlace()} style={styles.contentReportButton}>
                    <Ionicons color={theme.accentStrong} name="share-social-outline" size={22} />
                  </Pressable>
                ) : null}
                {showStarredBadge ? (
                  <View accessibilityLabel="Starred business" style={styles.starredBusinessBadge}>
                    <Text style={styles.starredBusinessBadgeIcon}>★</Text>
                  </View>
                ) : null}
                {showVerifiedBadge ? (
                  <View accessibilityLabel="Claimed business" style={styles.verifiedStatusBadge}>
                    <Text style={styles.verifiedStatusBadgeIcon}>✓</Text>
                  </View>
                ) : null}
                {showFavoriteControl ? (
                  <Pressable
                    accessibilityLabel={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    onPress={onToggleFavorite}
                    style={[
                      styles.favoriteHeartButton,
                      isFavorited ? styles.favoriteHeartButtonActive : null,
                      favoriteSubmitting ? styles.linkButtonDisabled : null,
                    ]}
                  >
                    <Ionicons
                      name={isFavorited ? 'heart' : 'heart-outline'}
                      size={24}
                      style={[styles.favoriteHeartIcon, isFavorited ? styles.favoriteHeartIconActive : null]}
                    />
                  </Pressable>
                ) : null}
                <Pressable accessibilityLabel="Report business content" onPress={handleOpenContentReport} style={styles.contentReportButton}>
                  <Ionicons color={theme.textMuted} name="flag-outline" size={22} />
                </Pressable>
              </View>
              <View style={styles.detailHeaderCopy}>
                {selectedPlaceCityLabel ? <Text style={styles.detailCity}>{selectedPlaceCityLabel}</Text> : null}
                <Text style={styles.detailTitle}>{selectedPlace.name}</Text>
                <Text style={styles.detailMeta}>{selectedPlace.venue_type_label}</Text>
              </View>
            </View>
            {showFavoriteControl && favoriteHelperText ? <Text style={styles.dashboardSupportText}>{favoriteHelperText}</Text> : null}
            {selectedPlaceImageUrls.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Photos</Text>
                <ScrollView
                  contentContainerStyle={styles.photoGalleryRow}
                  horizontal
                  {...dismissKeyboardOnScrollProps}
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoGalleryScroll}
                >
                  {selectedPlaceImageUrls.map((imageUrl, index) => (
                    <Pressable key={imageUrl} onPress={() => handleOpenPhotoLightbox(index)} style={styles.photoGalleryCard}>
                      <Image resizeMode="cover" source={{ uri: imageUrl }} style={styles.photoGalleryImage} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Current Deals</Text>

            {selectedPlaceDeals.length ? (
              selectedPlaceDeals.map((deal) => (
                <View key={deal.id} style={styles.dealCard}>
                  {deal.attachment?.url && getAttachmentPreviewKind(deal.attachment.content_type, deal.attachment.name) === 'image' ? (
                    <Pressable onPress={() => void handleOpenDealAttachment(deal)} style={styles.dealAttachmentImageButton}>
                      <Image resizeMode="cover" source={{ uri: deal.attachment.url }} style={styles.dealAttachmentImage} />
                    </Pressable>
                  ) : null}
                  <View style={styles.dealHeaderRow}>
                    <Text style={styles.dealTitle}>{deal.title}</Text>
                    <View style={styles.dealHeaderActions}>
                      {onAddToCalendar ? (
                        <Pressable
                          accessibilityLabel={`Add ${deal.title} to Calendar`}
                          onPress={() => onAddToCalendar(deal)}
                          style={styles.dealActionButton}
                        >
                          <Ionicons color={theme.accentStrong} name="calendar-outline" size={17} />
                        </Pressable>
                      ) : null}
                      {onSharePlace ? (
                        <Pressable
                          accessibilityLabel={`Share ${deal.title}`}
                          onPress={() => onSharePlace(deal)}
                          style={styles.dealActionButton}
                        >
                          <Ionicons color={theme.accentStrong} name="share-social-outline" size={17} />
                        </Pressable>
                      ) : null}
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{deal.deal_type_label}</Text>
                      </View>
                    </View>
                  </View>
                  {deal.attachment?.url && getAttachmentPreviewKind(deal.attachment.content_type, deal.attachment.name) === 'pdf' ? (
                    <Pressable onPress={() => void handleOpenDealAttachment(deal)} style={[styles.attachmentCard, styles.dealAttachmentPdfCard]}>
                      <View style={styles.attachmentMeta}>
                        <Text style={styles.attachmentName}>{deal.attachment.name}</Text>
                        <Text style={styles.attachmentDetail}>PDF attachment • Tap to view</Text>
                      </View>
                    </Pressable>
                  ) : null}
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

            {selectedPlace.offer_entries?.length && !selectedPlace.deal_overrides ? (
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

            {selectedPlace.hours_of_operation_entries?.length && !selectedPlace.operating_hour_overrides ? (
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
            <Pressable onPress={() => void openMapsAddress(selectedPlaceMapSource ?? selectedPlace)} style={styles.addressButton}>
              <Text selectable style={styles.detailLinkText}>{formatPlaceAddress(selectedPlaceAddressSource ?? selectedPlace)}</Text>
            </Pressable>
            {selectedPlaceLastKnownLocationLabel ? (
              <Text style={styles.mapLastKnownLocationText}>{selectedPlaceLastKnownLocationLabel}</Text>
            ) : null}

            {(selectedPlaceLocation?.phone_number ?? selectedPlace.phone_number) ? (
              <Text selectable style={styles.detailMeta}>Phone: {selectedPlaceLocation?.phone_number ?? selectedPlace.phone_number}</Text>
            ) : null}

            {distanceLabel ? <Text style={styles.detailMeta}>{distanceLabel}</Text> : null}

            {selectedPlaceMapRegion ? (
              <Pressable
                onPress={() => void openMapsAddress(selectedPlaceMapSource ?? selectedPlace)}
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

            {socialButtons.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Social Media</Text>
                <View style={styles.socialButtonsList}>
                  {socialButtons.map((profile) => (
                    <SocialButton
                      key={`${profile.platform}:${profile.url}`}
                      onPress={() => void Linking.openURL(profile.url)}
                      platform={profile.platform}
                      username={profile.username}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {showGoogleReviews ? (
              <Pressable
                onPress={() => void Linking.openURL(buildGoogleReviewsUrl(selectedPlaceLocation ?? selectedPlace))}
                style={styles.linkButtonSecondary}
              >
                <Text style={styles.linkButtonSecondaryText}>View Google Reviews</Text>
              </Pressable>
            ) : null}

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

            {selectedPlace.supporting_details ? (
              <>
                <Text style={[styles.sectionTitle, styles.detailSectionTitle]}>Business Details</Text>
                <Text style={styles.detailMeta}>{selectedPlace.supporting_details}</Text>
              </>
            ) : null}

            <View style={styles.dashboardCalloutCard}>
              <Text style={styles.dashboardSupportText}>
                Spot a missing detail or outdated information? Send a quick correction request for this business profile.
              </Text>
              <Pressable onPress={handleOpenAccuracyModal} style={styles.linkButtonSecondaryWide}>
                <Text style={styles.linkButtonSecondaryText}>Report a business profile update</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <Modal animationType="fade" onRequestClose={handleCloseAccuracyModal} transparent visible={accuracyModalVisible}>
        <Pressable onPress={handleAccuracyModalBackdropPress} style={styles.guestFavoriteModalBackdrop}>
          <View style={[styles.guestFavoriteModalCard, { maxHeight: '84%' }]}> 
            <Pressable onPress={handleCloseAccuracyModal} style={styles.guestBottomNavCloseButton}>
              <Text style={styles.guestBottomNavCloseButtonText}>×</Text>
            </Pressable>
            <Text style={styles.guestFavoriteModalTitle}>Report profile accuracy</Text>
            <Text style={styles.guestFavoriteModalText}>
              Choose the detail that needs to be fixed, then explain exactly what should be added or changed.
            </Text>

            <ScrollView {...dismissKeyboardOnScrollProps} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.profileFormSection}>
                <Text style={styles.profileFieldLabel}>What needs to be updated?</Text>
                <View style={styles.filterRow}>
                  {accuracySubjectOptions.map((option) => {
                    const isActive = option.value === selectedAccuracySubject;

                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => {
                          setSelectedAccuracySubject(option.value);
                          setAccuracyErrorMessage(null);
                        }}
                        style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                      >
                        <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {selectedAccuracySubject === 'other' ? (
                  <>
                    <Text style={styles.profileFieldLabel}>Subject</Text>
                    <TextInput
                      onChangeText={(value) => {
                        setCustomAccuracySubject(value);
                        setAccuracyErrorMessage(null);
                      }}
                      placeholder="What needs to be added or changed?"
                      placeholderTextColor="#9a7f6c"
                      style={styles.profileInput}
                      value={customAccuracySubject}
                    />
                  </>
                ) : null}

                <Text style={styles.profileFieldLabel}>What is wrong with the business profile?</Text>
                <TextInput
                  multiline
                  numberOfLines={7}
                  onChangeText={(value) => {
                    setAccuracyMessage(value);
                    setAccuracyErrorMessage(null);
                  }}
                  placeholder="Explain what is incorrect, missing, or outdated."
                  placeholderTextColor="#9a7f6c"
                  style={[styles.profileInput, styles.supportMessageInput]}
                  textAlignVertical="top"
                  value={accuracyMessage}
                />

                <Text style={styles.profileSupportText}>
                  Include any corrected hours, links, phone numbers, addresses, or missing details you want the team to review.
                </Text>
                {accuracyErrorMessage ? <Text style={styles.errorText}>{accuracyErrorMessage}</Text> : null}
              </View>
            </ScrollView>

            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleCloseAccuracyModal} style={styles.guestFavoriteModalSecondaryButton}>
                <Text style={styles.guestFavoriteModalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void handleSubmitAccuracyReport()} style={[styles.guestFavoriteModalPrimaryButton, accuracySubmitting ? styles.linkButtonDisabled : null]}>
                {accuracySubmitting ? <ActivityIndicator color="#fffaf4" /> : <Text style={styles.guestFavoriteModalPrimaryText}>Send update request</Text>}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
      <Modal animationType="fade" onRequestClose={handleCloseAccuracySuccessModal} transparent visible={accuracySuccessModalVisible}>
        <View style={styles.guestFavoriteModalBackdrop}>
          <View style={styles.guestFavoriteModalCard}>
            <Pressable onPress={handleCloseAccuracySuccessModal} style={styles.guestBottomNavCloseButton}>
              <Text style={styles.guestBottomNavCloseButtonText}>×</Text>
            </Pressable>
            <Text style={styles.guestFavoriteModalTitle}>Update request sent</Text>
            <Text style={styles.guestFavoriteModalText}>
              {accuracySuccessMessage ?? 'Your message has been sent to Dining Deals support.'}
            </Text>
          </View>
        </View>
      </Modal>
      <PhotoLightbox
        imageUrls={selectedPlaceImageUrls}
        initialIndex={photoLightboxIndex}
        onClose={() => setPhotoLightboxVisible(false)}
        visible={photoLightboxVisible}
      />
      <ReadOnlyPdfPreviewModal
        fileName={pdfPreview?.name ?? 'PDF preview'}
        onClose={() => setPdfPreview(null)}
        uri={pdfPreview?.uri ?? null}
        visible={pdfPreview !== null}
      />
      <Modal animationType="fade" onRequestClose={handleCloseAttachmentPreview} transparent visible={attachmentPreview !== null}>
        <View style={styles.photoLightboxOverlay}>
          <View style={[styles.photoLightboxHeader, styles.attachmentLightboxHeader, { paddingTop: Math.max(insets.top + 8, 18) }]}>
            <Text numberOfLines={1} style={styles.attachmentLightboxTitle}>{attachmentPreview?.name ?? 'Preparing preview...'}</Text>
            <Pressable onPress={handleCloseAttachmentPreview} style={styles.photoLightboxCloseButton}>
              <Text style={styles.photoLightboxCloseButtonText}>X</Text>
            </Pressable>
          </View>
          <View style={styles.attachmentLightboxBody}>
            {attachmentPreview?.kind === 'image' ? (
              <View style={styles.attachmentLightboxImageStage}>
                <Image resizeMode="contain" source={{ uri: attachmentPreview.uri }} style={styles.photoLightboxImage} />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
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
    const key = operatingHour.open_24_hours ? '24hr' : `${operatingHour.open_time}-${operatingHour.close_time}`;
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
    timeLabel: group[0].open_24_hours ? 'Open 24 hours' : `${formatTime(group[0].open_time)} - ${formatTime(group[0].close_time)}`,
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
