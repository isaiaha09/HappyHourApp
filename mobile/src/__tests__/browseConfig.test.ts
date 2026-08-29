import {
  getVenueFilterValueFromLabel,
  getVenueMarkerStyle,
  getVenuePlaceholderColor,
} from '../browseConfig';

describe('venue category colors', () => {
  it.each([
    ['Restaurant', 'restaurant'],
    ['Bar', 'bar'],
    ['Fast Food', 'fast_food'],
    ['Mobile Vendor', 'mobile'],
    ['Cafe', 'cafe'],
    ['Coffee Shop', 'cafe'],
    ['Shop', 'shop'],
    ['Attraction', 'attraction'],
    ['Unknown', 'other'],
    ['', 'other'],
  ])('normalizes %s to %s', (label, expectedValue) => {
    expect(getVenueFilterValueFromLabel(label)).toBe(expectedValue);
  });

  it.each([
    ['Restaurant', '#ffa990'],
    ['Bar', '#ff95b3'],
    ['Fast Food', '#ff9c87'],
    ['Mobile Vendor', '#ffcd7e'],
    ['Cafe', '#ffb98b'],
    ['Shop', '#ffa7cd'],
    ['Attraction', '#bea0ff'],
    ['Other', '#ffb6a2'],
  ])('softens the %s marker color to %s', (label, expectedColor) => {
    const venueValue = getVenueFilterValueFromLabel(label);
    const sourceColor = getVenueMarkerStyle(venueValue).fill;

    expect(getVenuePlaceholderColor(label)).toBe(expectedColor);
    expect(getVenuePlaceholderColor(label)).not.toBe(sourceColor);
  });

  it('uses the Other color for blank and unknown labels', () => {
    expect(getVenuePlaceholderColor('')).toBe(getVenuePlaceholderColor('Other'));
    expect(getVenuePlaceholderColor('Uncategorized')).toBe(getVenuePlaceholderColor('Other'));
  });
});
