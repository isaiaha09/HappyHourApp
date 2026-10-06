import { fireEvent, render, screen } from '@testing-library/react-native';

import { DealDescription } from '../components/DealDescription';
import { formatDealDescription } from '../dealDescription';

describe('deal description presentation', () => {
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
});
