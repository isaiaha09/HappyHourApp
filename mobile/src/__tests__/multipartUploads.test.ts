import { updateProfileDashboardWithUploads } from '../api';

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    bytes: async () => Uint8Array.from([1, 2, 3]),
    exists: true,
    name: uri.split('/').pop() ?? 'upload',
    size: 3,
    type: uri.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
  })),
}));

class CapturingFormData {
  parts: Array<[string, unknown]> = [];

  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}

describe('multipart local file uploads', () => {
  const originalFormData = global.FormData;
  const originalUseReactNativeFetch = process.env.EXPO_PUBLIC_USE_RN_FETCH;

  afterEach(() => {
    global.FormData = originalFormData;
    if (originalUseReactNativeFetch === undefined) {
      delete process.env.EXPO_PUBLIC_USE_RN_FETCH;
    } else {
      process.env.EXPO_PUBLIC_USE_RN_FETCH = originalUseReactNativeFetch;
    }
    jest.restoreAllMocks();
  });

  it('builds a byte-backed Expo multipart part for deal attachments', async () => {
    delete process.env.EXPO_PUBLIC_USE_RN_FETCH;
    global.FormData = CapturingFormData as unknown as typeof FormData;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({}),
      ok: true,
    } as Response);

    await updateProfileDashboardWithUploads(
      'https://api.example.com',
      'profile-token',
      {
        deal_overrides: [{
          attachment_upload: {
            mimeType: 'application/pdf',
            name: 'menu.pdf',
            size: 3,
            uri: 'file:///cache/menu.pdf',
          },
        }],
      } as any,
      [],
    );

    const body = fetchMock.mock.calls[0]?.[1]?.body as unknown as CapturingFormData;
    const filePart = body.parts.find(([name]) => name === 'deal_attachment_upload_0')?.[1] as {
      bytes?: () => Promise<Uint8Array>;
      name?: string;
      type?: string;
      uri?: string;
    };

    expect(filePart).toEqual(expect.objectContaining({ name: 'menu.pdf', type: 'application/pdf' }));
    expect(filePart.uri).toBeUndefined();
    expect(Array.from(await filePart.bytes?.() ?? [])).toEqual([1, 2, 3]);
  });

  it('uses URI-backed parts when the app is configured for React Native fetch', async () => {
    process.env.EXPO_PUBLIC_USE_RN_FETCH = '1';
    global.FormData = CapturingFormData as unknown as typeof FormData;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({}),
      ok: true,
    } as Response);

    await updateProfileDashboardWithUploads(
      'https://api.example.com',
      'profile-token',
      {
        deal_overrides: [
          {
            attachment_upload: {
              mimeType: 'image/jpeg',
              name: 'happy-hour.jpg',
              size: 3,
              uri: 'file:///cache/happy-hour.jpg',
            },
          },
          {
            attachment_upload: {
              mimeType: 'application/pdf',
              name: 'menu.pdf',
              size: 3,
              uri: 'file:///cache/menu.pdf',
            },
          },
        ],
      } as any,
      [],
    );

    const body = fetchMock.mock.calls[0]?.[1]?.body as unknown as CapturingFormData;
    expect(body.parts).toContainEqual(['deal_attachment_upload_0', {
      uri: 'file:///cache/happy-hour.jpg',
      name: 'happy-hour.jpg',
      type: 'image/jpeg',
    }]);
    expect(body.parts).toContainEqual(['deal_attachment_upload_1', {
      uri: 'file:///cache/menu.pdf',
      name: 'menu.pdf',
      type: 'application/pdf',
    }]);
  });
});
