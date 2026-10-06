import { useEffect, useMemo, useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { preparePdfForPreview, type PreparedPdfPreview } from '../utils/nativePdfViewer';

type ReadOnlyPdfPreviewModalProps = {
  fileName: string;
  onClose: () => void;
  uri: string | null;
  visible: boolean;
};

type NativePdfView = typeof import('@kishannareshpal/expo-pdf').PdfView;

function loadNativePdfView(): NativePdfView | null {
  // Importing the package itself requires KJExpoPdf, even if <PdfView /> is not
  // rendered. Expo Go cannot contain this custom native module.
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return null;
  }

  try {
    return (require('@kishannareshpal/expo-pdf') as typeof import('@kishannareshpal/expo-pdf')).PdfView;
  } catch (error) {
    if (error instanceof Error && /Cannot find native (?:module|view) ['"]KJExpoPdf['"]/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export function ReadOnlyPdfPreviewModal({ fileName, onClose, uri, visible }: ReadOnlyPdfPreviewModalProps) {
  const [preparedPreview, setPreparedPreview] = useState<{
    sourceUri: string;
    preview: PreparedPdfPreview;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const insets = useSafeAreaInsets();
  const NativePdfView = useMemo(() => visible ? loadNativePdfView() : null, [visible]);

  useEffect(() => {
    if (!visible || !uri || !NativePdfView) {
      return undefined;
    }

    let cancelled = false;
    let prepared: PreparedPdfPreview | null = null;
    const abortController = new AbortController();
    setPreparedPreview(null);
    setHasError(false);
    setErrorMessage('');
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
      .catch((error: unknown) => {
        if (!cancelled) {
          setHasError(true);
          const message = error instanceof Error ? error.message : '';
          if (/too large/i.test(message)) {
            setErrorMessage('This PDF exceeds the 20 MB in-app preview limit.');
          } else if (/only https/i.test(message)) {
            setErrorMessage('Only HTTPS PDF links can be previewed outside local development.');
          } else {
            setErrorMessage('Could not load this PDF. Check your connection and that the file is valid.');
          }
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
  }, [NativePdfView, uri, visible]);

  const onPdfLoaded = () => setIsLoading(false);
  const onPdfError = () => {
    setIsLoading(false);
    setHasError(true);
    setErrorMessage('The PDF loaded, but this device could not render it. It may be invalid or unsupported.');
  };
  const currentPreview = preparedPreview?.sourceUri === uri ? preparedPreview.preview : null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={styles.screen}>
        <View testID="pdf-preview-header" style={[styles.header, { paddingTop: Math.max(insets.top + 8, 18) }]}>
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
          {visible && currentPreview && !hasError && NativePdfView ? (
            <NativePdfView
              fitMode="width"
              onError={onPdfError}
              onLoadComplete={onPdfLoaded}
              style={styles.pdf}
              uri={currentPreview.uri}
            />
          ) : null}
          {visible && !NativePdfView ? (
            <View style={styles.statusOverlay}>
              <Text style={styles.errorTitle}>PDF preview unavailable</Text>
              <Text style={styles.statusText}>
                {Constants.executionEnvironment === ExecutionEnvironment.StoreClient
                  ? 'Expo Go does not include the PDF viewer. Open DiningDealz in a development build to preview PDFs.'
                  : 'This app build does not include the PDF viewer.'}
              </Text>
            </View>
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
              <Text style={styles.statusText}>{errorMessage}</Text>
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
