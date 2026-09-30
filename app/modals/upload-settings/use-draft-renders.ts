import type {
  AssetDraftRender,
  AssetDraftSource,
} from '#layers/thei/shared/api/asset-draft';
import type { AssetImageTransformRequest } from '#layers/thei/shared/asset-upload-settings';
import { RenderPump } from './render-pump';

/**
 * Settled edits wait this long, so a drag of the frame, a walk along the
 * quality bar or typing a size is one set of requests, not one per step.
 */
const RENDER_DELAY_MS = 350;
/**
 * Dry runs under way at once: as many as the image lane runs on the largest
 * box, so a change wastes at most that many encodes already started.
 */
const RENDER_WINDOW = 3;
/**
 * Every stop in every format of the last couple of settings — no more than
 * the server keeps (`DRAFT_MAX_RENDERS`), or a remembered render could point
 * at a file it has already dropped.
 */
const MAX_KEPT = 32;

export interface DraftRenderRequest {
  /** Identifies the request in the cache; empty when nothing is to render. */
  key: string;
  request: AssetImageTransformRequest;
}

/**
 * Dry runs of the current image settings, fetched as the admin edits.
 *
 * The requests come in order of worth — first what "Use" would store, then
 * the other formats "Auto" weighs at that stop, then the other stops nearest
 * first — and a few go out at a time, so the one that matters is answered
 * before the rest are even asked for. Settings already rendered are answered
 * from memory; a render still under way stays under way as long as it is
 * still wanted, and is cancelled the moment it is not. Results are looked up
 * by the settings asked for, so a request the server describes differently
 * still finds its answer.
 */
export function useDraftRenders(options: {
  withDraft: <T>(
    request: (draft: AssetDraftSource) => Promise<T>,
  ) => Promise<T>;
  /** Every render worth having, the most wanted first. */
  requests: () => DraftRenderRequest[];
  /** The render "Use" would store; empty while there is none to make. */
  primaryKey: () => string;
}) {
  const renders = shallowReactive(new Map<string, AssetDraftRender>());
  const failedKeys = shallowReactive(new Map<string, string>());
  const pump = new RenderPump<DraftRenderRequest, AssetDraftRender>({
    window: RENDER_WINDOW,
    delayMs: RENDER_DELAY_MS,
    has: (key) => renders.has(key),
    fetch: (item, signal) =>
      options.withDraft((draft) =>
        $fetch<AssetDraftRender>(
          `/api/admin/assets/drafts/${draft.draftId}/renders`,
          {
            method: 'POST',
            body: { settings: item.request },
            signal,
          },
        ),
      ),
    onResult: (key, render) => {
      failedKeys.delete(key);
      remember(key, render);
    },
    onFailure: (key, reason) => {
      failedKeys.set(
        key,
        errorMessage(reason, phrase.value.upload_result_failed),
      );
    },
  });

  const primaryKey = computed(() => options.primaryKey());
  const current = computed(() => renders.get(primaryKey.value));
  const error = computed(() => failedKeys.get(primaryKey.value) ?? '');
  const pending = computed(
    () => Boolean(primaryKey.value) && !current.value && !error.value,
  );

  watch(
    () =>
      options
        .requests()
        .map((item) => item.key)
        .join('|'),
    () => pump.setWanted(options.requests()),
    { immediate: true },
  );
  onBeforeUnmount(() => pump.abortAll());

  function remember(key: string, render: AssetDraftRender) {
    renders.delete(key);
    renders.set(key, render);
    while (renders.size > MAX_KEPT) {
      renders.delete(renders.keys().next().value!);
    }
  }

  function renderFor(key: string) {
    return renders.get(key);
  }

  function isPending(key: string) {
    return Boolean(key) && !renders.has(key) && !failedKeys.has(key);
  }

  /** Forgets every result, when they were made from another source. */
  function reset() {
    pump.reset();
    renders.clear();
    failedKeys.clear();
    pump.setWanted(options.requests());
  }

  function retry() {
    failedKeys.clear();
    pump.retry();
  }

  return {
    current,
    pending,
    error,
    renderFor,
    isPending,
    /** Keeps the render being stored and stops the rest, until released. */
    hold: (key: string) => pump.hold(key),
    release: () => pump.release(),
    retry,
    reset,
  };
}

export function errorMessage(reason: unknown, fallback: string): string {
  if (reason && typeof reason === 'object' && 'data' in reason) {
    const data = (reason as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
