import type { InjectionKey } from 'vue';
import type {
  AiActionItem,
  AiMessageItem,
  AiSessionDetail,
  AiSessionItem,
  AiSessionListResponse,
  AiSessionOverview,
} from '#layers/thei/shared/ai';
import type { AiRevisePartState } from '#layers/thei/shared/ai-actions';
import type { AiEntityPanel } from '#layers/thei/shared/ai-entity';
import type { AiTemplateRunResponse } from '#layers/thei/shared/ai-template';
import type { ContentEntityType } from '#layers/thei/shared/content-link';

/**
 * One session as the page follows it: read whole once, then kept up to date
 * by its event stream — the model's words as it writes them, messages,
 * actions, the session itself. A stream that keeps failing gives way to
 * asking every second and a half. Only the session on screen is followed.
 */

/** How often the page asks when the stream cannot hold. */
const POLL_MS = 1500;
/** Failures of the stream before the page asks instead. */
const STREAM_FAILURES = 2;

export function useAiSession(sessionUuid: Ref<string | undefined>) {
  const detail = shallowRef<AiSessionDetail | null>(null);
  const missing = ref(false);
  let source: EventSource | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let failures = 0;

  function stop() {
    source?.close();
    source = undefined;
    if (poll) clearInterval(poll);
    poll = undefined;
  }

  function upsertMessage(message: AiMessageItem) {
    const current = detail.value;
    if (!current) return;
    const messages = current.messages.filter(
      (item) => item.messageUuid !== message.messageUuid,
    );
    messages.push(message);
    messages.sort((a, b) => a.seq - b.seq);
    detail.value = { ...current, messages };
  }

  /**
   * Words a model has just written, standing at `at` in its message: only
   * what the page lacks is added. Words that went by unseen — a page that
   * came in between, a stream that broke — have the session read again.
   */
  function appendWords(messageUuid: string, text: string, at: number) {
    const current = detail.value;
    if (!current) return;
    const message = current.messages.find(
      (item) => item.messageUuid === messageUuid,
    );
    if (!message || at > message.text.length) {
      if (sessionUuid.value) void catchUp(sessionUuid.value);
      return;
    }
    const rest = text.slice(message.text.length - at);
    if (!rest) return;
    detail.value = {
      ...current,
      messages: current.messages.map((item) =>
        item === message
          ? // The words as they come, read by the page until the message
            // is saved with its text as the server reads it.
            { ...item, text: item.text + rest, body: null }
          : item,
      ),
    };
  }

  let catchingUp: Promise<void> | undefined;
  /**
   * Reads the session again, once at a time, however many gaps were seen. A
   * stream is joined afresh instead: its snapshot and the changes after it
   * come in order, where a read of its own could land after newer news.
   */
  function catchUp(id: string) {
    if (source) return follow(id);
    catchingUp ??= reload(id).finally(() => (catchingUp = undefined));
    return catchingUp;
  }

  function upsertActions(actions: AiActionItem[]) {
    const current = detail.value;
    if (!current) return;
    const byId = new Map(
      current.actions.map((item) => [item.actionUuid, item]),
    );
    for (const action of actions) byId.set(action.actionUuid, action);
    detail.value = {
      ...current,
      actions: [...byId.values()].sort((a, b) => a.createdAt - b.createdAt),
    };
  }

  function setHead(head: AiSessionItem | { deleted: true }) {
    const current = detail.value;
    if (!current) return;
    if ('deleted' in head) {
      detail.value = null;
      missing.value = true;
      return;
    }
    detail.value = { ...current, session: head };
  }

  async function reload(id: string) {
    try {
      detail.value = await $fetch<AiSessionDetail>(
        `/api/admin/ai/sessions/${id}`,
      );
      missing.value = false;
    } catch {
      if (sessionUuid.value === id) missing.value = true;
    }
  }

  function startPolling(id: string) {
    stop();
    void reload(id);
    poll = setInterval(() => {
      if (document.visibilityState === 'visible') void reload(id);
    }, POLL_MS);
  }

  function follow(id: string) {
    stop();
    if (failures >= STREAM_FAILURES) return startPolling(id);
    const stream = new EventSource(
      sitePath(`/api/admin/ai/sessions/${id}/events`),
    );
    source = stream;
    const read = <T>(event: MessageEvent): T => JSON.parse(event.data) as T;
    stream.addEventListener('snapshot', (event) => {
      failures = 0;
      detail.value = read<AiSessionDetail>(event as MessageEvent);
      missing.value = false;
    });
    stream.addEventListener('message', (event) =>
      upsertMessage(read<AiMessageItem>(event as MessageEvent)),
    );
    stream.addEventListener('delta', (event) => {
      const delta = read<{ messageUuid: string; text: string; at: number }>(
        event as MessageEvent,
      );
      appendWords(delta.messageUuid, delta.text, delta.at);
    });
    stream.addEventListener('actions', (event) =>
      upsertActions(read<AiActionItem[]>(event as MessageEvent)),
    );
    stream.addEventListener('session', (event) =>
      setHead(read<AiSessionItem | { deleted: true }>(event as MessageEvent)),
    );
    stream.onerror = () => {
      // The browser retries on its own; a stream that will not hold is
      // given up for asking.
      failures++;
      if (
        stream.readyState === EventSource.CLOSED ||
        failures >= STREAM_FAILURES
      )
        startPolling(id);
    };
  }

  function visibility() {
    const id = sessionUuid.value;
    if (!id) return;
    if (document.visibilityState === 'visible') {
      if (!source && !poll) follow(id);
    } else stop();
  }

  if (import.meta.client) {
    watch(
      sessionUuid,
      (id) => {
        stop();
        detail.value = null;
        missing.value = false;
        failures = 0;
        // The stream's snapshot is the first read: a read beside it could
        // answer later with an older session — a turn still running that
        // has ended since.
        if (id) follow(id);
      },
      { immediate: true },
    );
    document.addEventListener('visibilitychange', visibility);
    // A page left closes its stream first, rather than have the browser cut
    // it mid-way; one brought back from the back-forward cache follows again.
    const pagehide = () => stop();
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted && sessionUuid.value) follow(sessionUuid.value);
    };
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', pageshow);
    onScopeDispose(() => {
      stop();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
    });
  }

  /** After a call, when the stream is not there to say what changed. */
  async function refreshIfPolling() {
    const id = sessionUuid.value;
    if (id && !source) await reload(id);
  }

  return { detail, missing, refresh: refreshIfPolling };
}

