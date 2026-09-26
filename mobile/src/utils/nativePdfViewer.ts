import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';

export const MAX_NATIVE_PDF_BYTES = 20 * 1024 * 1024;

export type PreparedPdfPreview = {
  uri: string;
  cleanup: () => Promise<void>;
};

function isLocalFileUri(uri: string) {
  return uri.startsWith('file://') || uri.startsWith('content://');
}

function temporaryPdfName() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `diningdealz-pdf-preview-${Date.now()}-${randomPart}.pdf`;
}

function createTooLargeError() {
  return new Error('This PDF is too large to preview on the device.');
}

/**
 * Prepare a PDF for the in-app, view-only native renderer.
 * Remote PDFs are streamed into the private app cache and aborted as soon as
 * their decoded body exceeds the cap. The returned cleanup removes that cache
 * file when the preview closes.
 */
export async function preparePdfForPreview(
  uri: string,
  signal?: AbortSignal,
): Promise<PreparedPdfPreview> {
  const normalizedUri = String(uri || '').trim();
  if (!normalizedUri) {
    throw new Error('The PDF location is missing.');
  }

  if (isLocalFileUri(normalizedUri)) {
    const localFile = new File(normalizedUri);
    if (localFile.size > MAX_NATIVE_PDF_BYTES) {
      throw createTooLargeError();
    }
    return { uri: normalizedUri, cleanup: async () => undefined };
  }

  if (!/^https:\/\//i.test(normalizedUri)) {
    throw new Error('Only HTTPS PDF links can be opened.');
  }
  if (signal?.aborted) {
    throw new Error('PDF preview was cancelled.');
  }

  const response = await fetch(normalizedUri, {
    headers: { Accept: 'application/pdf' },
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('This PDF could not be retrieved.');
  }

  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_NATIVE_PDF_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw createTooLargeError();
  }
  if (!response.body) {
    throw new Error('This PDF could not be retrieved.');
  }

  const temporaryFile = new File(Paths.cache, temporaryPdfName());
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let completed = false;

  try {
    temporaryFile.create();
    reader = response.body.getReader();
    writer = temporaryFile.writableStream().getWriter();
    let receivedBytes = 0;

    while (true) {
      if (signal?.aborted) {
        throw new Error('PDF preview was cancelled.');
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_NATIVE_PDF_BYTES) {
        throw createTooLargeError();
      }
      await writer.write(value);
    }

    if (receivedBytes === 0) {
      throw new Error('This PDF is empty.');
    }

    await writer.close();
    completed = true;
    return {
      uri: temporaryFile.uri,
      cleanup: async () => {
        if (temporaryFile.exists) {
          temporaryFile.delete();
        }
      },
    };
  } catch (error) {
    await reader?.cancel().catch(() => undefined);
    await writer?.abort(error).catch(() => undefined);
    throw error;
  } finally {
    reader?.releaseLock();
    if (!completed && temporaryFile.exists) {
      temporaryFile.delete();
    }
  }
}
