import type { AssetUploadLimitPolicy } from '../asset-upload-limits';
import type { AssetUploadRequest } from '../asset-upload-settings';

export interface AssetUploadHeaderInput {
  settings: AssetUploadRequest;
  /** Only the extension travels: the file name never reaches the server. */
  extension: string;
  uploadId?: string;
  maxSize?: number;
  sizeLimitPolicy?: AssetUploadLimitPolicy;
  acceptedExtensions?: string[] | '*';
}

/**
 * Builds the headers that describe an upload.
 *
 * Uploads post the file as the raw request body so the server can stream it
 * straight to disk; everything that used to be a multipart field travels here
 * instead. Values are percent-encoded because headers are latin-1.
 */
export function buildUploadHeaders(
  input: AssetUploadHeaderInput,
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/octet-stream',
    'x-upload-settings': encodeURIComponent(JSON.stringify(input.settings)),
    'x-upload-extension': encodeURIComponent(input.extension),
  };

  if (input.uploadId)
    headers['x-upload-id'] = encodeURIComponent(input.uploadId);
  if (input.maxSize !== undefined) {
    headers['x-upload-max-size'] = String(input.maxSize);
  }
  if (input.sizeLimitPolicy) {
    headers['x-upload-size-limit-policy'] = input.sizeLimitPolicy;
  }
  if (input.acceptedExtensions) {
    headers['x-upload-accepted-extensions'] = encodeURIComponent(
      input.acceptedExtensions === '*'
        ? '*'
        : JSON.stringify(input.acceptedExtensions),
    );
  }

  return headers;
}
