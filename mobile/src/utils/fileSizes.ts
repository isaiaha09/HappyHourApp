export const MAX_DEAL_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

export function formatFileSize(size: number | null | undefined) {
  if (size === null || size === undefined || !Number.isFinite(size) || size < 0) {
    return 'Size unavailable';
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  }
  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${Math.round(size)} B`;
}

export function getDealPdfSizeDetail(size: number | null | undefined) {
  return `PDF · ${formatFileSize(size)} · ${MAX_DEAL_PDF_UPLOAD_BYTES / (1024 * 1024)} MB max`;
}
