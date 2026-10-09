import {
  formatFileSize,
  getBusinessPhotoSizeError,
  getDealPdfSizeDetail,
  MAX_BUSINESS_PHOTO_UPLOAD_BYTES,
  MAX_DEAL_PDF_UPLOAD_BYTES,
} from './fileSizes';

describe('file size labels', () => {
  it('formats the selected PDF size and states the current upload cap', () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(getDealPdfSizeDetail(2.5 * 1024 * 1024)).toBe('PDF · 2.5 MB · 10 MB max');
    expect(MAX_DEAL_PDF_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('uses a clear fallback when the picker does not report a size', () => {
    expect(getDealPdfSizeDetail(null)).toBe('PDF · Size unavailable · 10 MB max');
  });

  it('explains when a selected business photo exceeds the per-photo upload limit', () => {
    expect(MAX_BUSINESS_PHOTO_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
    expect(getBusinessPhotoSizeError(8.3 * 1024 * 1024)).toBe(
      'Selected photo is 8.3 MB. Business photos must be 8 MB or smaller. Choose a smaller photo.',
    );
    expect(getBusinessPhotoSizeError(MAX_BUSINESS_PHOTO_UPLOAD_BYTES)).toBeNull();
    expect(getBusinessPhotoSizeError(null)).toBeNull();
  });

  it('keeps enough precision to distinguish a just-over-limit photo from 8 MB', () => {
    expect(formatFileSize(8.01 * 1024 * 1024)).toBe('8.01 MB');
  });
});
