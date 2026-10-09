import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '../appStyles';
import { theme } from '../styles/theme';
import { AutoScrollTextInput } from './AutoScrollTextInput';
import { DealDescription } from './DealDescription';
import { ReadOnlyPdfPreviewModal } from './ReadOnlyPdfPreviewModal';
import { formatFileSize, getDealPdfSizeDetail, MAX_DEAL_PDF_UPLOAD_BYTES } from '../utils/fileSizes';
import {
  businessWeekdayOptions,
  createEmptyDealMenuItemOverride,
  createEmptyDealOverride,
  createEmptyHappyHourOverride,
  createEmptyOperatingHourOverride,
  formatHappyHourGroups,
  formatOperatingHourGroups,
  normalizeMenuItemWeekdays,
  MAX_DEAL_MENU_ITEMS,
} from '../businessProfileOverrides';
import type {
  BusinessAttachmentDraft,
  BusinessDealAttachment,
  BusinessDealHappyHourOverride,
  BusinessDealMenuItem,
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

function WeekdaySelector({ selectedWeekdays, onToggle, comfortable = false, labelPrefix }: { onToggle: (weekday: number) => void; selectedWeekdays: number[]; comfortable?: boolean; labelPrefix?: string }) {
  return (
    <View style={styles.structuredWeekdayRow}>
      {businessWeekdayOptions.map((option) => (
        <Pressable
          accessibilityLabel={labelPrefix ? `${labelPrefix} ${option.label}` : option.label}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedWeekdays.includes(option.weekday) }}
          key={option.weekday}
          onPress={() => onToggle(option.weekday)}
          style={[styles.structuredWeekdayChip, comfortable ? styles.dealEditorChoice : null, selectedWeekdays.includes(option.weekday) ? (comfortable ? styles.dealEditorChoiceActive : styles.structuredWeekdayChipActive) : null]}
        >
          <Text style={[styles.structuredWeekdayChipText, selectedWeekdays.includes(option.weekday) ? (comfortable ? styles.dealEditorChoiceTextActive : styles.structuredWeekdayChipTextActive) : null]}>{option.label}</Text>
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
          accessibilityRole="button"
          accessibilityState={{ selected: selectedDealType === option.value }}
          key={option.value}
          onPress={() => onSelect(option.value)}
          style={[styles.structuredWeekdayChip, styles.dealEditorChoice, selectedDealType === option.value ? styles.dealEditorChoiceActive : null]}
        >
          <Text style={[styles.structuredWeekdayChipText, selectedDealType === option.value ? styles.dealEditorChoiceTextActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DealEditorSection({ children, step, title, help }: { children: ReactNode; step: number; title: string; help: string }) {
  return (
    <View style={styles.dealEditorSection}>
      <View style={styles.dealEditorSectionHeading}>
        <Text style={styles.dealEditorStep}>{step}</Text>
        <Text accessibilityRole="header" style={styles.dealEditorSectionTitle}>{title}</Text>
      </View>
      <Text style={styles.dealEditorHelp}>{help}</Text>
      {children}
    </View>
  );
}

type DealEditorScrollContextValue = {
  onFieldBlur?: (target?: number | null) => void;
  onFieldFocus?: (target?: number | null) => void;
  scrollViewRef?: RefObject<ScrollView | null>;
};

const DealEditorScrollContext = createContext<DealEditorScrollContextValue>({});

type DealEditorFieldProps = TextInputProps & DealEditorScrollContextValue & { label: string; help?: string };

function DealEditorField({ label, help, style, onFieldBlur, onFieldFocus, scrollViewRef, ...inputProps }: DealEditorFieldProps) {
  const [focused, setFocused] = useState(false);
  const scrollContext = useContext(DealEditorScrollContext);
  const fieldScrollViewRef = scrollViewRef ?? scrollContext.scrollViewRef;
  const handleFocusTarget = onFieldFocus ?? scrollContext.onFieldFocus;
  const handleBlurTarget = onFieldBlur ?? scrollContext.onFieldBlur;
  const fieldInputProps: TextInputProps = {
    accessibilityLabel: label,
    keyboardAppearance: 'dark',
    placeholderTextColor: theme.textMuted,
    textAlignVertical: inputProps.multiline ? 'top' : 'center',
    ...inputProps,
    onFocus: (event) => { setFocused(true); inputProps.onFocus?.(event); },
    onBlur: (event) => { setFocused(false); inputProps.onBlur?.(event); },
    style: [styles.dealEditorInput, inputProps.multiline ? styles.dealEditorMultilineInput : null, focused ? styles.dealEditorInputFocused : null, style],
  };

  return (
    <View style={styles.dealEditorField}>
      <Text style={styles.dealEditorFieldLabel}>{label}</Text>
      {help ? <Text style={styles.dealEditorHelp}>{help}</Text> : null}
      {fieldScrollViewRef ? (
        <AutoScrollTextInput
          {...fieldInputProps}
          onBeforeAutoScroll={handleFocusTarget}
          onFieldBlur={handleBlurTarget}
          scrollViewRef={fieldScrollViewRef}
        />
      ) : <TextInput {...fieldInputProps} />}
    </View>
  );
}

function DealEditorDisclosure({ children, title, help, hasContent }: { children: ReactNode; title: string; help: string; hasContent: boolean }) {
  const [expanded, setExpanded] = useState(hasContent);
  // Existing or asynchronously loaded content is never hidden on first edit.
  useEffect(() => { if (hasContent) setExpanded(true); }, [hasContent]);
  return (
    <View style={styles.dealEditorDisclosure}>
      <Pressable
        accessibilityLabel={title}
        accessibilityHint={help}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={styles.dealEditorDisclosureButton}
      >
        <View style={styles.dealEditorDisclosureCopy}>
          <Text style={styles.dealEditorDisclosureTitle}>{title}</Text>
          <Text style={styles.dealEditorHelp}>{expanded ? help : 'Optional · Tap to add or edit'}</Text>
        </View>
        <Text style={styles.dealEditorDisclosureIndicator}>{expanded ? '−' : '+'}</Text>
      </Pressable>
      {expanded ? <View style={styles.dealEditorDisclosureContent}>{children}</View> : null}
    </View>
  );
}

function DealMenuItemEditor({ item, itemIndex, onChange }: { item: BusinessDealMenuItem; itemIndex: number; onChange: (item: BusinessDealMenuItem) => void }) {
  const selectedDays = normalizeMenuItemWeekdays(item.weekdays);
  const [choosingDays, setChoosingDays] = useState(selectedDays.length > 0);
  const [previousDays, setPreviousDays] = useState(selectedDays);
  const showDays = choosingDays || selectedDays.length > 0;
  const itemLabel = `Menu item ${itemIndex + 1}`;

  function selectLayout(days: boolean) {
    if (showDays === days) {
      return;
    }
    setChoosingDays(days);
    if (days) {
      onChange({ ...item, weekdays: previousDays });
    } else {
      setPreviousDays(selectedDays);
      const { weekdays: _weekdays, ...priceItem } = item;
      onChange(priceItem);
    }
  }

  return (
    <>
      <DealEditorField
        label="Item name"
        accessibilityLabel={`${itemLabel} name`}
        autoCapitalize="sentences"
        maxLength={120}
        onChangeText={(name) => onChange({ ...item, name })}
        placeholder="For example, House margarita"
        value={item.name}
      />
      <View style={styles.dealEditorField}>
        <Text style={styles.dealEditorFieldLabel}>Display beside this item</Text>
        <View style={styles.structuredDealTypeRow}>
          {[{ label: 'Price column', days: false }, { label: 'Weekday label', days: true }].map((option) => (
            <Pressable
              accessibilityLabel={`${itemLabel} ${option.label.toLowerCase()}`}
              accessibilityRole="button"
              accessibilityState={{ selected: showDays === option.days }}
              key={option.label}
              onPress={() => selectLayout(option.days)}
              style={[styles.structuredWeekdayChip, styles.dealEditorChoice, showDays === option.days ? styles.dealEditorChoiceActive : null]}
            >
              <Text style={[styles.structuredWeekdayChipText, showDays === option.days ? styles.dealEditorChoiceTextActive : null]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        {showDays ? (
          <>
            <Text style={styles.dealEditorHelp}>Choose the days shown beside this offer. Its price stays in the offer text, not a separate column. Set the deal's overall schedule in step 3.</Text>
            <WeekdaySelector
              comfortable
              labelPrefix={itemLabel}
              selectedWeekdays={selectedDays}
              onToggle={(day) => {
                const weekdays = selectedDays.includes(day) ? selectedDays.filter((value) => value !== day) : [...selectedDays, day].sort((left, right) => left - right);
                setPreviousDays(weekdays);
                onChange({ ...item, weekdays });
              }}
            />
          </>
        ) : null}
      </View>
      <DealEditorField
        label={showDays ? 'Price in offer text (optional)' : 'Item price or savings'}
        accessibilityLabel={`${itemLabel} price`}
        maxLength={120}
        onChangeText={(price) => onChange({ ...item, price })}
        placeholder="For example, $8 or $2 off"
        value={item.price}
      />
      <DealEditorField
        label="Item details (optional)"
        accessibilityLabel={`${itemLabel} details`}
        maxLength={4000}
        multiline
        onChangeText={(detail) => onChange({ ...item, detail })}
        placeholder="For example, Fresh lime and agave"
        value={item.detail}
      />
    </>
  );
}

type BusinessHoursEditorProps = {
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  onFieldBlur: (target?: number | null) => void;
  onFieldFocus: (target?: number | null) => void;
  onChange: (value: BusinessOperatingHourOverride[]) => void;
  scrollViewRef: RefObject<ScrollView | null>;
  supportText: string;
  value: BusinessOperatingHourOverride[];
};

export function BusinessHoursEditor({ label, labelStyle, onFieldBlur, onFieldFocus, onChange, scrollViewRef, supportText, value }: BusinessHoursEditorProps) {
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
      <Text style={[styles.profileFieldLabel, labelStyle]}>{label}</Text>
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
              <AutoScrollTextInput
                accessibilityLabel={`Opening time for schedule ${index + 1}`}
                keyboardAppearance="dark"
                onBeforeAutoScroll={onFieldFocus}
                onChangeText={(open_time) => updateRow(index, { ...row, open_time })}
                onFieldBlur={onFieldBlur}
                placeholder="11:00 AM"
                placeholderTextColor="#9a7f6c"
                scrollViewRef={scrollViewRef}
                style={[styles.profileInput, styles.structuredTimeInput]}
                value={row.open_time}
              />
              <AutoScrollTextInput
                accessibilityLabel={`Closing time for schedule ${index + 1}`}
                keyboardAppearance="dark"
                onBeforeAutoScroll={onFieldFocus}
                onChangeText={(close_time) => updateRow(index, { ...row, close_time })}
                onFieldBlur={onFieldBlur}
                placeholder="10:00 PM"
                placeholderTextColor="#9a7f6c"
                scrollViewRef={scrollViewRef}
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
  labelStyle?: StyleProp<TextStyle>;
  onFieldBlur?: (target?: number | null) => void;
  onFieldFocus?: (target?: number | null) => void;
  onChange: (value: BusinessDealOverride[]) => void;
  scrollViewRef?: RefObject<ScrollView | null>;
  supportText: string;
  value: BusinessDealOverride[];
};

export function BusinessDealsEditor({ label, labelStyle, onFieldBlur, onFieldFocus, onChange, scrollViewRef, supportText, value }: BusinessDealsEditorProps) {
  const insets = useSafeAreaInsets();
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ name: string; uri: string } | null>(null);
  const [pdfSelectionError, setPdfSelectionError] = useState<string | null>(null);
  const [openingPhotoLibraryForDeal, setOpeningPhotoLibraryForDeal] = useState<number | null>(null);
  const [pendingDealRemovalIndex, setPendingDealRemovalIndex] = useState<number | null>(null);

  function handleCloseAttachmentPreview() {
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
    if (mimeType === 'application/pdf' || getAttachmentPreviewKind(mimeType, attachment.name) === 'pdf') {
      const fileSize = 'size' in attachment ? attachment.size : attachment.file_size;
      return getDealPdfSizeDetail(fileSize);
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
    setOpeningPhotoLibraryForDeal(dealIndex);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ['images'],
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
    } finally {
      setOpeningPhotoLibraryForDeal(null);
    }
  }

  async function handleSelectDealPdf(dealIndex: number) {
    setPdfSelectionError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'application/pdf',
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const selectedPdf = result.assets[0];
      if (selectedPdf.size != null && selectedPdf.size > MAX_DEAL_PDF_UPLOAD_BYTES) {
        setPdfSelectionError(`This PDF is ${formatFileSize(selectedPdf.size)}. Deal PDFs must be 10 MB or smaller.`);
        return;
      }

      updateDeal(dealIndex, {
        ...value[dealIndex],
        attachment: null,
        attachment_upload: normalizeDocumentAttachment(selectedPdf),
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

  function handleOpenAttachment(deal: BusinessDealOverride) {
    const attachment = getDisplayedAttachment(deal);
    const uri = attachment ? ('url' in attachment ? attachment.url : attachment.uri) : '';
    if (!uri) {
      return;
    }

    const attachmentName = attachment?.name ?? 'Attachment';
    const previewKind = getAttachmentPreviewKind(getAttachmentMimeType(attachment), attachmentName);
    if (previewKind === 'image') {
      setAttachmentPreview({ kind: 'image', name: attachmentName, uri });
      return;
    }

    if (previewKind === 'pdf') {
      setAttachmentPreview(null);
      setPdfPreview({ name: attachmentName, uri });
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
        happy_hours: value[dealIndex].happy_hours.map((window, windowIndex) => windowIndex === happyHourIndex ? nextWindow : window),
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
      <View style={[styles.dealCard, styles.publicProfileDealCard, styles.dealEditorPreview]}>
        {getDisplayedAttachment(deal) && getAttachmentPreviewKind(getAttachmentMimeType(getDisplayedAttachment(deal)), getDisplayedAttachment(deal)?.name ?? '') === 'image' ? (
          <Pressable onPress={() => void handleOpenAttachment(deal)} style={styles.dealAttachmentImageButton}>
            <Image resizeMode="cover" source={{ uri: 'url' in (getDisplayedAttachment(deal) as BusinessDealAttachment | BusinessAttachmentDraft) ? (getDisplayedAttachment(deal) as BusinessDealAttachment).url : (getDisplayedAttachment(deal) as BusinessAttachmentDraft).uri }} style={styles.dealAttachmentImage} />
          </Pressable>
        ) : null}
        <View style={styles.dealEditorPreviewTypeRow}>
          <View style={[styles.pill, styles.publicProfileDealType]}>
            <Text style={[styles.pillText, styles.publicProfileDealTypeText]}>{resolveDealTypeLabel(deal)}</Text>
          </View>
        </View>
        <View style={styles.publicProfileDealTitlePriceRow}>
          <Text style={[styles.dealTitle, styles.publicProfileDealTitle]}>{deal.title || 'Untitled deal'}</Text>
          {deal.price_text ? (
            <View style={styles.publicProfilePriceBadge}>
              <Text style={[styles.dealPrice, styles.publicProfileDealPrice]}>{deal.price_text}</Text>
            </View>
          ) : null}
        </View>
        {getDisplayedAttachment(deal) && getAttachmentPreviewKind(getAttachmentMimeType(getDisplayedAttachment(deal)), getDisplayedAttachment(deal)?.name ?? '') === 'pdf' ? (
          <Pressable onPress={() => void handleOpenAttachment(deal)} style={[styles.attachmentCard, styles.dealAttachmentPdfCard]}>
            <View style={styles.attachmentMeta}>
              <Text style={styles.attachmentName}>{getDisplayedAttachment(deal)?.name}</Text>
              <Text style={styles.attachmentDetail}>PDF attachment • Tap to view</Text>
            </View>
          </Pressable>
        ) : null}
        {deal.description || deal.description_price || deal.menu_items?.length ? (
          <DealDescription description={deal.description} descriptionPrice={deal.description_price} menuItems={deal.menu_items} presentation="profile" />
        ) : null}
        {deal.terms ? <Text style={[styles.dealTerms, styles.publicProfileDealTerms]}>Terms: {deal.terms}</Text> : null}
        <View style={[styles.hourList, styles.publicProfileScheduleList, styles.publicProfileDealScheduleList]}>
          {formatHappyHourGroups(deal.happy_hours, []).map((group) => (
            <View key={group.id} style={[styles.hourGroupCard, styles.publicProfileScheduleCard, styles.publicProfileDealScheduleCard]}>
              <Text style={[styles.hourGroupDays, styles.publicProfileScheduleDays]}>{group.dayLabel}</Text>
              <Text style={[styles.hourRow, styles.publicProfileScheduleTime]}>{group.timeLabel}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <DealEditorScrollContext.Provider value={{ onFieldBlur, onFieldFocus, scrollViewRef }}>
    <View style={styles.structuredEditorSection}>
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
      <Text style={[styles.profileFieldLabel, labelStyle]}>{label}</Text>
      <Text style={styles.profileSupportText}>{supportText}</Text>
      {value.map((deal, dealIndex) => (
        <View key={deal.id ?? `deal-${dealIndex}`} style={styles.dealEditorCard}>
          <Text style={styles.dealEditorEyebrow}>{`DEAL ${dealIndex + 1}`}</Text>
          <DealEditorSection step={1} title="Name the promotion" help="This is the heading of the whole deal card, not an individual food or drink.">
            <DealEditorField
              label="Deal title"
              onChangeText={(title) => updateDeal(dealIndex, { ...deal, title })}
              placeholder="For example, Happy Hour Menu"
              value={deal.title}
            />
            <View style={styles.dealEditorField}>
              <Text style={styles.dealEditorFieldLabel}>Deal type</Text>
              <DealTypeSelector
                selectedDealType={deal.deal_type}
                onSelect={(deal_type) => updateDeal(dealIndex, {
                  ...deal,
                  deal_type,
                  custom_deal_type_label: deal_type === 'other' ? (deal.custom_deal_type_label ?? '') : '',
                })}
              />
            </View>
            {deal.deal_type === 'other' ? (
              <DealEditorField
                label="Custom deal type"
                onChangeText={(custom_deal_type_label) => updateDeal(dealIndex, { ...deal, custom_deal_type_label })}
                placeholder="For example, Taco Tuesday"
                value={deal.custom_deal_type_label ?? ''}
              />
            ) : null}
            <DealEditorDisclosure title="Price label beside the deal title" help="A summary price or savings for the whole promotion. Individual item prices go in step 2." hasContent={Boolean(deal.price_text)}>
              <DealEditorField
                label="Headline price or savings"
                onChangeText={(price_text) => updateDeal(dealIndex, { ...deal, price_text })}
                placeholder="For example, $4–$7 or 20% off"
                value={deal.price_text}
              />
            </DealEditorDisclosure>
          </DealEditorSection>

          <DealEditorSection step={2} title="What customers get" help="For a menu, add each food or drink below. For one overall offer, use “Single offer or general note.”">
            <View style={styles.dealEditorItemHeading}>
              <Text style={styles.dealEditorFieldLabel}>Menu items</Text>
              <Text style={styles.dealEditorHelp}>{`${(deal.menu_items ?? []).length} / ${MAX_DEAL_MENU_ITEMS}`}</Text>
            </View>
            {(deal.menu_items ?? []).map((item, itemIndex) => (
              <View key={item.id ?? 'menu-item-' + itemIndex} style={styles.dealEditorEntry}>
                <View style={styles.dealEditorItemHeading}>
                  <Text style={styles.dealEditorEyebrow}>{`ITEM ${itemIndex + 1}`}</Text>
                  <Pressable
                    accessibilityLabel={'Remove menu item ' + (itemIndex + 1)}
                    accessibilityRole="button"
                    onPress={() => updateDeal(dealIndex, {
                      ...deal,
                      menu_items: (deal.menu_items ?? []).filter((_, index) => index !== itemIndex),
                    })}
                    style={styles.dealEditorTextButton}
                  >
                    <Text style={styles.dealEditorTextButtonLabel}>Remove item</Text>
                  </Pressable>
                </View>
                <DealMenuItemEditor
                  item={item}
                  itemIndex={itemIndex}
                  onChange={(updatedItem) => updateDeal(dealIndex, {
                    ...deal,
                    menu_items: (deal.menu_items ?? []).map((current, index) => index === itemIndex ? updatedItem : current),
                  })}
                />
              </View>
            ))}
            <Pressable
              accessibilityState={{ disabled: (deal.menu_items ?? []).length >= MAX_DEAL_MENU_ITEMS }}
              accessibilityRole="button"
              disabled={(deal.menu_items ?? []).length >= MAX_DEAL_MENU_ITEMS}
              onPress={() => updateDeal(dealIndex, {
                ...deal,
                menu_items: [...(deal.menu_items ?? []), createEmptyDealMenuItemOverride()],
              })}
              style={[styles.dealEditorAddButton, (deal.menu_items ?? []).length >= MAX_DEAL_MENU_ITEMS ? styles.dealEditorDisabled : null]}
            >
              <Text style={styles.dealEditorAddButtonLabel}>Add menu item</Text>
            </Pressable>
            <Text style={styles.dealEditorHelp}>Names, prices, and details are formatted automatically in your public profile. No special spacing needed.</Text>
            <DealEditorDisclosure title="Single offer or general note" help="Use this for one offer, such as half-price appetizers, or a note that applies to all menu items." hasContent={Boolean(deal.description || deal.description_price)}>
              <DealEditorField
                label="Overall offer or note"
                maxLength={4000}
                multiline
                onChangeText={(description) => updateDeal(dealIndex, { ...deal, description })}
                placeholder="For example, Half-price appetizers at the bar"
                value={deal.description}
              />
              <DealEditorField
                label="Price for this offer (optional)"
                maxLength={120}
                onChangeText={(description_price) => updateDeal(dealIndex, { ...deal, description_price })}
                placeholder="For example, $5 or 50% off"
                value={deal.description_price ?? ''}
              />
            </DealEditorDisclosure>
          </DealEditorSection>

          <DealEditorSection step={3} title="Availability & restrictions" help="Choose when this deal is available and add any rules customers should know.">
            <DealEditorField label="Terms or restrictions (optional)" onChangeText={(terms) => updateDeal(dealIndex, { ...deal, terms })} placeholder="For example, Dine-in only · Bar and patio" value={deal.terms} />
            {deal.happy_hours.map((window, happyHourIndex) => (
              <View key={window.id ?? `happy-hour-${happyHourIndex}`} style={styles.dealEditorEntry}>
                <Text style={styles.dealEditorEyebrow}>{`SCHEDULE ${happyHourIndex + 1}`}</Text>
                <Text style={styles.dealEditorFieldLabel}>Available days</Text>
                <WeekdaySelector
                  comfortable
                  selectedWeekdays={Array.isArray(window.weekdays) && window.weekdays.length ? window.weekdays : [window.weekday]}
                  onToggle={(weekday) => toggleHappyHourWeekday(dealIndex, happyHourIndex, weekday)}
                />
                <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(window.all_day) }} onPress={() => updateHappyHour(dealIndex, happyHourIndex, { ...window, all_day: !window.all_day })} style={[styles.structuredWeekdayChip, styles.dealEditorAllDayButton, window.all_day ? styles.dealEditorChoiceActive : null]}>
                  <Text style={[styles.structuredWeekdayChipText, window.all_day ? styles.dealEditorChoiceTextActive : null]}>All day</Text>
                </Pressable>
                {!window.all_day ? (
                  <View style={styles.structuredTimeRow}>
                    <View style={styles.structuredTimeInput}>
                      <DealEditorField label="Start time" accessibilityLabel={`Schedule ${happyHourIndex + 1} start time`} onChangeText={(start_time) => updateHappyHour(dealIndex, happyHourIndex, { ...window, start_time })} placeholder="3:00 PM" value={window.start_time} />
                    </View>
                    <View style={styles.structuredTimeInput}>
                      <DealEditorField label="End time" accessibilityLabel={`Schedule ${happyHourIndex + 1} end time`} onChangeText={(end_time) => updateHappyHour(dealIndex, happyHourIndex, { ...window, end_time })} placeholder="6:00 PM" value={window.end_time} />
                    </View>
                  </View>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => updateDeal(dealIndex, { ...deal, happy_hours: deal.happy_hours.filter((_, index) => index !== happyHourIndex) })} style={styles.dealEditorTextButton}>
                  <Text style={styles.dealEditorTextButtonLabel}>Remove day/time</Text>
                </Pressable>
              </View>
            ))}
            <Pressable accessibilityRole="button" onPress={() => updateDeal(dealIndex, { ...deal, happy_hours: [...deal.happy_hours, createEmptyHappyHourOverride()] })} style={styles.dealEditorAddButton}>
              <Text style={styles.dealEditorAddButtonLabel}>Add deal day/time</Text>
            </Pressable>
          </DealEditorSection>

          <DealEditorSection step={4} title="Add a photo or PDF" help="Optional · Attach one photo or PDF to this deal. PDFs must be 10 MB or smaller.">
            <View style={styles.attachmentList}>
              <Pressable accessibilityRole="button" onPress={() => void handleSelectDealPhoto(dealIndex)} style={[styles.dealEditorAddButton, styles.attachmentPickerButton]}>
                <Text style={styles.dealEditorAddButtonLabel}>{openingPhotoLibraryForDeal === dealIndex ? 'Opening Photo Library...' : 'Import photo from library'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void handleSelectDealPdf(dealIndex)} style={[styles.dealEditorAddButton, styles.attachmentPickerButton]}>
                <Text style={styles.dealEditorAddButtonLabel}>Import PDF</Text>
              </Pressable>
              {pdfSelectionError ? <Text style={styles.structuredEntryErrorText}>{pdfSelectionError}</Text> : null}
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
                    <DealEditorField
                      label="PDF display name"
                      onChangeText={(nextName) => updatePdfAttachmentName(dealIndex, nextName)}
                      placeholder="PDF display name"
                      value={getDisplayedAttachment(deal)?.name ?? ''}
                    />
                    <View style={styles.attachmentCard}>
                      <Pressable onPress={() => void handleOpenAttachment(deal)} style={styles.attachmentPreviewButton}>
                        <View style={styles.attachmentMeta}>
                          <Text style={styles.attachmentName}>{getDisplayedAttachment(deal)?.name}</Text>
                          <Text style={styles.attachmentDetail}>{`${getAttachmentDetailLabel(getDisplayedAttachment(deal) as BusinessDealAttachment | BusinessAttachmentDraft)} · Tap to view`}</Text>
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
          </DealEditorSection>

          <DealEditorSection step={5} title="Check your deal" help="This live preview uses the same formatting as your public profile. Your changes are saved when you submit the form.">
            {renderDealPreview(deal)}
          </DealEditorSection>

          <Pressable accessibilityRole="button" onPress={() => handleRequestRemoveDeal(dealIndex)} style={styles.dealEditorTextButton}>
            <Text style={styles.dealEditorTextButtonLabel}>Remove deal</Text>
          </Pressable>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => onChange([...value, createEmptyDealOverride()])} style={styles.dealEditorAddButton}>
        <Text style={styles.dealEditorAddButtonLabel}>Add deal or special</Text>
      </Pressable>
    </View>
    </DealEditorScrollContext.Provider>
  );
}
