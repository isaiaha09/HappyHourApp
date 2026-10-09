import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, LayoutAnimation } from 'react-native';

import { DealDescription } from '../components/DealDescription';
import { formatDealDescription, splitTrailingDealPrice } from '../dealDescription';

describe('deal description presentation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('aligns explicit trailing menu prices while leaving complex offers unchanged', () => {
    expect(splitTrailingDealPrice('House Wine $8')).toEqual({ text: 'House Wine', price: '$8' });
    expect(splitTrailingDealPrice('All Draft Beers $1 Off')).toEqual({ text: 'All Draft Beers', price: '$1 Off' });
    expect(splitTrailingDealPrice('Cocktails $5 - $7')).toEqual({ text: 'Cocktails', price: '$5 - $7' });
    expect(splitTrailingDealPrice('Chips & Dips $4 (Chips & Housemade Guacamole + Salsa)')).toBeNull();
    expect(splitTrailingDealPrice('$5 Margaritas')).toBeNull();
    expect(splitTrailingDealPrice('Cocktails $5 or $7')).toBeNull();
  });
  it('splits only explicit separators and recognizes only written weekday prefixes', () => {
    expect(formatDealDescription('Tuesday - $15.98 combo || Wednesday: $19.98 special\r\nTerms: drink included for $1.00')).toEqual([
      { label: 'Tuesday', text: '$15.98 combo' },
      { label: 'Wednesday', text: '$19.98 special' },
      { label: null, text: 'Terms: drink included for $1.00' },
    ]);
    expect(formatDealDescription('Come by on Friday for $5 drinks.')).toEqual([
      { label: null, text: 'Come by on Friday for $5 drinks.' },
    ]);
    expect(formatDealDescription('Tue-Sun - Happy hour || Odd / unstructured offer')).toEqual([
      { label: 'Tue-Sun', text: 'Happy hour' },
      { label: null, text: 'Odd / unstructured offer' },
    ]);
  });

  it('formats every deal independently and reveals every long-detail row', () => {
    const longDays = 'Tuesday - $15.98 combo || Wednesday - $19.98 seafood || Thursday - kids eat free || Friday - $16.98 special';
    render(
      <>
        <DealDescription description="A short happy hour." />
        <DealDescription description={longDays} />
        <DealDescription description={'First offer\nSecond offer\nTerms: ask staff for details'} variant="offer" />
      </>,
    );

    expect(screen.getByText('A short happy hour.')).toBeTruthy();
    expect(screen.getByText('Tuesday')).toBeTruthy();
    expect(screen.getByText('$19.98 seafood')).toBeTruthy();
    expect(screen.queryByText('Friday')).toBeNull();
    expect(screen.getAllByText('Show all details')).toHaveLength(2);

    fireEvent.press(screen.getAllByText('Show all details')[0]);
    expect(screen.getByText('Friday')).toBeTruthy();
    expect(screen.getByText('$16.98 special')).toBeTruthy();
    expect(screen.getByText('Show fewer details')).toBeTruthy();
    expect(screen.queryByText('Terms: ask staff for details')).toBeNull();

    fireEvent.press(screen.getByText('Show all details'));
    expect(screen.getByText('Terms: ask staff for details')).toBeTruthy();
  });

  it.each(['default', 'profile'] as const)('automatically displays structured, sorted menus with complete descriptions in %s presentation', (presentation) => {
    const descriptions = [
      'POTATO SKINS $12 (Six potato wedges topped with melted cheese, bacon, and sauteed onions.)',
      'TAQUITOS $8 (Six mini crispy beef or chicken taquitos, served with sour cream and guacamole.)',
      'CHICKEN WINGS $8 (Six chicken wings served with a side of ranch dressing.)',
    ];
    render(<DealDescription description={descriptions.join(' ')} presentation={presentation} />);
    expect(screen.getByText('TAQUITOS')).toBeTruthy();
    expect(screen.getByText('CHICKEN WINGS')).toBeTruthy();
    expect(screen.getAllByText('$8')).toHaveLength(2);
    expect(screen.queryByText('POTATO SKINS')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Show all details' }));
    expect(screen.getByText('POTATO SKINS')).toBeTruthy();
    expect(screen.getByText('$12')).toBeTruthy();
    expect(screen.getByText('(Six potato wedges topped with melted cheese, bacon, and sauteed onions.)')).toBeTruthy();
    for (const description of descriptions) {
      expect(screen.getByLabelText(description)).toBeTruthy();
    }
  });

  it('offers the existing expand control for one structured item with long details', () => {
    const detail = 'Made fresh to order with a choice of seasonal ingredients. '.repeat(6).trim();
    render(<DealDescription description="" menuItems={[{ name: 'Seasonal plate', price: '$12', detail }]} presentation="profile" />);

    fireEvent.press(screen.getByRole('button', { name: 'Show all details' }));
    expect(screen.getByText('Show fewer details')).toBeTruthy();
    expect(screen.getByText(detail)).toBeTruthy();
  });

  it.each(['default', 'profile'] as const)('uses two columns for selected weekdays and reveals all offers in %s presentation', (presentation) => {
    render(<DealDescription description="" menuItems={[
      { name: 'Tani combo', price: '$15.98', detail: 'Fish tacos and a drink', weekdays: [1] },
      { name: 'Karen combo', price: '$19.98', detail: 'Salmon, shrimp, and a drink', weekdays: [2] },
      { name: 'Kids eat free', price: '', detail: 'With a regular entree', weekdays: [3] },
    ]} presentation={presentation} />);
    expect(screen.getByText('Tuesday')).toBeTruthy();
    expect(screen.getByText('Tani combo $15.98 (Fish tacos and a drink)')).toBeTruthy();
    expect(screen.queryByText('$15.98')).toBeNull();
    expect(screen.queryByText('Thursday')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Show all details' }));
    expect(screen.getByText('Thursday')).toBeTruthy();
    expect(screen.getByText('Kids eat free (With a regular entree)')).toBeTruthy();
    expect(screen.getByText('Karen combo $19.98 (Salmon, shrimp, and a drink)')).toBeTruthy();
  });

  it.each([false, true])('preserves all profile details and respects Reduce Motion = %s', async (reduceMotion) => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
    const configureAnimation = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);

    render(<DealDescription description="Tuesday - $15.98 combo || Wednesday - $19.98 seafood || Thursday - kids eat free || Friday - $16.98 special" presentation="profile" />);
    await act(async () => { await Promise.resolve(); });

    fireEvent.press(screen.getByText('Show all details'));
    expect(screen.getByText('Friday')).toBeTruthy();
    expect(screen.getByText('$16.98 special')).toBeTruthy();
    expect(configureAnimation).toHaveBeenCalledTimes(reduceMotion ? 0 : 1);

    fireEvent.press(screen.getByText('Show fewer details'));
    expect(screen.queryByText('Friday')).toBeNull();
    expect(configureAnimation).toHaveBeenCalledTimes(reduceMotion ? 0 : 2);
  });
});
