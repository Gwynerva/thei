import type {
  AssetUploadResponse,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import type {
  AssetJobStatus,
  AssetUploadProgress,
} from '#layers/thei/shared/api/asset-upload-progress';
import { buildUploadHeaders } from '#layers/thei/shared/api/asset-upload-headers';
import type { AssetSelectionConstraints } from '#layers/thei/shared/asset-library';
import {
  createOriginalAssetSettings,
  type AssetUploadRequest,
} from '#layers/thei/shared/asset-upload-settings';
import { trackUploadProgress } from './upload-progress';

/** The limits of the place a file is going to, sent along with it. */
export type UploadConstraints = Pick<
  AssetSelectionConstraints,
  'maxSize' | 'acceptedExtensions' | 'sizeLimitPolicy'
>;

export interface SendUploadOptions {
  /** Share of the file that has left the browser, 0..1. */
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
}

/**
 * The requests behind every upload — the asset editor's draft, a block
 * storing a pasted file, a batch of files added to a list: sending the file
 * once with progress, storing a result made from it, and letting the
 * server's copy go.
 */

/**
 * Sends a file as the raw body of a request, reporting how much has left.
 *
 * XHR rather than fetch: only it reports the upload's own progress. The
 * response is JSON; a failure carries the server's message when it has one.
 */
export function sendUploadRequest<T>(
  url: string,
  file: File,
  headers: Record<string, string>,
  options: SendUploadOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sitePath(url));
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(event.loaded / event.total);
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error(phrase.value.upload_error_invalid_response));
        }
        return;
      }
      reject(new Error(readXhrMessage(xhr)));
    });
    xhr.addEventListener('error', () => {
      reject(new Error(phrase.value.upload_error_network));
    });
    xhr.addEventListener('abort', () => reject(abortError()));
    options.signal?.addEventListener('abort', () => xhr.abort(), {
      once: true,
    });
    xhr.send(file);
  });
}

/** Sends a file to the server as a draft, for the editor to work on. */
export function stageDraftFile(
  file: File,
  extension: string,
  constraints: UploadConstraints,
  options: SendUploadOptions = {},
): Promise<AssetDraftSource> {
  return sendUploadRequest<AssetDraftSource>(
    '/api/admin/assets/drafts',
    file,
    buildUploadHeaders({
      // Staging stores nothing; the header only has to be well formed.
      settings: createOriginalAssetSettings(),
      extension,
      ...constraintHeaders(constraints),
    }),
    options,
  );
}

/**
 * Stores a file as it is, straight into the library, following the server's
 * phases once the file is up: the metadata strip and the preview for a
 * picture are quick, a video's preview waits its turn in the video lane.
 */
export async function uploadOriginalFile(
  file: File,
  extension: string,
  constraints: UploadConstraints,
  options: SendUploadOptions & {
    onStatus?: (status: AssetUploadProgress) => void;
  } = {},
): Promise<AssetVariantInfo> {
  const uploadId = crypto.randomUUID();
  const { onStatus } = options;
  let stop: (() => void) | undefined;
  try {
    return await sendUploadRequest<AssetVariantInfo>(
      '/api/admin/assets',
      file,
      buildUploadHeaders({
        settings: createOriginalAssetSettings(),
        extension,
        uploadId,
        ...constraintHeaders(constraints),
      }),
      {
        signal: options.signal,
        onProgress: (share) => {
          options.onProgress?.(share);
          // The server has nothing to say until the whole file is there.
          if (share >= 1 && onStatus && !stop) {
            stop = trackUploadProgress(uploadId, onStatus);
          }
        },
      },
    );
  } finally {
    stop?.();
  }
}

/** How often a commit run as a job is asked about. */
const JOB_POLL_MS = 1000;
/** The longest wait between polls while the server cannot be reached. */
const JOB_POLL_MAX_MS = 10_000;

/**
 * A commit run as a job failed, or the job is gone. Carries what the
 * request's own error would have, so it is read the same way everywhere.
 */
export class UploadJobError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'UploadJobError';
  }
}

/**
 * Stores a result made from a draft, following the server's progress under
 * an id of this request's own. A quick result comes back with the request;
 * a long one — a video encode, a zip — runs as a job on the server, which
 * answers `202` at once and is followed until it settles. Going away is
 * reported as an `AbortError`, whatever the fetch layer made of it, and
 * cancels the job.
 */
