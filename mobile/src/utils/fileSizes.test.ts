import { formatFileSize, getDealPdfSizeDetail, MAX_DEAL_PDF_UPLOAD_BYTES } from './fileSizes';

describe('file size labels', () => {
  it('formats the selected PDF size and states the current upload cap', () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(getDealPdfSizeDetail(2.5 * 1024 * 1024)).toBe('PDF · 2.5 MB · 10 MB max');
    expect(MAX_DEAL_PDF_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('uses a clear fallback when the picker does not report a size', () => {
    expect(getDealPdfSizeDetail(null)).toBe('PDF · Size unavailable · 10 MB max');
  });
});
