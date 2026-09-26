jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

jest.mock('expo-file-system', () => {
  class MockFile {
    static instances: MockFile[] = [];
    uri: string;
    exists = true;
    size: number;
    deleted = false;
    writtenBytes = 0;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
      this.size = this.uri.startsWith('file://') ? 123 : 0;
      MockFile.instances.push(this);
    }

    create() {
      this.exists = true;
    }

    writableStream() {
      return {
        getWriter: () => ({
          write: async (chunk: Uint8Array) => {
            this.writtenBytes += chunk.byteLength;
          },
          close: async () => undefined,
          abort: async () => undefined,
        }),
      };
    }

    delete() {
      this.deleted = true;
      this.exists = false;
    }
  }

  return {
    File: MockFile,
    Paths: { cache: { uri: 'file:///private/cache' } },
  };
});

import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { MAX_NATIVE_PDF_BYTES, preparePdfForPreview } from './nativePdfViewer';

const mockFetch = fetch as unknown as jest.Mock;
const MockFileConstructor = File as unknown as typeof File & { instances: Array<any> };

function createReadableBody(chunks: Uint8Array[]) {
  let index = 0;
  const cancel = jest.fn(async () => undefined);
  const releaseLock = jest.fn();
  const read = jest.fn(async () => {
    if (index >= chunks.length) {
      return { done: true as const, value: undefined };
    }
    const value = chunks[index];
    index += 1;
    return { done: false as const, value };
  });
  return {
    body: {
      cancel,
      getReader: () => ({ cancel, read, releaseLock }),
    },
    cancel,
  };
}

describe('preparePdfForPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockFileConstructor.instances = [];
  });

  it('streams a valid HTTPS preview into private cache and deletes it on close', async () => {
    const chunk = new Uint8Array([37, 80, 68, 70]);
    const readable = createReadableBody([chunk]);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => String(chunk.byteLength) },
      body: readable.body,
    } as unknown as Response);

    const preview = await preparePdfForPreview('https://cdn.example.test/menu.pdf');
    const cachedFile = MockFileConstructor.instances[0];

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cachedFile.writtenBytes).toBe(chunk.byteLength);
    expect(preview.uri).toContain('diningdealz-pdf-preview-');
    expect(cachedFile.deleted).toBe(false);

    await preview.cleanup();
    expect(cachedFile.deleted).toBe(true);
  });

  it('cancels an oversized stream at the first chunk that crosses the cap and deletes partial cache data', async () => {
    const readable = createReadableBody([
      new Uint8Array(MAX_NATIVE_PDF_BYTES),
      new Uint8Array(1),
    ]);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      body: readable.body,
    } as unknown as Response);

    await expect(preparePdfForPreview('https://cdn.example.test/oversized.pdf'))
      .rejects.toThrow('too large');

    const partialFile = MockFileConstructor.instances[0];
    expect(partialFile.writtenBytes).toBe(MAX_NATIVE_PDF_BYTES);
    expect(readable.cancel).toHaveBeenCalled();
    expect(partialFile.deleted).toBe(true);
  });

  it('rejects a declared oversized response before writing a cache file', async () => {
    const readable = createReadableBody([]);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => String(MAX_NATIVE_PDF_BYTES + 1) },
      body: readable.body,
    } as unknown as Response);

    await expect(preparePdfForPreview('https://cdn.example.test/oversized.pdf'))
      .rejects.toThrow('too large');

    expect(readable.cancel).toHaveBeenCalled();
    expect(MockFileConstructor.instances).toHaveLength(0);
  });

  it('opens an existing local PDF without fetching or deleting the source file', async () => {
    const preview = await preparePdfForPreview('file:///private/app/cache/test.pdf');

    expect(preview.uri).toBe('file:///private/app/cache/test.pdf');
    expect(mockFetch).not.toHaveBeenCalled();
    await preview.cleanup();
    expect(MockFileConstructor.instances[0].deleted).toBe(false);
  });

  it('continues to reject non-HTTPS remote links', async () => {
    await expect(preparePdfForPreview('http://cdn.example.test/menu.pdf'))
      .rejects.toThrow('HTTPS');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