/** A file the owner brings along: in the library, with its name. */
export interface AiComposerFile {
  assetUuid: string;
  name: string;
}

/** An entity a message names, as its chip shows it. */
export interface AiMentionItem {
  entityType: ContentEntityType;
  entityId: string;
  title: string;
  /** A diary entry's day, which names it. */
  date?: string;
}

/** What a page may ask of the message field. */
export interface AiComposerExpose {
  focus: () => void;
  /**
   * Words put in for the owner to go on with; a ready-made request's carry
   * its id, which the message is sent with while its words are there.
   */
  prefill: (text: string, templateId?: string) => void;
  mention: (item: AiMentionItem) => void;
  /** The ready-made request the words began from, if any. */
  templateId: () => string | undefined;
}

/**
 * The page of a new session: about an entity, a ready-made request's words
 * written in.
 */
export function newSessionLocation(
  options: { about?: string; template?: string } = {},
) {
  return {
    path: '/admin/ai/',
    query: {
      session: 'new',
      ...(options.about ? { about: options.about } : {}),
      ...(options.template ? { template: options.template } : {}),
    },
  };
}

const ARCHIVED: InjectionKey<Readonly<Ref<boolean>>> = Symbol('ai-archived');

/**
 * Whether the session shown is archived: its actions are read, not decided,
 * until it is brought back.
 */
export function provideAiArchived(archived: Readonly<Ref<boolean>>) {
  provide(ARCHIVED, archived);
}

export function useAiArchived(): Readonly<Ref<boolean>> {
  return inject(ARCHIVED, ref(false));
}

