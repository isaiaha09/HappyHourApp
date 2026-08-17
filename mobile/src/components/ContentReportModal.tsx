import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { styles } from '../appStyles';
import type { ContentReportReason, ContentReportScreenshotDraft } from '../types';

const reportReasonOptions: Array<{ label: string; value: ContentReportReason }> = [
  { label: 'Objectionable content', value: 'objectionable_content' },
  { label: 'Spam or scam', value: 'spam_or_scam' },
  { label: 'Harassment or abuse', value: 'harassment_or_abuse' },
  { label: 'Misleading information', value: 'misleading_information' },
  { label: 'Copyright or other rights issue', value: 'intellectual_property' },
  { label: 'Other', value: 'other' },
];

type ContentReportModalProps = {
  onClose: () => void;
  onSubmit: (reason: ContentReportReason, details: string, screenshot: ContentReportScreenshotDraft | null) => Promise<string>;
  screenshotTip?: boolean;
  targetLabel: string;
  visible: boolean;
};

function buildScreenshotDraft(asset: ImagePicker.ImagePickerAsset): ContentReportScreenshotDraft {
  const extension = asset.mimeType?.includes('png') ? 'png' : 'jpg';
  return {
    id: `${asset.assetId ?? asset.uri}::${asset.fileName ?? 'report-screenshot'}::${asset.fileSize ?? 0}`,
    name: asset.fileName ?? `report-screenshot-${Date.now()}.${extension}`,
    uri: asset.uri,
    mimeType: asset.mimeType ?? `image/${extension}`,
    size: asset.fileSize ?? null,
  };
}

export function ContentReportModal({ onClose, onSubmit, screenshotTip = false, targetLabel, visible }: ContentReportModalProps) {
  const [details, setDetails] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<ContentReportReason | null>(null);
  const [screenshot, setScreenshot] = useState<ContentReportScreenshotDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reportScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDetails('');
    setErrorMessage(null);
    setSelectedReason(null);
    setScreenshot(null);
    setSubmitting(false);
  }, [visible]);

  async function handlePickScreenshot() {
    try {
      const picker = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: false,
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (picker.canceled || !picker.assets.length) {
        return;
      }

      setScreenshot(buildScreenshotDraft(picker.assets[0]));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to attach a screenshot right now.');
    }
  }

  async function handleSubmit() {
    if (!selectedReason) {
      setErrorMessage('Choose a reason for this report.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const detail = await onSubmit(selectedReason, details.trim(), screenshot);
      onClose();
      Alert.alert('Report sent', detail || 'Thanks. Your report was sent to the DiningDealz review team.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send this report right now.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDetailsFocus() {
    requestAnimationFrame(() => {
      reportScrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  return (
    <Modal animationType="fade" onRequestClose={submitting ? undefined : onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.contentReportKeyboardAvoidingView}>
        <View style={styles.contentReportBackdrop}>
          <View style={styles.contentReportCard}>
            <ScrollView
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              ref={reportScrollRef}
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.contentReportTitle}>Report {targetLabel}</Text>
            <Text style={styles.contentReportSupportText}>Choose the reason that best describes the problem. Reports are reviewed by the DiningDealz team.</Text>
            {screenshotTip ? <Text style={styles.contentReportScreenshotTip}>You can cancel this form, take a screenshot with your device controls, then reopen Report and attach it from Photos.</Text> : null}

            <View style={styles.contentReportReasonList}>
              {reportReasonOptions.map((option) => {
                const selected = option.value === selectedReason;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={option.value}
                    onPress={() => setSelectedReason(option.value)}
                    style={[styles.contentReportReasonButton, selected ? styles.contentReportReasonButtonActive : null]}
                  >
                    <View style={[styles.contentReportReasonIndicator, selected ? styles.contentReportReasonIndicatorActive : null]}>
                      {selected ? <View style={styles.contentReportReasonIndicatorDot} /> : null}
                    </View>
                    <Text style={styles.contentReportReasonText}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.contentReportAttachmentSection}>
              <Text style={styles.contentReportLabel}>Screenshot evidence (optional)</Text>
              {screenshot ? (
                <View style={styles.contentReportAttachmentPreview}>
                  <Image resizeMode="contain" source={{ uri: screenshot.uri }} style={styles.contentReportAttachmentImage} />
                  <View style={styles.contentReportAttachmentMeta}>
                    <Text numberOfLines={1} style={styles.contentReportAttachmentName}>{screenshot.name}</Text>
                    <Pressable disabled={submitting} onPress={() => setScreenshot(null)} style={styles.contentReportAttachmentRemoveButton}>
                      <Ionicons color="#b94b2d" name="trash-outline" size={16} />
                      <Text style={styles.contentReportAttachmentRemoveText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable disabled={submitting} onPress={() => void handlePickScreenshot()} style={[styles.contentReportAttachmentButton, submitting ? styles.linkButtonDisabled : null]}>
                  <Ionicons color="#8a4b2a" name="image-outline" size={18} />
                  <Text style={styles.contentReportAttachmentButtonText}>Attach screenshot</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.contentReportLabel}>Additional details (optional)</Text>
            <TextInput
              multiline
              onChangeText={setDetails}
              onFocus={handleDetailsFocus}
              placeholder="Tell us what happened."
              placeholderTextColor="#8b95a8"
              style={styles.contentReportInput}
              textAlignVertical="top"
              value={details}
            />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <View style={styles.contentReportActions}>
              <Pressable disabled={submitting} onPress={onClose} style={styles.contentReportCancelButton}>
                <Text style={styles.contentReportCancelText}>Cancel</Text>
              </Pressable>
              <Pressable disabled={submitting} onPress={() => void handleSubmit()} style={[styles.contentReportSubmitButton, submitting ? styles.linkButtonDisabled : null]}>
                {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : null}
                <Text style={styles.contentReportSubmitText}>{submitting ? 'Sending...' : 'Send report'}</Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}