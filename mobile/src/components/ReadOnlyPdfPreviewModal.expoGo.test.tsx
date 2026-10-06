import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'storeClient' },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));

jest.mock('@kishannareshpal/expo-pdf', () => {
  throw new Error('The native PDF package must not load in Expo Go.');
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../utils/nativePdfViewer', () => ({
  preparePdfForPreview: jest.fn(),
}));

import { ReadOnlyPdfPreviewModal } from './ReadOnlyPdfPreviewModal';
import { preparePdfForPreview } from '../utils/nativePdfViewer';

it('loads in Expo Go without importing KJExpoPdf and explains the PDF limitation', () => {
  const onClose = jest.fn();
  render(
    <ReadOnlyPdfPreviewModal
      fileName="Menu.pdf"
      onClose={onClose}
      uri="https://cdn.example.test/menu.pdf"
      visible
    />,
  );

  expect(screen.getByText('PDF preview unavailable')).toBeTruthy();
  expect(screen.getByText(/Expo Go does not include the PDF viewer/)).toBeTruthy();
  expect(preparePdfForPreview).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Close PDF preview' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