export const aiApi = {
  /**
   * What an entity's form shows of the AI, by the entity's ref; the profile,
   * one of a kind, is `profile`.
   */
  entityPanel(ref: string) {
    const colon = ref.indexOf(':');
    const [type, id] =
      colon < 0 ? [ref, ref] : [ref.slice(0, colon), ref.slice(colon + 1)];
    return $fetch<AiEntityPanel>(
      `/api/admin/ai/entities/${type}/${encodeURIComponent(id)}`,
    );
  },
  /** The first few sessions that wait for the owner; none when unread. */
  async waitingSessions(): Promise<AiSessionItem[]> {
    const list = await $fetch<AiSessionListResponse>('/api/admin/ai/sessions', {
      query: { waiting: 'true', archived: 'false' },
    }).catch(() => null);
    return list?.sessions.slice(0, 5) ?? [];
  },
  /** The few sessions the dashboard shows; none when unread. */
  sessionOverview(): Promise<AiSessionOverview | null> {
    return $fetch<AiSessionOverview>('/api/admin/ai/overview').catch(
      () => null,
    );
  },
  apply(
    actionUuids: string[],
    parts?: Record<string, Record<string, AiRevisePartState>>,
  ) {
    return $fetch<{
      applied: { actionUuid: string; entity?: string }[];
      /** Every entity whose version moved, for open forms to read anew. */
      changed: string[];
      refused?: string;
      failed?: { actionUuid: string; error: string };
    }>('/api/admin/ai/actions/apply', {
      method: 'POST',
      body: { actionUuids, parts },
    });
  },
  /** The owner's word on parts of a text edit, kept until it is applied. */
  decideParts(actionUuid: string, parts: Record<string, AiRevisePartState>) {
    return $fetch(`/api/admin/ai/actions/${actionUuid}/parts`, {
      method: 'POST',
      body: { parts },
    });
  },
  reject(actionUuid: string, never = false) {
    return $fetch(`/api/admin/ai/actions/${actionUuid}/reject`, {
      method: 'POST',
      body: { never },
    });
  },
  never(actionUuid: string, part?: string) {
    return $fetch(`/api/admin/ai/actions/${actionUuid}/never`, {
      method: 'POST',
      body: part ? { part } : {},
    });
  },
  restore(actionUuid: string) {
    return $fetch(`/api/admin/ai/actions/${actionUuid}/restore`, {
      method: 'POST',
    });
  },
  undo(actionUuid: string) {
    return $fetch<{ entity?: string; changed: string[] }>(
      `/api/admin/ai/actions/${actionUuid}/undo`,
      { method: 'POST' },
    );
  },
  comment(actionUuid: string, text: string) {
    return $fetch(`/api/admin/ai/actions/${actionUuid}/comment`, {
      method: 'POST',
      body: { text },
    });
  },
  post(
    sessionUuid: string,
    body: {
      text: string;
      about?: string[];
      answers?: string;
      files?: AiComposerFile[];
    },
  ) {
    return $fetch<{ messageUuid: string }>(
      `/api/admin/ai/sessions/${sessionUuid}/messages`,
      { method: 'POST', body },
    );
  },
  start(body: {
    text?: string;
    about?: string[];
    title?: string;
    files?: AiComposerFile[];
    /** The ready-made request the words began from. */
    templateId?: string;
  }) {
    return $fetch<{ sessionUuid: string }>('/api/admin/ai/sessions', {
      method: 'POST',
      body,
    });
  },
  stop(sessionUuid: string) {
    return $fetch(`/api/admin/ai/sessions/${sessionUuid}/stop`, {
      method: 'POST',
    });
  },
  /**
   * Runs a built-in check: over what it has not looked at yet of the whole
   * archive, or of the entities named — which start over once all of them is
   * looked at — narrowed by the owner's words. No session when there is
   * nothing to look at.
   */
  runCheck(
    templateId: string,
    body: { about?: string[]; request?: string } = {},
  ) {
    return $fetch<AiTemplateRunResponse>(
      `/api/admin/ai/templates/${templateId}/run`,
      { method: 'POST', body },
    );
  },
  change(
    sessionUuid: string,
    body: Partial<{
      title: string;
      pinned: boolean;
      archived: boolean;
    }>,
  ) {
    return $fetch<AiSessionItem>(`/api/admin/ai/sessions/${sessionUuid}`, {
      method: 'PATCH',
      body,
    });
  },
  remove(sessionUuid: string) {
    return $fetch(`/api/admin/ai/sessions/${sessionUuid}`, {
      method: 'DELETE',
    });
  },
};
