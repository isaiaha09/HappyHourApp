import { useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { styles } from '../appStyles';
import {
  businessWeekdayOptions,
  createEmptyDealOverride,
  createEmptyHappyHourOverride,
  createEmptyOperatingHourOverride,
  formatHappyHourGroups,
  formatOperatingHourGroups,
} from '../businessProfileOverrides';
import type {
  BusinessAttachmentDraft,
  BusinessDealAttachment,
  BusinessDealHappyHourOverride,
  BusinessDealOverride,
  BusinessOperatingHourOverride,
} from '../types';

const dealTypeOptions = [
  { label: 'Happy Hour', value: 'happy_hour' },
  { label: 'Daily Special', value: 'daily_special' },
  { label: 'Discount', value: 'discount' },
  { label: 'Limited Time', value: 'limited_time' },
  { label: 'Other', value: 'other' },
] as const;

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

function WeekdaySelector({ selectedWeekdays, onToggle }: { onToggle: (weekday: number) => void; selectedWeekdays: number[] }) {
  return (
    <View style={styles.structuredWeekdayRow}>
      {businessWeekdayOptions.map((option) => (
        <Pressable
          key={option.weekday}
          onPress={() => onToggle(option.weekday)}
          style={[styles.structuredWeekdayChip, selectedWeekdays.includes(option.weekday) ? styles.structuredWeekdayChipActive : null]}
        >
          <Text style={[styles.structuredWeekdayChipText, selectedWeekdays.includes(option.weekday) ? styles.structuredWeekdayChipTextActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DealTypeSelector({ selectedDealType, onSelect }: { onSelect: (value: string) => void; selectedDealType: string }) {
  return (
    <View style={styles.structuredDealTypeRow}>
      {dealTypeOptions.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onSelect(option.value)}
          style={[styles.structuredWeekdayChip, selectedDealType === option.value ? styles.structuredWeekdayChipActive : null]}
        >
          <Text style={[styles.structuredWeekdayChipText, selectedDealType === option.value ? styles.structuredWeekdayChipTextActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type BusinessHoursEditorProps = {
  label: string;
  onChange: (value: BusinessOperatingHourOverride[]) => void;
  supportText: string;
  value: BusinessOperatingHourOverride[];
};

export function BusinessHoursEditor({ label, onChange, supportText, value }: BusinessHoursEditorProps) {
  function updateRow(index: number, nextRow: BusinessOperatingHourOverride) {
    onChange(value.map((row, rowIndex) => rowIndex === index ? nextRow : row));
  }

  function toggleOpen24Hours(index: number) {
    const existingRow = value[index];
    const nextOpen24Hours = !existingRow.open_24_hours;
    updateRow(index, {
      ...existingRow,
      open_24_hours: nextOpen24Hours,
      open_time: nextOpen24Hours ? '12:00 AM' : existingRow.open_time,
      close_time: nextOpen24Hours ? '11:59 PM' : existingRow.close_time,
    });
  }

  function toggleRowWeekday(index: number, weekday: number) {
    const existingRow = value[index];
    const existingWeekdays = Array.isArray(existingRow.weekdays) && existingRow.weekdays.length
      ? existingRow.weekdays
      : [existingRow.weekday];
    const nextWeekdays = existingWeekdays.includes(weekday)
      ? existingWeekdays.filter((entry) => entry !== weekday)
      : [...existingWeekdays, weekday].sort((left, right) => left - right);
    updateRow(index, {
      ...existingRow,
      weekday: nextWeekdays[0] ?? existingRow.weekday,
      weekdays: nextWeekdays.length ? nextWeekdays : [weekday],
    });
  }

  return (
    <View style={styles.structuredEditorSection}>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      <Text style={styles.profileSupportText}>{supportText}</Text>
      {value.map((row, index) => (
        <View key={row.id ?? `${row.weekday}-${index}`} style={styles.structuredEditorCard}>
          <WeekdaySelector
            selectedWeekdays={Array.isArray(row.weekdays) && row.weekdays.length ? row.weekdays : [row.weekday]}
            onToggle={(weekday) => toggleRowWeekday(index, weekday)}
          />
          <Pressable onPress={() => toggleOpen24Hours(index)} style={[styles.structuredWeekdayChip, row.open_24_hours ? styles.structuredWeekdayChipActive : null]}>
            <Text style={[styles.structuredWeekdayChipText, row.open_24_hours ? styles.structuredWeekdayChipTextActive : null]}>Open 24 hrs</Text>
          </Pressable>
          {row.open_24_hours ? null : (
            <View style={styles.structuredTimeRow}>
              <TextInput
                onChangeText={(open_time) => updateRow(index, { ...row, open_time })}
                placeholder="11:00 AM"
                placeholderTextColor="#9a7f6c"
                style={[styles.profileInput, styles.structuredTimeInput]}
                value={row.open_time}
              />
              <TextInput
                onChangeText={(close_time) => updateRow(index, { ...row, close_time })}
                placeholder="10:00 PM"
                placeholderTextColor="#9a7f6c"
                style={[styles.profileInput, styles.structuredTimeInput]}
                value={row.close_time}
              />
            </View>
          )}
          <Pressable onPress={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))} style={styles.structuredRemoveButton}>
            <Text style={styles.structuredRemoveButtonText}>Remove hours row</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChange([...value, createEmptyOperatingHourOverride()])} style={styles.linkButtonSecondary}>
        <Text style={styles.linkButtonSecondaryText}>Add hours row</Text>
      </Pressable>
      {value.length ? (
        <View style={styles.hourList}>
          {formatOperatingHourGroups(value).map((group) => (
            <View key={group.id} style={styles.hourGroupCard}>
              <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
              <Text style={styles.hourRow}>{group.timeLabel}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type BusinessDealsEditorProps = {
  label: string;
  onChange: (value: BusinessDealOverride[]) => void;
  supportText: string;
  value: BusinessDealOverride[];
};

export function BusinessDealsEditor({ label, onChange, supportText, value }: BusinessDealsEditorProps) {
  const insets = useSafeAreaInsets();
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(false);
  const [pendingDealRemovalIndex, setPendingDealRemovalIndex] = useState<number | null>(null);
  const attachmentPreviewRequestIdRef = useRef(0);

  function handleCloseAttachmentPreview() {
    attachmentPreviewRequestIdRef.current += 1;
    setAttachmentPreviewLoading(false);
    setAttachmentPreview(null);
  }

  function updateDeal(index: number, nextDeal: BusinessDealOverride) {
    onChange(value.map((deal, dealIndex) => dealIndex === index ? nextDeal : deal));
  }

  function handleRequestRemoveDeal(index: number) {
    setPendingDealRemovalIndex(index);
  }

  function handleCancelRemoveDeal() {
    setPendingDealRemovalIndex(null);
  }

  function handleConfirmRemoveDeal() {
    if (pendingDealRemovalIndex === null) {
      return;
    }

    onChange(value.filter((_, index) => index !== pendingDealRemovalIndex));
    setPendingDealRemovalIndex(null);
  }

  function normalizeImageAttachment(asset: ImagePicker.ImagePickerAsset): BusinessAttachmentDraft {
    return {
      id: `${asset.assetId ?? asset.uri}::${asset.fileName ?? 'deal-photo'}::${asset.fileSize ?? 0}`,
      name: asset.fileName ?? `deal-photo-${Date.now()}.jpg`,
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? null,
    };
  }

  function normalizeDocumentAttachment(asset: DocumentPicker.DocumentPickerAsset): BusinessAttachmentDraft {
    return {
      id: `${asset.uri}::${asset.name}::${asset.size ?? 0}`,
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'application/pdf',
      size: asset.size ?? null,
    };
  }

  function getDisplayedAttachment(deal: BusinessDealOverride): BusinessDealAttachment | BusinessAttachmentDraft | null {
    if (deal.attachment_upload?.uri) {
      return deal.attachment_upload;
    }
    return deal.attachment?.url ? deal.attachment : null;
  }

  function getAttachmentDetailLabel(attachment: BusinessDealAttachment | BusinessAttachmentDraft) {
    const mimeType = String(
      ('content_type' in attachment
        ? attachment.content_type
        : ('mimeType' in attachment ? attachment.mimeType : '')) ?? '',
    ).toLowerCase();
    if (mimeType === 'application/pdf') {
      return 'PDF attachment';
    }
    if (mimeType.startsWith('image/')) {
      return 'Photo attachment';
    }
    return 'Deal attachment';
  }

  function getAttachmentMimeType(attachment: BusinessDealAttachment | BusinessAttachmentDraft | null) {
    if (!attachment) {
      return null;
    }
    return String(
      ('content_type' in attachment
        ? attachment.content_type
        : ('mimeType' in attachment ? attachment.mimeType : '')) ?? '',
    ).trim().toLowerCase() || null;
  }

  function updatePdfAttachmentName(dealIndex: number, nextName: string) {
    const currentDeal = value[dealIndex];
    if (currentDeal.attachment_upload?.uri) {
      updateDeal(dealIndex, {
        ...currentDeal,
        attachment_upload: {
          ...currentDeal.attachment_upload,
          name: nextName,
        },
      });
      return;
    }

    if (currentDeal.attachment?.url) {
      updateDeal(dealIndex, {
        ...currentDeal,
        attachment: {
          ...currentDeal.attachment,
          name: nextName,
        },
      });
    }
  }

  async function handleSelectDealPhoto(dealIndex: number) {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        allowsMultipleSelection: false,
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      updateDeal(dealIndex, {
        ...value[dealIndex],
        attachment: null,
        attachment_upload: normalizeImageAttachment(result.assets[0]),
      });
    } catch {
      // Picker failures stay local to the editor.
    }
  }

  async function handleSelectDealPdf(dealIndex: number) {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'application/pdf',
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      updateDeal(dealIndex, {
        ...value[dealIndex],
        attachment: null,
        attachment_upload: normalizeDocumentAttachment(result.assets[0]),
      });
    } catch {
      // Picker failures stay local to the editor.
    }
  }

  function handleRemoveDealAttachment(dealIndex: number) {
    updateDeal(dealIndex, {
      ...value[dealIndex],
      attachment: null,
      attachment_upload: null,
    });
  }

  async function handleOpenAttachment(deal: BusinessDealOverride) {
    const attachment = getDisplayedAttachment(deal);
    const uri = attachment ? ('url' in attachment ? attachment.url : attachment.uri) : '';
    if (!uri) {
      return;
    }

    const attachmentName = attachment?.name ?? 'Attachment';
    const previewKind = getAttachmentPreviewKind(getAttachmentMimeType(attachment), attachmentName);
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
      } catch {
        // Ignore failed previews inside the inline editor.
      } finally {
        if (attachmentPreviewRequestIdRef.current === requestId) {
          setAttachmentPreviewLoading(false);
        }
      }
    }
  }

  function resolveDealTypeLabel(deal: BusinessDealOverride) {
    if (deal.deal_type === 'other' && String(deal.custom_deal_type_label ?? '').trim()) {
      return String(deal.custom_deal_type_label).trim();
    }
    return dealTypeOptions.find((option) => option.value === deal.deal_type)?.label ?? 'Deal';
  }

  function updateHappyHour(dealIndex: number, happyHourIndex: number, nextWindow: BusinessDealHappyHourOverride) {
    updateDeal(
      dealIndex,
      {
        ...value[dealIndex],
        happy_hours: value[dealIndex].happy_hours.map((window, index) => index === happyHourIndex ? nextWindow : window),
      },
    );
  }

  function toggleHappyHourWeekday(dealIndex: number, happyHourIndex: number, weekday: number) {
    const existingWindow = value[dealIndex].happy_hours[happyHourIndex];
    const existingWeekdays = Array.isArray(existingWindow.weekdays) && existingWindow.weekdays.length
      ? existingWindow.weekdays
      : [existingWindow.weekday];
    const nextWeekdays = existingWeekdays.includes(weekday)
      ? existingWeekdays.filter((entry) => entry !== weekday)
      : [...existingWeekdays, weekday].sort((left, right) => left - right);
    updateHappyHour(
      dealIndex,
      happyHourIndex,
      {
        ...existingWindow,
        weekday: nextWeekdays[0] ?? existingWindow.weekday,
        weekdays: nextWeekdays.length ? nextWeekdays : [weekday],
      },
    );
  }

  function renderDealPreview(deal: BusinessDealOverride) {
    return (
      <View style={styles.dealCard}>
        {getDisplayedAttachment(deal) && getAttachmentPreviewKind(getAttachmentMimeType(getDisplayedAttachment(deal)), getDisplayedAttachment(deal)?.name ?? '') === 'image' ? (
          <Pressable onPress={() => void handleOpenAttachment(deal)} style={styles.dealAttachmentImageButton}>
            <Image resizeMode="cover" source={{ uri: 'url' in (getDisplayedAttachment(deal) as BusinessDealAttachment | BusinessAttachmentDraft) ? (getDisplayedAttachment(deal) as BusinessDealAttachment).url : (getDisplayedAttachment(deal) as BusinessAttachmentDraft).uri }} style={styles.dealAttachmentImage} />
          </Pressable>
        ) : null}
        <View style={styles.dealHeaderRow}>
          <Text style={styles.dealTitle}>{deal.title || 'Untitled deal'}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{resolveDealTypeLabel(deal)}</Text>
          </View>
        </View>
        {getDisplayedAttachment(deal) && getAttachmentPreviewKind(getAttachmentMimeType(getDisplayedAttachment(deal)), getDisplayedAttachment(deal)?.name ?? '') === 'pdf' ? (
          <Pressable onPress={() => void handleOpenAttachment(deal)} style={[styles.attachmentCard, styles.dealAttachmentPdfCard]}>
            <View style={styles.attachmentMeta}>
              <Text style={styles.attachmentName}>{getDisplayedAttachment(deal)?.name}</Text>
              <Text style={styles.attachmentDetail}>PDF attachment • Tap to view</Text>
            </View>
          </Pressable>
        ) : null}
        {deal.price_text ? <Text style={styles.dealPrice}>{deal.price_text}</Text> : null}
        {deal.description ? <Text style={styles.dealDescription}>{deal.description}</Text> : null}
        {deal.terms ? <Text style={styles.dealTerms}>Terms: {deal.terms}</Text> : null}
        <View style={styles.hourList}>
          {formatHappyHourGroups(deal.happy_hours, []).map((group) => (
            <View key={group.id} style={styles.hourGroupCard}>
              <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
              <Text style={styles.hourRow}>{group.timeLabel}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.structuredEditorSection}>
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
      <Modal animationType="fade" onRequestClose={handleCancelRemoveDeal} transparent visible={pendingDealRemovalIndex !== null}>
        <View style={styles.guestFavoriteModalBackdrop}>
          <View style={[styles.guestFavoriteModalCard, { maxHeight: '84%' }]}>
            <Text style={styles.guestFavoriteModalTitle}>Are you sure you want to remove this deal?</Text>
            <Text style={styles.guestFavoriteModalText}>This removes the deal from the business profile once you confirm.</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {pendingDealRemovalIndex !== null ? renderDealPreview(value[pendingDealRemovalIndex]) : null}
            </ScrollView>
            <View style={styles.guestFavoriteModalActions}>
              <Pressable onPress={handleCancelRemoveDeal} style={styles.guestFavoriteModalSecondaryButton}>
                <Text style={styles.guestFavoriteModalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleConfirmRemoveDeal} style={styles.guestFavoriteModalPrimaryButton}>
                <Text style={styles.guestFavoriteModalPrimaryText}>Remove deal</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      <Text style={styles.profileSupportText}>{supportText}</Text>
      {value.map((deal, dealIndex) => (
        <View key={deal.id ?? `deal-${dealIndex}`} style={styles.structuredEditorCard}>
          <TextInput onChangeText={(title) => updateDeal(dealIndex, { ...deal, title })} placeholder="Deal title" placeholderTextColor="#9a7f6c" style={styles.profileInput} value={deal.title} />
          <TextInput onChangeText={(price_text) => updateDeal(dealIndex, { ...deal, price_text })} placeholder="Price or savings" placeholderTextColor="#9a7f6c" style={styles.profileInput} value={deal.price_text} />
          <TextInput multiline onChangeText={(description) => updateDeal(dealIndex, { ...deal, description })} placeholder="Deal description" placeholderTextColor="#9a7f6c" style={[styles.profileInput, styles.dashboardMultilineInput]} textAlignVertical="top" value={deal.description} />
          <TextInput onChangeText={(terms) => updateDeal(dealIndex, { ...deal, terms })} placeholder="Terms or restrictions" placeholderTextColor="#9a7f6c" style={styles.profileInput} value={deal.terms} />
          <DealTypeSelector
            selectedDealType={deal.deal_type}
            onSelect={(deal_type) => updateDeal(dealIndex, {
              ...deal,
              deal_type,
              custom_deal_type_label: deal_type === 'other' ? (deal.custom_deal_type_label ?? '') : '',
            })}
          />
          {deal.deal_type === 'other' ? (
            <TextInput
              onChangeText={(custom_deal_type_label) => updateDeal(dealIndex, { ...deal, custom_deal_type_label })}
              placeholder="Custom deal type"
              placeholderTextColor="#9a7f6c"
              style={styles.profileInput}
              value={deal.custom_deal_type_label ?? ''}
            />
          ) : null}

          <View style={styles.attachmentSection}>
            <Text style={styles.profileSupportText}>Optional: import one photo or PDF for this deal or special.</Text>
            <View style={styles.attachmentList}>
              <Pressable onPress={() => void handleSelectDealPhoto(dealIndex)} style={[styles.linkButtonSecondary, styles.attachmentPickerButton]}>
                <Text style={styles.linkButtonSecondaryText}>Import photo from library</Text>
              </Pressable>
              <Pressable onPress={() => void handleSelectDealPdf(dealIndex)} style={[styles.linkButtonSecondary, styles.attachmentPickerButton]}>
                <Text style={styles.linkButtonSecondaryText}>Import PDF</Text>
              </Pressable>
              {getDisplayedAttachment(deal) ? (
                getAttachmentPreviewKind(getAttachmentMimeType(getDisplayedAttachment(deal)), getDisplayedAttachment(deal)?.name ?? '') === 'image' ? (
                  <View style={styles.attachmentList}>
                    <View style={styles.dealAttachmentImageFrame}>
                      <Pressable onPress={() => void handleOpenAttachment(deal)} style={styles.dealAttachmentImageButton}>
                        <Image resizeMode="cover" source={{ uri: 'url' in (getDisplayedAttachment(deal) as BusinessDealAttachment | BusinessAttachmentDraft) ? (getDisplayedAttachment(deal) as BusinessDealAttachment).url : (getDisplayedAttachment(deal) as BusinessAttachmentDraft).uri }} style={styles.dealAttachmentImage} />
                      </Pressable>
                      <Pressable onPress={() => handleRemoveDealAttachment(dealIndex)} style={styles.photoGalleryDismissButton}>
                        <Text style={styles.photoGalleryDismissButtonText}>X</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.attachmentList}>
                    <TextInput
                      onChangeText={(nextName) => updatePdfAttachmentName(dealIndex, nextName)}
                      placeholder="PDF display name"
                      placeholderTextColor="#9a7f6c"
                      style={styles.profileInput}
                      value={getDisplayedAttachment(deal)?.name ?? ''}
                    />
                    <View style={styles.attachmentCard}>
                      <Pressable onPress={() => void handleOpenAttachment(deal)} style={styles.attachmentPreviewButton}>
                        <View style={styles.attachmentMeta}>
                          <Text style={styles.attachmentName}>{getDisplayedAttachment(deal)?.name}</Text>
                          <Text style={styles.attachmentDetail}>PDF attachment • Tap to view</Text>
                        </View>
                      </Pressable>
                      <Pressable onPress={() => handleRemoveDealAttachment(dealIndex)} style={styles.attachmentRemoveButton}>
                        <Text style={styles.attachmentRemoveButtonText}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                )
              ) : null}
            </View>
          </View>

          {deal.happy_hours.map((window, happyHourIndex) => (
            <View key={window.id ?? `happy-hour-${happyHourIndex}`} style={styles.structuredNestedCard}>
              <WeekdaySelector
                selectedWeekdays={Array.isArray(window.weekdays) && window.weekdays.length ? window.weekdays : [window.weekday]}
                onToggle={(weekday) => toggleHappyHourWeekday(dealIndex, happyHourIndex, weekday)}
              />
              <Pressable onPress={() => updateHappyHour(dealIndex, happyHourIndex, { ...window, all_day: !window.all_day })} style={[styles.structuredWeekdayChip, window.all_day ? styles.structuredWeekdayChipActive : null]}>
                <Text style={[styles.structuredWeekdayChipText, window.all_day ? styles.structuredWeekdayChipTextActive : null]}>All day</Text>
              </Pressable>
              {!window.all_day ? (
                <View style={styles.structuredTimeRow}>
                  <TextInput
                    onChangeText={(start_time) => updateHappyHour(dealIndex, happyHourIndex, { ...window, start_time })}
                    placeholder="3:00 PM"
                    placeholderTextColor="#9a7f6c"
                    style={[styles.profileInput, styles.structuredTimeInput]}
                    value={window.start_time}
                  />
                  <TextInput
                    onChangeText={(end_time) => updateHappyHour(dealIndex, happyHourIndex, { ...window, end_time })}
                    placeholder="6:00 PM"
                    placeholderTextColor="#9a7f6c"
                    style={[styles.profileInput, styles.structuredTimeInput]}
                    value={window.end_time}
                  />
                </View>
              ) : null}
              <Pressable onPress={() => updateDeal(dealIndex, { ...deal, happy_hours: deal.happy_hours.filter((_, index) => index !== happyHourIndex) })} style={styles.structuredRemoveButton}>
                <Text style={styles.structuredRemoveButtonText}>Remove day/time</Text>
              </Pressable>
            </View>
          ))}

          <Pressable onPress={() => updateDeal(dealIndex, { ...deal, happy_hours: [...deal.happy_hours, createEmptyHappyHourOverride()] })} style={styles.linkButtonSecondary}>
            <Text style={styles.linkButtonSecondaryText}>Add deal day/time</Text>
          </Pressable>

          <Text style={styles.dealPreviewLabel}>Preview</Text>
          {renderDealPreview(deal)}

          <Pressable onPress={() => handleRequestRemoveDeal(dealIndex)} style={styles.structuredRemoveButton}>
            <Text style={styles.structuredRemoveButtonText}>Remove deal</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChange([...value, createEmptyDealOverride()])} style={styles.linkButtonSecondary}>
        <Text style={styles.linkButtonSecondaryText}>Add deal or special</Text>
      </Pressable>
    </View>
  );
}