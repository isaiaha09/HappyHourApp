import { updateProfileDashboardWithUploads } from '../api';

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    bytes: async () => Uint8Array.from([1, 2, 3]),
    name: uri.split('/').pop() ?? 'upload',
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

  afterEach(() => {
    global.FormData = originalFormData;
    jest.restoreAllMocks();
  });

  it('builds a byte-backed Expo multipart part for deal attachments', async () => {
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
});
