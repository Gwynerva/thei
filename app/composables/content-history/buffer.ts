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
 * Sends whatever earlier sessions left unconfirmed, each under the tab that
 * wrote it. Returns how many entries still hold text the server does not
 * have.
 */
export async function flushContentHistoryBuffers(
  transport: ContentHistoryTransport,
  buffer: ContentHistoryBuffer,
  only?: ContentHistoryField,
): Promise<number> {
  let remaining = 0;
  for (const entry of buffer.list(only)) {
    // A session still open in this page keeps its own entry up to date.
    if (
      activeBufferKeys.has(contentHistoryBufferKey(entry.field, entry.writer))
    )
      continue;
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
      else remaining++;
    }
  }
  return remaining;
}

/**
 * The server refused the write itself, so sending it again cannot help. A
 * lost session (401, 403) is not a refusal: the text waits for the next one.
 */
export function isRefusedWrite(error: unknown): boolean {
  const status =
    (error as { statusCode?: number } | null)?.statusCode ??
    (error as { status?: number } | null)?.status;
  return status === 400 || status === 413 || status === 422;
}

/** Entries of sessions open in this page, which are theirs to send. */
export const activeBufferKeys = new Set<string>();
