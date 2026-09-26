jest.mock('../utils/nativePdfViewer', () => ({
  preparePdfForPreview: jest.fn(),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ReadOnlyPdfPreviewModal } from './ReadOnlyPdfPreviewModal';
import { preparePdfForPreview } from '../utils/nativePdfViewer';

const mockPreparePdfForPreview = preparePdfForPreview as jest.MockedFunction<typeof preparePdfForPreview>;

describe('ReadOnlyPdfPreviewModal', () => {
  it('renders the PDF in-app with only a close action and cleans up its temporary file', async () => {
    const cleanup = jest.fn(async () => undefined);
    mockPreparePdfForPreview.mockResolvedValue({
      uri: 'file:///private/cache/preview.pdf',
      cleanup,
    });
    const onClose = jest.fn();
    const initialProps = {
      fileName: 'Happy Hour.pdf',
      onClose,
      uri: 'https://cdn.example.test/happy-hour.pdf',
      visible: true,
    };
    const view = render(<ReadOnlyPdfPreviewModal {...initialProps} />);

    await waitFor(() => expect(screen.getByTestId('readonly-pdf-view')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Close PDF preview' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/download|save|share/i)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Close PDF preview' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    view.rerender(<ReadOnlyPdfPreviewModal {...initialProps} uri={null} visible={false} />);
    await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
  });
});
