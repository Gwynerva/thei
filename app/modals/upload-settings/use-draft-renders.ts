import type {
  AssetDraftRender,
  AssetDraftSource,
} from '#layers/thei/shared/api/asset-draft';
import type { AssetImageTransformRequest } from '#layers/thei/shared/asset-upload-settings';

/**
 * Settled edits wait this long, so a drag of the frame, a walk along the
 * quality bar or typing a size is one batch of requests, not one per step.
 */
const RENDER_DELAY_MS = 350;
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
 * Each settled change asks the server to encode what "Use" would store in
 * every format, and then every other quality stop in the format that would
 * be stored there, so each shows its real size and "Auto" can pick by them.
 * The list is in order of worth — the chosen stop's formats first — and the
 * server takes jobs in the order they arrive. Settings already rendered are
 * answered from memory; a render still under way stays under way as long as
 * it is still wanted, and is cancelled the moment it is not. Results are
 * looked up by the settings asked for, so a request the server describes
 * differently still finds its answer.
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
  const inflight = new Map<string, AbortController>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // One batch for a source's whole session. The server lets the requests of
  // one batch run side by side and cancels those of another still waiting;
  // here a render is dropped only when this editor stops wanting it, which
  // it says by closing the request.
  let batch = crypto.randomUUID();

  const primaryKey = computed(() => options.primaryKey());
  const current = computed(() => renders.get(primaryKey.value));
  const error = computed(() => failedKeys.get(primaryKey.value) ?? '');
  const pending = computed(
    () => Boolean(primaryKey.value) && !current.value && !error.value,
  );

  // The set of settings, not their order: picking another format or stop
  // reorders the same requests and must not touch encodes already under way.
  watch(
    () =>
      options
        .requests()
        .map((item) => item.key)
        .sort()
        .join('|'),
    schedule,
    { immediate: true },
  );
  onBeforeUnmount(() => {
    clearTimeout(timer);
    abortAll();
  });

  function schedule() {
    clearTimeout(timer);
    const missing = options
      .requests()
      .some(
        (item) => item.key && !renders.has(item.key) && !inflight.has(item.key),
      );
    if (missing) timer = setTimeout(() => void run(), RENDER_DELAY_MS);
  }

  async function run() {
    const wanted = options
      .requests()
      .filter((item) => item.key && !renders.has(item.key));
    const wantedKeys = new Set(wanted.map((item) => item.key));
    for (const [key, controller] of inflight) {
      if (!wantedKeys.has(key)) {
        controller.abort();
        inflight.delete(key);
      }
    }
    await Promise.all(
      wanted
        .filter((item) => !inflight.has(item.key))
        .map((item) => fetchOne(item)),
    );
  }

  async function fetchOne(item: DraftRenderRequest) {
    const controller = new AbortController();
    inflight.set(item.key, controller);
    failedKeys.delete(item.key);
    try {
      const render = await options.withDraft((draft) =>
        $fetch<AssetDraftRender>(
          `/api/admin/assets/drafts/${draft.draftId}/renders`,
          {
            method: 'POST',
            body: { settings: item.request, batch },
            signal: controller.signal,
          },
        ),
      );
      remember(item.key, render);
    } catch (reason) {
      if (!controller.signal.aborted) {
        failedKeys.set(
          item.key,
          errorMessage(reason, phrase.value.upload_result_failed),
        );
      }
    } finally {
      if (inflight.get(item.key) === controller) inflight.delete(item.key);
    }
  }

  function remember(key: string, render: AssetDraftRender) {
    renders.delete(key);
    renders.set(key, render);
    while (renders.size > MAX_KEPT) {
      renders.delete(renders.keys().next().value!);
    }
  }

  function abortAll() {
    for (const controller of inflight.values()) controller.abort();
    inflight.clear();
  }

  /**
   * Gives up every render but one, so "Use" does not wait its turn behind
   * dry runs of stops the admin has not chosen.
   */
  function abortExcept(key: string) {
    for (const [own, controller] of inflight) {
      if (own === key) continue;
      controller.abort();
      inflight.delete(own);
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
    clearTimeout(timer);
    abortAll();
    renders.clear();
    failedKeys.clear();
    batch = crypto.randomUUID();
    schedule();
  }

  function retry() {
    failedKeys.clear();
    void run();
  }

  return {
    current,
    pending,
    error,
    renderFor,
    isPending,
    abortExcept,
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
