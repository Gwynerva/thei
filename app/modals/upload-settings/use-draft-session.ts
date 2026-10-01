import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import { getPathExtension } from '#layers/thei/shared/assets/extensions';
import {
  deleteDraft,
  isDraftExpired,
  stageDraftFile,
} from '#layers/thei/app/composables/upload-draft';
import type { PickedFile } from '../pick-file/picked-file';
import type { UploadSettingsModalData } from './use-upload-settings-assets';

/**
 * What a draft is opened from: the picked file, a file in the library, or a
 * draft someone else already staged — a block storing a pasted file — with
 * the file itself in case that draft is gone.
 */
export type DraftOrigin =
  | { kind: 'file'; file: PickedFile }
  | { kind: 'asset'; assetUuid: string }
  | { kind: 'draft'; draft: AssetDraftSource; file: PickedFile };

/**
 * Tells origins apart. A picked file is told by its object URL: two files
 * of the same name and size are still two files.
 */
export function draftOriginKey(origin: DraftOrigin): string {
  return origin.kind === 'file'
    ? `file:${origin.file.objectUrl}`
    : origin.kind === 'asset'
      ? `asset:${origin.assetUuid}`
      : `draft:${origin.draft.draftId}`;
}

/**
 * The server-side copy the editor works on.
 *
 * The picked file crosses the network once, however many settings are tried;
 * a library file is opened in place; a draft handed in is used as it is. A
 * draft the server has forgotten — after a restart or a long pause — is
 * opened again the next time it is needed, and the request that found it
 * gone is retried. A draft opened here is deleted here; one handed in stays
 * its owner's to delete.
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
  let owned = false;
  /** The origin whose handed-in draft was found gone: its file is staged. */
  let expiredFor = '';
  let staging: AbortController | null = null;

  watch(
    () => {
      const current = origin();
      return current ? draftOriginKey(current) : '';
    },
    (key) => {
      if (key !== openedFor) close();
      expiredFor = '';
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
    const attempt = open(current, key).then(
      (opened) => {
        if (openedFor === key) {
          draft.value = opened.draft;
          owned = opened.owned;
        } else if (opened.owned) {
          // Closed while it was opening: nothing will ever use it.
          deleteDraft(opened.draft.draftId);
        }
        return opened.draft;
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
      expiredFor = openedFor;
      draft.value = null;
      return await request(await ensure());
    }
  }

  function close() {
    staging?.abort();
    staging = null;
    opening = null;
    stagingProgress.value = null;
    const closing = draft.value;
    const wasOwned = owned;
    draft.value = null;
    openedFor = '';
    owned = false;
    if (closing && wasOwned) deleteDraft(closing.draftId);
  }

  /** Opens a draft, saying whether it is this session's to delete. */
  async function open(
    current: DraftOrigin,
    key: string,
  ): Promise<{ draft: AssetDraftSource; owned: boolean }> {
    if (current.kind === 'asset') {
      const opened = await $fetch<AssetDraftSource>(
        `/api/admin/assets/drafts/from-asset/${current.assetUuid}`,
        { method: 'POST' },
      );
      return { draft: opened, owned: true };
    }
    if (current.kind === 'draft' && expiredFor !== key)
      return { draft: current.draft, owned: false };
    return { draft: await stage(current.file), owned: true };
  }

  async function stage(file: PickedFile): Promise<AssetDraftSource> {
    const controller = new AbortController();
    staging = controller;
    stagingProgress.value = 0;
    try {
      return await stageDraftFile(
        file.file,
        getPathExtension(file.name),
        modalData,
        {
          signal: controller.signal,
          onProgress: (share) => {
            if (staging === controller) stagingProgress.value = share;
          },
        },
      );
    } finally {
      if (staging === controller) {
        staging = null;
        stagingProgress.value = null;
      }
    }
  }

  return { draft, stagingProgress, error, ensure, withDraft, close };
}
