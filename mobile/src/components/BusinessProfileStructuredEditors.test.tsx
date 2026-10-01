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
    fireEvent.press(screen.getByText('Import photo from library'));

    await waitFor(() => expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith({
      allowsMultipleSelection: false,
      mediaTypes: ['images'],
    }));
  });
});
