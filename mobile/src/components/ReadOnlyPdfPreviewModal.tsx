import { useEffect, useState } from 'react';
import { PdfView } from '@kishannareshpal/expo-pdf';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { preparePdfForPreview, type PreparedPdfPreview } from '../utils/nativePdfViewer';

type ReadOnlyPdfPreviewModalProps = {
  fileName: string;
  onClose: () => void;
  uri: string | null;
  visible: boolean;
};

export function ReadOnlyPdfPreviewModal({ fileName, onClose, uri, visible }: ReadOnlyPdfPreviewModalProps) {
  const [preparedPreview, setPreparedPreview] = useState<{
    sourceUri: string;
    preview: PreparedPdfPreview;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!visible || !uri) {
      return undefined;
    }

    let cancelled = false;
    let prepared: PreparedPdfPreview | null = null;
    const abortController = new AbortController();
    setPreparedPreview(null);
    setHasError(false);
    setIsLoading(true);

    void preparePdfForPreview(uri, abortController.signal)
      .then((result) => {
        prepared = result;
        if (cancelled) {
          void result.cleanup();
          return;
        }
        setPreparedPreview({ sourceUri: uri, preview: result });
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      if (prepared) {
        void prepared.cleanup();
      }
    };
  }, [uri, visible]);

  const onPdfLoaded = () => setIsLoading(false);
  const onPdfError = () => {
    setIsLoading(false);
    setHasError(true);
  };
  const currentPreview = preparedPreview?.sourceUri === uri ? preparedPreview.preview : null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {fileName || 'PDF preview'}
          </Text>
          <Pressable
            accessibilityLabel="Close PDF preview"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.viewer}>
          {visible && currentPreview && !hasError ? (
            <PdfView
              fitMode="width"
              onError={onPdfError}
              onLoadComplete={onPdfLoaded}
              style={styles.pdf}
              uri={currentPreview.uri}
            />
          ) : null}
          {isLoading ? (
            <View pointerEvents="none" style={styles.statusOverlay}>
              <ActivityIndicator color="#fff7ef" size="large" />
              <Text style={styles.statusText}>Preparing PDF preview…</Text>
            </View>
          ) : null}
          {hasError ? (
            <View style={styles.statusOverlay}>
              <Text style={styles.errorTitle}>Unable to preview this PDF</Text>
              <Text style={styles.statusText}>It may be unavailable, invalid, or larger than 20 MB.</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#080b10',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#10141c',
    borderBottomColor: '#3a2529',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: {
    color: '#fff7ef',
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    alignItems: 'center',
    borderColor: '#774239',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  closeButtonText: {
    color: '#fff7ef',
    fontSize: 14,
    fontWeight: '700',
  },
  viewer: {
    backgroundColor: '#181c24',
    flex: 1,
  },
  pdf: {
    flex: 1,
  },
  statusOverlay: {
    alignItems: 'center',
    backgroundColor: '#080b10',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 24,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  statusText: {
    color: '#d7d9df',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#fff7ef',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
});
