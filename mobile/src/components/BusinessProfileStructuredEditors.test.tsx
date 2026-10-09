import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockGetDocumentAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();

jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { BusinessDealsEditor } from './BusinessProfileStructuredEditors';
import type { BusinessDealOverride } from '../types';

const baseDeal: BusinessDealOverride = {
  id: 'deal-1',
  title: 'Happy hour',
  description: '',
  deal_type: 'happy_hour',
  price_text: '',
  terms: '',
  happy_hours: [],
};

describe('BusinessDealsEditor attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the same automatically formatted details in every business preview', () => {
    render(
      <BusinessDealsEditor
        label="Deals"
        onChange={jest.fn()}
        supportText="Edit deals."
        value={[
          { ...baseDeal, description: 'Short description.' },
          { ...baseDeal, id: 'deal-2', title: 'Combos', description: 'Tuesday - $15 combo || Wednesday - $19 combo || Thursday - $21 combo' },
        ]}
      />,
    );

    expect(screen.getByText('Short description.')).toBeTruthy();
    expect(screen.getByText('$15 combo')).toBeTruthy();
    expect(screen.queryByText('$21 combo')).toBeNull();
    fireEvent.press(screen.getByText('Show all details'));
    expect(screen.getByText('$21 combo')).toBeTruthy();
  });

  it('lets an owner add a menu item and previews its formatted name, price, and detail', () => {
    function StatefulDealsEditor() {
      const [deals, setDeals] = React.useState([baseDeal]);
      return <BusinessDealsEditor label="Deals" onChange={setDeals} supportText="Edit deals." value={deals} />;
    }

    render(<StatefulDealsEditor />);
    fireEvent.press(screen.getByRole('button', { name: 'Add menu item' }));
    fireEvent.changeText(screen.getByLabelText('Menu item 1 name'), 'House margarita');
    fireEvent.changeText(screen.getByLabelText('Menu item 1 price'), '$8');
    fireEvent.changeText(screen.getByLabelText('Menu item 1 details'), 'Fresh lime and agave');

    expect(screen.getByText('House margarita')).toBeTruthy();
    expect(screen.getByText('$8')).toBeTruthy();
    expect(screen.getByText('Fresh lime and agave')).toBeTruthy();
  });

  it('lets an owner enter a description price separately and previews it beside the note', () => {
    function StatefulDealsEditor() {
      const [deals, setDeals] = React.useState([{ ...baseDeal, description: 'Sample of the description of the deal' }]);
      return <BusinessDealsEditor label="Deals" onChange={setDeals} supportText="Edit deals." value={deals} />;
    }

    render(<StatefulDealsEditor />);
    fireEvent.changeText(screen.getByLabelText('Price for this offer (optional)'), '$2');

    expect(screen.getByText('Sample of the description of the deal')).toBeTruthy();
    expect(screen.getByText('$2')).toBeTruthy();
  });

  it('lets owners and claimants choose weekday or price layout per item without losing entered content', () => {
    const item = { id: 'tani', name: 'Tani combo', price: '$15.98', detail: 'Fish tacos and a drink' };
    const onChange = jest.fn();
    function StatefulDealsEditor() {
      const [deals, setDeals] = React.useState<BusinessDealOverride[]>([{ ...baseDeal, menu_items: [item] }]);
      return <BusinessDealsEditor label="Deals" onChange={(next) => { onChange(next); setDeals(next); }} supportText="Edit deals." value={deals} />;
    }

    render(<StatefulDealsEditor />);
    expect(screen.getByText('$15.98')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Menu item 1 weekday label' }));
    expect(screen.getByRole('button', { name: 'Menu item 1 Tue' }).props.accessibilityState.selected).toBe(false);
    expect(screen.queryByText('Monday')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Menu item 1 Tue' }));
    expect(screen.getByText('Tuesday')).toBeTruthy();
    expect(screen.getByText('Tani combo $15.98 (Fish tacos and a drink)')).toBeTruthy();
    expect(screen.queryByText('$15.98')).toBeNull();
    expect(screen.getByLabelText('Menu item 1 price').props.value).toBe('$15.98');
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0][0].menu_items[0]).toEqual({ ...item, weekdays: [1] });

    fireEvent.press(screen.getByRole('button', { name: 'Menu item 1 Wed' }));
    expect(screen.getByText('Tue, Wed')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Menu item 1 price column' }));
    expect(screen.queryByText('Tue, Wed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu item 1 Tue' })).toBeNull();
    expect(screen.getByText('$15.98')).toBeTruthy();
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0][0].menu_items[0]).toEqual(item);
    fireEvent.press(screen.getByRole('button', { name: 'Menu item 1 price column' }));
    fireEvent.press(screen.getByRole('button', { name: 'Menu item 1 weekday label' }));
    expect(screen.getByText('Tue, Wed')).toBeTruthy();
    expect(screen.getByLabelText('Menu item 1 details').props.value).toBe(item.detail);
  });

  it('opens saved weekday choices without changing ordinary items or overall availability', () => {
    const onChange = jest.fn();
    render(<BusinessDealsEditor label="Deals" onChange={onChange} supportText="Edit deals." value={[{
      ...baseDeal,
      menu_items: [
        { id: 'daily', name: 'Kids eat free', price: '', detail: 'With a regular entree', weekdays: [3] },
        { id: 'wine', name: 'House wine', price: '$8', detail: '' },
      ],
      happy_hours: [{ weekday: 1, weekdays: [1, 2, 3, 4, 5, 6], start_time: '', end_time: '', all_day: true }],
    }]} />);
    expect(screen.getByRole('button', { name: 'Menu item 1 weekday label' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'Menu item 1 Thu' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'Menu item 2 price column' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Thursday')).toBeTruthy();
    expect(screen.getByText('House wine')).toBeTruthy();
    expect(screen.getByText('$8')).toBeTruthy();
    expect(screen.getByText('TUE-SUN')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves existing headline pricing and general notes when collapsed while adding menu items', () => {
    const existingDeal = {
      ...baseDeal,
      price_text: '$4–$7',
      description: 'Available at the bar. Original wording stays intact.',
      description_price: '$5',
      terms: 'Dine-in only',
      happy_hours: [{ id: 'window-1', weekday: 0, weekdays: [0, 1], start_time: '3:00 PM', end_time: '6:00 PM', all_day: false }],
    };
    const onChange = jest.fn();
    function StatefulDealsEditor() {
      const [deals, setDeals] = React.useState<BusinessDealOverride[]>([existingDeal]);
      return <BusinessDealsEditor label="Deals" onChange={(next) => { onChange(next); setDeals(next); }} supportText="Edit deals." value={deals} />;
    }

    render(<StatefulDealsEditor />);
    expect(screen.getByLabelText('Headline price or savings').props.value).toBe('$4–$7');
    expect(screen.getByLabelText('Overall offer or note').props.value).toBe(existingDeal.description);
    fireEvent.press(screen.getByRole('button', { name: 'Price label beside the deal title' }));
    fireEvent.press(screen.getByRole('button', { name: 'Single offer or general note' }));
    expect(screen.queryByLabelText('Overall offer or note')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Add menu item' }));
    fireEvent.changeText(screen.getByLabelText('Menu item 1 name'), 'House wine');
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0][0]).toEqual({
      ...existingDeal,
      menu_items: [expect.objectContaining({ name: 'House wine' })],
    });
    fireEvent.press(screen.getByRole('button', { name: 'Single offer or general note' }));
    expect(screen.getByLabelText('Overall offer or note').props.value).toBe(existingDeal.description);
    expect(screen.getByLabelText('Price for this offer (optional)').props.value).toBe('$5');
  });

  it('shows the selected PDF size limit and rejects an oversized PDF before upload', async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{
        mimeType: 'application/pdf',
        name: 'large-menu.pdf',
        size: 11 * 1024 * 1024,
        uri: 'file:///large-menu.pdf',
      }],
    });
    const onChange = jest.fn();

    render(<BusinessDealsEditor label="Deals" onChange={onChange} supportText="Edit deals." value={[baseDeal]} />);
    fireEvent.press(screen.getByText('Import PDF'));

    await waitFor(() => expect(screen.getByText('This PDF is 11 MB. Deal PDFs must be 10 MB or smaller.')).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses the iOS native photo picker path without the slower in-picker crop mode', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: true,
      assets: [],
    });

    render(<BusinessDealsEditor label="Deals" onChange={jest.fn()} supportText="Edit deals." value={[baseDeal]} />);
    expect(screen.getByLabelText('Deal title').props.keyboardAppearance).toBe('dark');
    fireEvent.press(screen.getByText('Import photo from library'));

    await waitFor(() => expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith({
      allowsMultipleSelection: false,
      mediaTypes: ['images'],
    }));
  });
});
