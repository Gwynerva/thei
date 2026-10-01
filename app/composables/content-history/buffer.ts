import type {
  ContentHistoryField,
  ContentHistoryHint,
} from '#layers/thei/shared/content-history';
import type { ContentOutputData } from '#layers/thei/shared/content';
import type { ContentHistoryTransport } from './api';

/**
 * What an editor wrote that the server has not confirmed yet.
 *
 * It lives in localStorage for seconds, or for as long as the connection is
 * down, and is removed the moment the server has it. localStorage rather than
 * IndexedDB because it is written synchronously, which is what still works
 * while a tab is being closed. Each tab keeps its own entry per field, as it
 * keeps its own draft on the server.
 */
export interface ContentHistoryBufferEntry {
  field: ContentHistoryField;
  writer: string;
  /** The writes to send, oldest first; the last one is the latest text. */
  entries: { data: ContentOutputData; hint?: ContentHistoryHint }[];
  updatedAt: number;
}

export interface ContentHistoryBuffer {
  read(
    field: ContentHistoryField,
    writer: string,
  ): ContentHistoryBufferEntry | undefined;
  /** Returns whether the entry was stored. */
  write(entry: ContentHistoryBufferEntry): boolean;
  remove(field: ContentHistoryField, writer: string): void;
  /** Every entry, or those of one field. */
  list(field?: ContentHistoryField): ContentHistoryBufferEntry[];
}

const PREFIX = 'thei:content-unsynced:';

/** Names one tab's entry of one field. */
export function contentHistoryBufferKey(
  field: ContentHistoryField,
  writer: string,
) {
  return `${field.ownerType}:${field.ownerRef}:${field.slot}:${writer}`;
}

export function createLocalContentHistoryBuffer(
  base: string,
  storage: () => Storage | undefined = () =>
    typeof localStorage === 'undefined' ? undefined : localStorage,
): ContentHistoryBuffer {
  const prefix = `${PREFIX}${base}:`;
  const keyOf = (field: ContentHistoryField, writer: string) =>
    `${prefix}${contentHistoryBufferKey(field, writer)}`;
  const parse = (value: string | null) => {
    if (!value) return undefined;
    try {
      const entry = JSON.parse(value) as ContentHistoryBufferEntry;
      return entry && Array.isArray(entry.entries) && entry.entries.length
        ? entry
        : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    read(field, writer) {
      try {
        return parse(storage()?.getItem(keyOf(field, writer)) ?? null);
      } catch {
        return undefined;
      }
    },
    write(entry) {
      try {
        const target = storage();
        if (!target) return false;
        target.setItem(keyOf(entry.field, entry.writer), JSON.stringify(entry));
        return true;
      } catch {
        return false;
      }
    },
    remove(field, writer) {
      try {
        storage()?.removeItem(keyOf(field, writer));
      } catch {
        // Nothing to protect: the server already has the text.
      }
    },
    list(field) {
      try {
        const target = storage();
        if (!target) return [];
        const start = field
          ? `${prefix}${field.ownerType}:${field.ownerRef}:${field.slot}:`
          : prefix;
        const result: ContentHistoryBufferEntry[] = [];
        for (let index = 0; index < target.length; index++) {
          const key = target.key(index);
          if (!key?.startsWith(start)) continue;
          const entry = parse(target.getItem(key));
          if (entry) result.push(entry);
        }
        return result;
      } catch {
        return [];
      }
    },
  };
}

export function useContentHistoryBuffer(): ContentHistoryBuffer {
  return createLocalContentHistoryBuffer(useRuntimeConfig().app.baseURL);
}

/**
 * Which tabs of this browser are open, by the writer each one holds.
 *
 * An open tab sends its own unconfirmed text. Sent from another tab as well,
 * an older text of it could reach the server after a newer one the open tab
 * already had confirmed — and the open tab, confirmed, would never send the
 * newer one again. Kept apart so tests can stand in.
 */
export interface ContentHistoryWriterLocks {
  /** Takes a writer for this tab, for as long as the tab stays open. */
  hold(writer: string): void;
  /**
   * Runs `send` unless the writer's tab is open, or another tab is sending
   * its text right now; answers whether it ran.
   */
  whileIdle(writer: string, send: () => Promise<void>): Promise<boolean>;
  /** The writers of the tabs open now, this one's included. */
  live(): Promise<Set<string>>;
}

const WRITER_LOCK = 'thei:content-history-writer:';

/** The Web Locks of the browser, or nothing outside a secure page. */
function lockManager(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.locks;
}

/** Writers this tab holds: what one of them left is a closed session's. */
const heldHere = new Set<string>();

/**
 * Writers as Web Locks: a tab holds its writer's lock until it closes, and
 * the browser lets it go then, however the tab ended. Without Web Locks
 * every entry is sent, as from a tab that is gone.
 */
export const browserContentHistoryLocks: ContentHistoryWriterLocks = {
  hold(writer) {
    if (heldHere.has(writer)) return;
    heldHere.add(writer);
    void lockManager()
      ?.request(WRITER_LOCK + writer, () => new Promise<never>(() => {}))
      .catch(() => {});
  },
  async whileIdle(writer, send) {
    const locks = lockManager();
    if (!locks || heldHere.has(writer)) {
      await send();
      return true;
    }
    try {
      return await locks.request(
        WRITER_LOCK + writer,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return false;
          await send();
          return true;
        },
      );
    } catch {
      return false;
    }
  },
  async live() {
    const locks = lockManager();
    if (!locks) return new Set(heldHere);
    try {
      const { held = [] } = await locks.query();
      return new Set(
        held.flatMap((lock) =>
          lock.name?.startsWith(WRITER_LOCK)
            ? [lock.name.slice(WRITER_LOCK.length)]
            : [],
        ),
      );
    } catch {
      return new Set(heldHere);
    }
  },
};

