import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ProfilePhotoGallery } from '../components/ProfilePhotoGallery';

describe('profile photo paging', () => {
  it('keeps the counter and opened photo in sync after paging, resizing, and photo changes', () => {
    const onOpenPhoto = jest.fn();
    const { rerender } = render(<ProfilePhotoGallery imageUrls={['https://example.com/first.jpg', 'https://example.com/second.jpg', 'https://example.com/third.jpg']} onOpenPhoto={onOpenPhoto} />);

    const gallery = screen.getByTestId('profile-photo-gallery');
    fireEvent(gallery, 'layout', { nativeEvent: { layout: { width: 200 } } });
    fireEvent(gallery, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 200 } } });
    expect(screen.getByLabelText('Photo 2 of 3')).toBeTruthy();

    fireEvent(gallery, 'layout', { nativeEvent: { layout: { width: 280 } } });
    fireEvent(gallery, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 280 } } });
    expect(screen.getByLabelText('Photo 2 of 3')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Open business photo 2 of 3' }));
    expect(onOpenPhoto).toHaveBeenCalledWith(1);

    fireEvent(gallery, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 560 } } });
    expect(screen.getByLabelText('Photo 3 of 3')).toBeTruthy();
    rerender(<ProfilePhotoGallery imageUrls={['https://example.com/first.jpg', 'https://example.com/second.jpg']} onOpenPhoto={onOpenPhoto} />);
    expect(screen.getByLabelText('Photo 2 of 2')).toBeTruthy();
  });

  it('tracks horizontal web scrolling where native momentum events are unavailable', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      render(<ProfilePhotoGallery imageUrls={['https://example.com/first.jpg', 'https://example.com/second.jpg']} onOpenPhoto={jest.fn()} />);
      const gallery = screen.getByTestId('profile-photo-gallery');
      fireEvent(gallery, 'layout', { nativeEvent: { layout: { width: 200 } } });
      fireEvent.scroll(gallery, { nativeEvent: { contentOffset: { x: 200, y: 0 } } });
      expect(screen.getByLabelText('Photo 2 of 2')).toBeTruthy();
    } finally {
      platform.restore();
    }
  });
});
