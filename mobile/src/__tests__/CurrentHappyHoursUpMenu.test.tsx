import { fireEvent, render, screen } from '@testing-library/react-native';

import { CurrentHappyHoursUpMenu } from '../components/CurrentHappyHoursUpMenu';
import type { CurrentHappyHourPlace } from '../types';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const place: CurrentHappyHourPlace = {
  slug: 'example-bar',
  location_id: 101,
  name: 'Example Bar',
  city: 'ventura',
  city_label: 'Ventura',
  venue_type_label: 'Bar',
  address_line_1: '123 Main Street',
  address_line_2: '',
  latitude: 34.28,
  longitude: -119.29,
  image_urls: [],
  happy_hours: [{
    deal_id: 201,
    title: 'Afternoon Happy Hour',
    price_text: '$5 wells',
    weekday_label: 'Wednesday',
    start_time: '15:00',
    end_time: '18:00',
    all_day: false,
  }],
};

describe('CurrentHappyHoursUpMenu', () => {
  it('renders nothing when there are no active places', () => {
    render(
      <CurrentHappyHoursUpMenu
        bottomOffset={96}
        expanded={false}
        onSelectPlace={jest.fn()}
        onToggle={jest.fn()}
        places={[]}
        theme="dark"
      />,
    );

    expect(screen.queryByTestId('current-happy-hours-toggle')).toBeNull();
  });

  it('opens the active-place list and selects a business row', () => {
    const onSelectPlace = jest.fn();
    const onToggle = jest.fn();
    const { rerender } = render(
      <CurrentHappyHoursUpMenu
        bottomOffset={96}
        expanded={false}
        onSelectPlace={onSelectPlace}
        onToggle={onToggle}
        places={[place]}
        theme="dark"
      />,
    );

    expect(screen.getByTestId('current-happy-hours-toggle')).toBeTruthy();
    expect(screen.getByTestId('current-happy-hours-menu')).toBeTruthy();
    expect(screen.getByLabelText('1 deal · 1 business nearby. Open list.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('current-happy-hours-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <CurrentHappyHoursUpMenu
        bottomOffset={96}
        expanded
        onSelectPlace={onSelectPlace}
        onToggle={onToggle}
        places={[place]}
        theme="dark"
      />,
    );

    expect(screen.getByTestId('current-happy-hours-menu')).toBeTruthy();
    expect(screen.getByText('Happy Hour Deals and Specials Happening Now')).toBeTruthy();
    expect(screen.getByText('$5 wells Afternoon Happy Hour')).toBeTruthy();
    fireEvent.press(screen.getByTestId('current-happy-hours-row-example-bar:101'));
    expect(onSelectPlace).toHaveBeenCalledWith({ slug: 'example-bar', locationId: 101 });
  });

  it('routes the heart action to the account/favorite handler without selecting the row', () => {
    const onFavoritePlace = jest.fn();
    const onSelectPlace = jest.fn();

    render(
      <CurrentHappyHoursUpMenu
        bottomOffset={96}
        expanded
        onFavoritePlace={onFavoritePlace}
        onSelectPlace={onSelectPlace}
        onToggle={jest.fn()}
        places={[place]}
        theme="dark"
      />,
    );

    fireEvent.press(screen.getByTestId('current-happy-hours-favorite-example-bar:101'));
    expect(onFavoritePlace).toHaveBeenCalledWith({ slug: 'example-bar', locationId: 101 });
    expect(onSelectPlace).not.toHaveBeenCalled();
  });

  it('routes calendar and share actions with the selected current window', () => {
    const onAddToCalendar = jest.fn();
    const onSharePlace = jest.fn();

    render(
      <CurrentHappyHoursUpMenu
        bottomOffset={96}
        expanded
        onAddToCalendar={onAddToCalendar}
        onSelectPlace={jest.fn()}
        onSharePlace={onSharePlace}
        onToggle={jest.fn()}
        places={[place]}
        theme="dark"
      />,
    );

    fireEvent.press(screen.getByTestId('current-happy-hours-calendar-example-bar:101'));
    fireEvent.press(screen.getByTestId('current-happy-hours-share-example-bar:101'));

    expect(onAddToCalendar).toHaveBeenCalledWith(place, place.happy_hours[0]);
    expect(onSharePlace).toHaveBeenCalledWith(place, place.happy_hours[0]);
  });

  it('shows both the total deal count and the number of businesses', () => {
    const threeDealPlace: CurrentHappyHourPlace = {
      ...place,
      happy_hours: [
        ...place.happy_hours,
        {
          deal_id: 202,
          title: 'Late Night Special',
          price_text: '$6 cocktails',
          weekday_label: 'Wednesday',
          start_time: '18:00',
          end_time: '20:00',
          all_day: false,
        },
        {
          deal_id: 203,
          title: 'Dessert Special',
          price_text: '50% off dessert',
          weekday_label: 'Wednesday',
          start_time: '15:00',
          end_time: '21:00',
          all_day: false,
        },
      ],
    };

    render(
      <CurrentHappyHoursUpMenu
        bottomOffset={96}
        expanded={false}
        onSelectPlace={jest.fn()}
        onToggle={jest.fn()}
        places={[threeDealPlace]}
        theme="dark"
      />,
    );

    expect(screen.getAllByText('3 deals · 1 business nearby')).toHaveLength(2);
    expect(screen.getByLabelText('3 deals · 1 business nearby. Open list.')).toBeTruthy();
  });
});