/**
 * Sends whatever earlier sessions left unconfirmed, each under the tab that
 * wrote it; what a tab still open holds is left to it. Returns how many
 * entries still hold text the server does not have.
 */
export async function flushContentHistoryBuffers(
  transport: ContentHistoryTransport,
  buffer: ContentHistoryBuffer,
  only?: ContentHistoryField,
  locks: ContentHistoryWriterLocks = browserContentHistoryLocks,
): Promise<number> {
  let remaining = 0;
  for (const listed of buffer.list(only)) {
    // A session still open in this page keeps its own entry up to date.
    if (
      activeBufferKeys.has(contentHistoryBufferKey(listed.field, listed.writer))
    ) {
      remaining++;
      continue;
    }
    let unsent = false;
    const ran = await locks.whileIdle(listed.writer, async () => {
      // Read again under the lock: the list may be older than the entry.
      const entry = buffer.read(listed.field, listed.writer);
      if (!entry) return;
      try {
        for (const write of entry.entries)
          await transport.sync({
            ...entry.field,
            writer: entry.writer,
            data: write.data,
            ...(write.hint ? { hint: write.hint } : {}),
          });
        const current = buffer.read(entry.field, entry.writer);
        if (!current || current.updatedAt === entry.updatedAt)
          buffer.remove(entry.field, entry.writer);
      } catch (error) {
        // The server refused the text itself: sending it again cannot help.
        if (isRefusedWrite(error)) buffer.remove(entry.field, entry.writer);
        else unsent = true;
      }
    });
    // An open tab sends its text itself; until it has, the server lacks it.
    if (!ran || unsent) remaining++;
  }
  return remaining;
}

/**
 * The server refused the write itself, so sending it again cannot help: the
 * text is not one it takes, or its owner was deleted meanwhile (410). A lost
 * session (401, 403) is not a refusal: the text waits for the next one.
 */
export function isRefusedWrite(error: unknown): boolean {
  const status =
    (error as { statusCode?: number } | null)?.statusCode ??
    (error as { status?: number } | null)?.status;
  return status === 400 || status === 410 || status === 413 || status === 422;
}

/** Entries of sessions open in this page, which are theirs to send. */
export const activeBufferKeys = new Set<string>();
