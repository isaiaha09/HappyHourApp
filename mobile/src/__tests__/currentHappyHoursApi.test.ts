import { fetchCurrentHappyHourPlaces } from '../api';

describe('fetchCurrentHappyHourPlaces', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests the public current-hours endpoint with the selected city', async () => {
    const payload = { observed_at: '2026-08-26T15:00:00-07:00', places: [] };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => payload,
      ok: true,
    } as Response);

    await expect(fetchCurrentHappyHourPlaces('http://localhost:8000/api', 'ventura')).resolves.toEqual(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/places/current-happy-hours/?city=ventura',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
        signal: expect.anything(),
      }),
    );
  });
});
