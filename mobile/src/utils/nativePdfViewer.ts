import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

const MAX_NATIVE_PDF_BYTES = 20 * 1024 * 1024;
const ANDROID_TEMP_FILE_RETENTION_MS = 5 * 60 * 1000;

function safeFileStem(fileName: string) {
  const stem = String(fileName || 'document')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return stem || 'document';
}

async function prepareLocalPdf(uri: string, fileName: string) {
  const normalizedUri = String(uri || '').trim();
  if (!normalizedUri) {
    throw new Error('The PDF location is missing.');
  }

  if (normalizedUri.startsWith('file://') || normalizedUri.startsWith('content://')) {
    return { uri: normalizedUri, removeAfterOpen: false };
  }

  if (!/^https:\/\//i.test(normalizedUri)) {
    throw new Error('Only HTTPS PDF links can be opened.');
  }

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('Temporary document storage is unavailable.');
  }

  const destination = `${cacheDirectory}diningdealz-pdf-${Date.now()}-${safeFileStem(fileName)}.pdf`;
  const downloaded = await FileSystem.downloadAsync(normalizedUri, destination);
  const fileInfo = await FileSystem.getInfoAsync(downloaded.uri);
  if (!fileInfo.exists || (typeof fileInfo.size === 'number' && fileInfo.size > MAX_NATIVE_PDF_BYTES)) {
    await FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => undefined);
    throw new Error('This PDF is too large to open on the device.');
  }
  return { uri: downloaded.uri, removeAfterOpen: true };
}

export async function openPdfInNativeViewer(uri: string, fileName = 'Document.pdf') {
  const localFile = await prepareLocalPdf(uri, fileName);
  try {
    if (Platform.OS === 'android') {
      const contentUri = localFile.uri.startsWith('content://')
        ? localFile.uri
        : await FileSystem.getContentUriAsync(localFile.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,
        type: 'application/pdf',
      });
      return;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localFile.uri, {
        dialogTitle: `Open ${fileName || 'PDF document'}`,
        mimeType: 'application/pdf',
      });
      return;
    }

    if (await Linking.canOpenURL(localFile.uri)) {
      await Linking.openURL(localFile.uri);
      return;
    }
    throw new Error('No native PDF viewer is available on this device.');
  } finally {
    if (localFile.removeAfterOpen) {
      if (Platform.OS === 'android') {
        setTimeout(() => {
          void FileSystem.deleteAsync(localFile.uri, { idempotent: true }).catch(() => undefined);
        }, ANDROID_TEMP_FILE_RETENTION_MS);
      } else {
        await FileSystem.deleteAsync(localFile.uri, { idempotent: true }).catch(() => undefined);
      }
    }
  }
}
