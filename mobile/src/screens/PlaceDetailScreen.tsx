import { useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { ActivityIndicator, Image, Keyboard, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { WebView } from 'react-native-webview';

import { styles } from '../appStyles';
import { NativeIOSLiquidGlassHeaderButton } from '../components/NativeIOSLiquidGlass';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { SocialButton } from '../components/SocialButton';
import { buildGoogleReviewsUrl, dedupeImageUrls, formatPlaceAddress, getPlacePreviewRegion, openMapsAddress } from '../placeHelpers';
import { getSocialProfilesForDisplay } from '../socialProfiles';
import type { Deal, HappyHourWindow, OperatingHourWindow, PlaceDetail, PlaceLocationDetail } from '../types';

type AttachmentPreviewState =
  | { kind: 'image'; name: string; uri: string }
  | { kind: 'pdf'; name: string; html: string };

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPdfPreviewHtml(base64Document: string, fileName: string) {
  const safeName = escapeHtml(fileName || 'Document preview');
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <title>${safeName}</title>
        <style>
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f3e7d8;
            color: #402214;
          }
          #status {
            padding: 16px;
            text-align: center;
            font-size: 14px;
            color: #7d614f;
          }
          #pages {
            padding: 12px;
          }
          .page {
            margin: 0 auto 14px;
            width: fit-content;
            box-shadow: 0 8px 24px rgba(45, 34, 26, 0.14);
            background: white;
          }
          canvas {
            display: block;
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <div id="status">Loading PDF preview...</div>
        <div id="pages"></div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <script>
          const status = document.getElementById('status');
          const pages = document.getElementById('pages');
          const base64 = '${base64Document}';

          function base64ToUint8Array(input) {
            const binary = atob(input);
            const length = binary.length;
            const bytes = new Uint8Array(length);
            for (let index = 0; index < length; index += 1) {
              bytes[index] = binary.charCodeAt(index);
            }
            return bytes;
          }

          async function renderPdf() {
            try {
              pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
              const pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(base64) }).promise;
              status.textContent = 'Rendering pages...';
              for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                const page = await pdf.getPage(pageNumber);
                const baseViewport = page.getViewport({ scale: 1 });
                const availableWidth = Math.max(window.innerWidth - 24, 1);
                const availableHeight = Math.max(window.innerHeight - 24, 1);
                const fitScale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height);
                const scale = Math.max(Math.min(fitScale, 1), 0.35);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                const wrapper = document.createElement('div');
                wrapper.className = 'page';
                const deviceScale = window.devicePixelRatio || 1;
                canvas.width = Math.floor(viewport.width * deviceScale);
                canvas.height = Math.floor(viewport.height * deviceScale);
                canvas.style.width = viewport.width + 'px';
                canvas.style.height = viewport.height + 'px';
                context.scale(deviceScale, deviceScale);
                wrapper.appendChild(canvas);
                pages.appendChild(wrapper);
                await page.render({ canvasContext: context, viewport }).promise;
              }
              status.remove();
            } catch (error) {
              status.textContent = 'Unable to preview this PDF in-app.';
            }
          }

          renderPdf();
        </script>
      </body>
    </html>
  `;
}

export type PlaceDetailScreenProps = {
  backButtonLabel?: string;
  canSubmitPlaceAccuracyReport?: boolean;
  distanceLabel?: string | null;
  onOpenDirectMessages?: () => void;
  onEditBusinessProfile?: () => void;
  onClaimBusiness?: () => void;
  onRequirePlaceAccuracyAccount?: () => void;
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
  canSubmitPlaceAccuracyReport = true,
  distanceLabel = null,
  onOpenDirectMessages,
  onEditBusinessProfile,
  onClaimBusiness,
  onRequirePlaceAccuracyAccount,
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
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(false);
  const attachmentPreviewRequestIdRef = useRef(0);
  const selectedPlaceMapRegion = getPlacePreviewRegion(selectedPlaceLocation ?? selectedPlace);
  const showVerifiedBadge = !!selectedPlace?.is_claimed;
  const selectedPlaceImageUrls = dedupeImageUrls([
    ...(selectedPlaceLocation?.image_urls ?? []),
    ...(selectedPlace?.image_urls ?? []),
  ]);
  const socialButtons = selectedPlace ? getSocialProfilesForDisplay(selectedPlace.social_profiles) : [];
  const hasWebsiteSocialButton = socialButtons.some((profile) => profile.platform === 'website');
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
    attachmentPreviewRequestIdRef.current += 1;
    setAttachmentPreviewLoading(false);
    setAttachmentPreview(null);
  }

  async function handleOpenDealAttachment(deal: Deal) {
    const uri = deal.attachment?.url ?? '';
    const attachmentName = deal.attachment?.name ?? 'Attachment';
    if (!uri) {
      return;
    }

    const previewKind = getAttachmentPreviewKind(deal.attachment?.content_type, attachmentName);
    if (previewKind === 'image') {
      setAttachmentPreviewLoading(false);
      setAttachmentPreview({ kind: 'image', name: attachmentName, uri });
      return;
    }

    if (previewKind === 'pdf') {
      const requestId = attachmentPreviewRequestIdRef.current + 1;
      attachmentPreviewRequestIdRef.current = requestId;
      setAttachmentPreviewLoading(true);
      setAttachmentPreview(null);
      try {
        const localUri = uri.startsWith('file://')
          ? uri
          : (await FileSystem.downloadAsync(uri, `${FileSystem.cacheDirectory ?? ''}deal-preview-${Date.now()}.pdf`)).uri;
        const base64Document = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
        if (attachmentPreviewRequestIdRef.current !== requestId) {
          return;
        }
        setAttachmentPreview({
          kind: 'pdf',
          name: attachmentName,
          html: buildPdfPreviewHtml(base64Document, attachmentName),
        });
      } finally {
        if (attachmentPreviewRequestIdRef.current === requestId) {
          setAttachmentPreviewLoading(false);
        }
      }
    }
  }

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
                  style={[styles.directMessageHeaderActionButton, { marginRight: 8 }]}
                >
                  <Ionicons color="#402214" name="paper-plane-outline" size={19} />
                </Pressable>
              )}
              onPress={() => onOpenDirectMessages?.()}
              style={{ marginRight: 8 }}
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
              <View style={styles.detailHeaderCopy}>
                <Text style={styles.detailCity}>{selectedPlaceLocation?.city_label ?? selectedPlace.city_label}</Text>
                <Text style={styles.detailTitle}>{selectedPlace.name}</Text>
                <Text style={styles.detailMeta}>{selectedPlace.venue_type_label}</Text>
                {distanceLabel ? <Text style={styles.detailMeta}>{distanceLabel}</Text> : null}
              </View>
              <View style={styles.detailHeaderActions}>
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
                  {selectedPlaceImageUrls.map((imageUrl, index) => (
                    <Pressable key={imageUrl} onPress={() => handleOpenPhotoLightbox(index)} style={styles.photoGalleryCard}>
                      <Image resizeMode="cover" source={{ uri: imageUrl }} style={styles.photoGalleryImage} />
                    </Pressable>
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

            {(selectedPlaceLocation?.website_url ?? selectedPlace.website_url) && !hasWebsiteSocialButton ? (
              <Pressable onPress={() => void Linking.openURL(selectedPlaceLocation?.website_url ?? selectedPlace.website_url)} style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Open website</Text>
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
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{deal.deal_type_label}</Text>
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

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
      <Modal animationType="fade" onRequestClose={handleCloseAttachmentPreview} transparent visible={attachmentPreview !== null || attachmentPreviewLoading}>
        <View style={styles.photoLightboxOverlay}>
          <View style={[styles.photoLightboxHeader, styles.attachmentLightboxHeader, { paddingTop: Math.max(insets.top + 8, 18) }]}>
            <Text numberOfLines={1} style={styles.attachmentLightboxTitle}>{attachmentPreview?.name ?? 'Preparing preview...'}</Text>
            <Pressable onPress={handleCloseAttachmentPreview} style={styles.photoLightboxCloseButton}>
              <Text style={styles.photoLightboxCloseButtonText}>X</Text>
            </Pressable>
          </View>
          <View style={styles.attachmentLightboxBody}>
            {attachmentPreviewLoading ? (
              <View style={styles.attachmentPreviewLoadingState}>
                <ActivityIndicator color="#fff7ef" size="large" />
                <Text style={styles.attachmentLightboxLoadingText}>Preparing document preview...</Text>
              </View>
            ) : attachmentPreview?.kind === 'image' ? (
              <View style={styles.attachmentLightboxImageStage}>
                <Image resizeMode="contain" source={{ uri: attachmentPreview.uri }} style={styles.photoLightboxImage} />
              </View>
            ) : attachmentPreview?.kind === 'pdf' ? (
              <WebView originWhitelist={["*"]} source={{ html: attachmentPreview.html }} style={styles.attachmentPreviewWebView} />
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