export async function commitDraftRequest(
  draftId: string,
  request: AssetUploadRequest,
  constraints: UploadConstraints,
  options: {
    signal?: AbortSignal;
    onStatus?: (status: AssetUploadProgress) => void;
  } = {},
): Promise<AssetUploadResponse> {
  const uploadId = crypto.randomUUID();
  const { onStatus, signal } = options;
  const stop = onStatus ? trackUploadProgress(uploadId, onStatus) : () => {};
  let response;
  try {
    response = await $fetch.raw<AssetUploadResponse | { uploadId: string }>(
      `/api/admin/assets/drafts/${draftId}/commit`,
      {
        method: 'POST',
        signal,
        body: {
          settings: request,
          uploadId,
          maxSize: constraints.maxSize,
          acceptedExtensions: constraints.acceptedExtensions,
          sizeLimitPolicy: constraints.sizeLimitPolicy,
        },
      },
    );
  } catch (reason) {
    if (signal?.aborted) {
      // Abandoned before the answer came: the job may have started all the
      // same, and nothing would ever ask for it.
      cancelUploadJob(uploadId);
      throw abortError();
    }
    throw reason;
  } finally {
    stop();
  }
  if (response.status !== 202) return response._data as AssetUploadResponse;
  return await awaitUploadJob(uploadId, { signal, onStatus });
}

/** A DELETE sent with keepalive, so a tab that is closing still sends it. */
function sendDelete(path: string) {
  void fetch(sitePath(path), { method: 'DELETE', keepalive: true }).catch(
    () => {},
  );
}

/** Stops a job on the server. */
function cancelUploadJob(uploadId: string) {
  sendDelete(`/api/admin/uploads/${uploadId}`);
}

/**
 * Follows a commit run as a job until it settles. Abandoning it — the
 * signal, or the tab going away — cancels it: nothing would take the
 * result. A job the server no longer knows was lost to a restart, and so
 * was the draft; it is reported as the draft being gone, which makes the
 * caller stage the file again. A server that cannot be reached says nothing
 * of the job, which may well go on there: it is asked again, less often,
 * rather than given up and encoded a second time beside itself.
 */
async function awaitUploadJob(
  uploadId: string,
  options: {
    signal?: AbortSignal;
    onStatus?: (status: AssetUploadProgress) => void;
  },
): Promise<AssetUploadResponse> {
  const { signal, onStatus } = options;
  const cancel = () => cancelUploadJob(uploadId);
  signal?.addEventListener('abort', cancel, { once: true });
  window.addEventListener('pagehide', cancel);
  let failures = 0;
  try {
    while (true) {
      await pause(
        Math.min(JOB_POLL_MS * 2 ** failures, JOB_POLL_MAX_MS),
        signal,
      );
      let status: AssetJobStatus | null;
      try {
        status = await $fetch<AssetJobStatus | null>(
          `/api/admin/uploads/${uploadId}`,
        );
      } catch {
        if (signal?.aborted) throw abortError();
        failures++;
        continue;
      }
      failures = 0;
      // The job was registered before the request was answered: nothing
      // known now means it was forgotten.
      if (!status) throw jobLost();
      if (status.phase === 'done') return status.asset;
      if (status.phase === 'failed') {
        throw new UploadJobError(
          status.message,
          status.statusCode,
          status.data,
        );
      }
      onStatus?.(status);
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    window.removeEventListener('pagehide', cancel);
  }
}

function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function jobLost() {
  return new UploadJobError(phrase.value.upload_error_job_lost, 404, {
    draftExpired: true,
  });
}

/** Frees the server's copy. */
export function deleteDraft(draftId: string) {
  sendDelete(`/api/admin/assets/drafts/${draftId}`);
}

/**
 * A request answered with "this draft is gone": the file is staged again.
 * A job lost to a restart says the same, in its own shape.
 */
export function isDraftExpired(reason: unknown): boolean {
  if (reason instanceof UploadJobError) {
    return Boolean(
      (reason.data as { draftExpired?: boolean } | undefined)?.draftExpired,
    );
  }
  const data =
    reason && typeof reason === 'object' && 'data' in reason
      ? (reason as { data?: { data?: { draftExpired?: boolean } } }).data
      : undefined;
  return Boolean(data?.data?.draftExpired);
}

export function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError';
}

function constraintHeaders(constraints: UploadConstraints) {
  return {
    ...(constraints.maxSize !== undefined
      ? { maxSize: constraints.maxSize }
      : {}),
    ...(constraints.sizeLimitPolicy
      ? { sizeLimitPolicy: constraints.sizeLimitPolicy }
      : {}),
    ...(constraints.acceptedExtensions
      ? { acceptedExtensions: constraints.acceptedExtensions }
      : {}),
  };
}

function abortError() {
  return new DOMException(phrase.value.upload_error_cancelled, 'AbortError');
}

function readXhrMessage(xhr: XMLHttpRequest): string {
  try {
    const response = JSON.parse(xhr.responseText) as { message?: string };
    return (
      response.message ?? phrase.value.upload_error_request_failed(xhr.status)
    );
  } catch {
    return phrase.value.upload_error_request_failed(xhr.status);
  }
}
