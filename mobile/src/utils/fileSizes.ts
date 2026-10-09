export const MAX_DEAL_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_BUSINESS_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;

export function formatFileSize(size: number | null | undefined) {
  if (size === null || size === undefined || !Number.isFinite(size) || size < 0) {
    return 'Size unavailable';
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2).replace(/\.?0+$/, '')} MB`;
  }
  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${Math.round(size)} B`;
}

export function getBusinessPhotoSizeError(size: number | null | undefined) {
  if (size === null || size === undefined || !Number.isFinite(size) || size <= MAX_BUSINESS_PHOTO_UPLOAD_BYTES) {
    return null;
  }

  const maxMegabytes = MAX_BUSINESS_PHOTO_UPLOAD_BYTES / (1024 * 1024);
  return `Selected photo is ${formatFileSize(size)}. Business photos must be ${maxMegabytes} MB or smaller. Choose a smaller photo.`;
}

export function getDealPdfSizeDetail(size: number | null | undefined) {
  return `PDF · ${formatFileSize(size)} · ${MAX_DEAL_PDF_UPLOAD_BYTES / (1024 * 1024)} MB max`;
}
