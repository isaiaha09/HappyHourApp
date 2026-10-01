import { fetchPlaceDetail, fetchProfileDashboard } from '../api';

const mediaPath = '/managed-media/123e4567-e89b-42d3-a456-426614174000/';
const apiBaseUrl = 'http://192.168.1.23:8000/api';

describe('managed media API URLs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves managed image and deal attachment paths against the API host in place details', async () => {
    const payload = {
      image_urls: [mediaPath],
      deals: [{ attachment: { url: mediaPath } }],
      locations: [{ image_urls: [mediaPath] }],
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => payload,
      ok: true,
    } as Response);

    const result = await fetchPlaceDetail(apiBaseUrl, 'sample-business');

    expect(result.image_urls).toEqual([`http://192.168.1.23:8000${mediaPath}`]);
    expect(result.deals[0].attachment?.url).toBe(`http://192.168.1.23:8000${mediaPath}`);
    expect(result.locations[0].image_urls).toEqual([`http://192.168.1.23:8000${mediaPath}`]);
  });

  it('resolves profile photo references returned in the business dashboard payload', async () => {
    const payload = {
      business_contact: {
        photo_references: [mediaPath],
      },
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => payload,
      ok: true,
    } as Response);

    const result = await fetchProfileDashboard(apiBaseUrl, 'test-token', 'business');

    expect(result.business_contact?.photo_references).toEqual([`http://192.168.1.23:8000${mediaPath}`]);
  });
});
