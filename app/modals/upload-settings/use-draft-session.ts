import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import { buildUploadHeaders } from '#layers/thei/shared/api/asset-upload-headers';
import { createOriginalAssetSettings } from '#layers/thei/shared/asset-upload-settings';
import { getPathExtension } from '#layers/thei/shared/assets/extensions';
import type { PickedFile } from '../pick-file/picked-file';
import type { UploadSettingsModalData } from './use-upload-settings-assets';

/** What a draft is opened from: the picked file, or a file in the library. */
export type DraftOrigin =
  { kind: 'file'; file: PickedFile } | { kind: 'asset'; assetUuid: string };

export function draftOriginKey(origin: DraftOrigin): string {
  return origin.kind === 'file'
    ? `file:${origin.file.name}:${origin.file.size}`
    : `asset:${origin.assetUuid}`;
}

/**
 * The server-side copy the editor works on.
 *
 * The picked file crosses the network once, however many settings are tried;
 * a library file is opened in place. A draft the server has forgotten — after
 * a restart or a long pause — is opened again the next time it is needed, and
 * the request that found it gone is retried.
 */
export function useDraftSession(
  modalData: UploadSettingsModalData,
  origin: () => DraftOrigin | undefined,
) {
  const draft = shallowRef<AssetDraftSource | null>(null);
  /** Upload progress 0..1 while the picked file is being staged. */
  const stagingProgress = ref<number | null>(null);
  const error = ref<unknown>(null);
  let opening: Promise<AssetDraftSource> | null = null;
  let openedFor = '';
  let activeXhr: XMLHttpRequest | null = null;

  watch(
    () => {
      const current = origin();
      return current ? draftOriginKey(current) : '';
    },
    (key) => {
      if (key !== openedFor) close();
    },
  );

  onBeforeUnmount(() => close());

  async function ensure(): Promise<AssetDraftSource> {
    const current = origin();
    if (!current) throw new Error('Nothing to edit');
    const key = draftOriginKey(current);
    if (draft.value && openedFor === key) return draft.value;
    if (opening && openedFor === key) return await opening;

    close();
    openedFor = key;
    error.value = null;
    const attempt = open(current).then(
      (opened) => {
        if (openedFor === key) draft.value = opened;
        return opened;
      },
      (reason: unknown) => {
        if (openedFor === key) error.value = reason;
        throw reason;
      },
    );
    opening = attempt;
    try {
      return await attempt;
    } finally {
      if (opening === attempt) opening = null;
    }
  }

  /** Runs a request against the draft, reopening it once if it expired. */
  async function withDraft<T>(
    request: (draft: AssetDraftSource) => Promise<T>,
  ): Promise<T> {
    const opened = await ensure();
    try {
      return await request(opened);
    } catch (reason) {
      if (!isDraftExpired(reason)) throw reason;
      draft.value = null;
      return await request(await ensure());
    }
  }

  function close() {
    activeXhr?.abort();
    activeXhr = null;
    opening = null;
    stagingProgress.value = null;
    const closing = draft.value;
    draft.value = null;
    openedFor = '';
    if (!closing) return;
    // Sent with keepalive so a closing tab still frees the server's copy.
    void fetch(sitePath(`/api/admin/assets/drafts/${closing.draftId}`), {
      method: 'DELETE',
      keepalive: true,
    }).catch(() => {});
  }

  async function open(current: DraftOrigin): Promise<AssetDraftSource> {
    if (current.kind === 'asset') {
      return await $fetch<AssetDraftSource>(
        `/api/admin/assets/drafts/from-asset/${current.assetUuid}`,
        { method: 'POST' },
      );
    }
    return await stage(current.file);
  }

  function stage(file: PickedFile): Promise<AssetDraftSource> {
    const headers = buildUploadHeaders({
      // Staging stores nothing; the header only has to be well formed.
      settings: createOriginalAssetSettings(),
      extension: getPathExtension(file.name),
      ...(modalData.maxSize !== undefined
        ? { maxSize: modalData.maxSize }
        : {}),
      ...(modalData.sizeLimitPolicy
        ? { sizeLimitPolicy: modalData.sizeLimitPolicy }
        : {}),
      ...(modalData.acceptedExtensions
        ? { acceptedExtensions: modalData.acceptedExtensions }
        : {}),
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhr = xhr;
      stagingProgress.value = 0;
      xhr.open('POST', sitePath('/api/admin/assets/drafts'));
      for (const [name, value] of Object.entries(headers)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          stagingProgress.value = event.loaded / event.total;
        }
      });
      const finish = () => {
        if (activeXhr === xhr) activeXhr = null;
        stagingProgress.value = null;
      };
      xhr.addEventListener('load', () => {
        finish();
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as AssetDraftSource);
          } catch {
            reject(new Error(phrase.value.upload_error_invalid_response));
          }
          return;
        }
        reject(new Error(readXhrMessage(xhr)));
      });
      xhr.addEventListener('error', () => {
        finish();
        reject(new Error(phrase.value.upload_error_network));
      });
      xhr.addEventListener('abort', () => {
        finish();
        reject(
          new DOMException(phrase.value.upload_error_cancelled, 'AbortError'),
        );
      });
      xhr.send(file.file);
    });
  }

  return { draft, stagingProgress, error, ensure, withDraft, close };
}

export function isDraftExpired(reason: unknown): boolean {
  const data =
    reason && typeof reason === 'object' && 'data' in reason
      ? (reason as { data?: { data?: { draftExpired?: boolean } } }).data
      : undefined;
  return Boolean(data?.data?.draftExpired);
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
