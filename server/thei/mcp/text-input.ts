import { eq } from 'drizzle-orm';
import {
  contentInlineLinksFromData,
  isContentEntityType,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import {
  normalizeContentData,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import { isLifeDay } from '#layers/thei/shared/life';
import { parseEditMarkdownToBlocks } from '#layers/thei/shared/content-edit-markdown/parse';
import {
  messageBody,
  type AiMessagePiece,
} from '#layers/thei/shared/ai-message-text';
import { EntityPatchError } from '../entity-patch/text';
import { entityFaces } from '../entity-kinds';

/**
 * What a client writes, made into a text the site can keep: links that name
 * a diary entry by its day get its id, and a link to something that does not
 * exist is refused rather than stored broken.
 */
function diaryIdOf(day: string): string | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ id: schema.diaryEntries.diaryUuid })
    .from(schema.diaryEntries)
    .where(eq(schema.diaryEntries.date, day))
    .get()?.id;
}

/** Names a diary entry by its id wherever a writer named it by its day. */
function resolveDiaryDays(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replace(
      /(data-entity-type="diary-entry" data-entity-id=")(\d{4}-\d{2}-\d{2})(")/g,
      (source, before: string, day: string, after: string) => {
        if (!isLifeDay(day)) return source;
        const id = diaryIdOf(day);
        if (!id)
          throw new EntityPatchError(
            `There is no diary entry on ${day} to link to.`,
          );
        return `${before}${id}${after}`;
      },
    );
  if (Array.isArray(value)) return value.map(resolveDiaryDays);
  if (value && typeof value === 'object') {
    const record = { ...(value as Record<string, unknown>) };
    if (
      record.entityType === 'diary-entry' &&
      typeof record.entityId === 'string' &&
      isLifeDay(record.entityId)
    ) {
      const id = diaryIdOf(record.entityId);
      if (!id)
        throw new EntityPatchError(
          `There is no diary entry on ${record.entityId} to link to.`,
        );
      record.entityId = id;
    }
    for (const key of Object.keys(record))
      if (key !== 'entityId') record[key] = resolveDiaryDays(record[key]);
    return record;
  }
  return value;
}

type EntityLinkRef = { entityType: ContentEntityType; entityId: string };

function entityLinksOf(data: ContentOutputData | null): EntityLinkRef[] {
  if (!data) return [];
  const links: EntityLinkRef[] = [];
  for (const link of contentInlineLinksFromData(data as never))
    if (link.kind === 'entity') links.push(link);
  for (const block of data.blocks) {
    const blockData = block.data as Record<string, unknown>;
    if (
      block.type === 'entityLink' &&
      isContentEntityType(blockData.entityType) &&
      typeof blockData.entityId === 'string'
    )
      links.push({
        entityType: blockData.entityType,
        entityId: blockData.entityId,
      });
  }
  return links;
}

/**
 * Refuses a text that brings in links to things the site does not have.
 * Links the stored text already held are the owner's and pass as they are,
 * broken or not: fixing a typo is no reason to refuse an old link.
 */
async function assertLinksExist(
  data: ContentOutputData,
  previous: ContentOutputData | null,
) {
  const held = new Set(
    entityLinksOf(previous).map(
      (link) => `${link.entityType}:${link.entityId}`,
    ),
  );
  const links = entityLinksOf(data).filter(
    (link) => !held.has(`${link.entityType}:${link.entityId}`),
  );
  if (!links.length) return;
  const found = entityFaces(
    links.map((link) => ({ kind: link.entityType, id: link.entityId })),
  );
  const missing = links.filter(
    (link) => !found.has(`${link.entityType}:${link.entityId}`),
  );
  if (missing.length)
    throw new EntityPatchError(
      `These links lead nowhere: ${missing.map((link) => `thei:${link.entityType}/${link.entityId}`).join(', ')}. Link only to refs you have read.`,
    );
}

/**
 * Inline markup a correction brings in, with diary days named by id and
 * every link checked, ready to be put into a text as it is.
 */
export async function checkedInlineHtml(html: string): Promise<string> {
  const resolved = resolveDiaryDays(html) as string;
  await assertLinksExist(
    { blocks: [{ type: 'paragraph', data: { text: resolved } }] } as never,
    null,
  );
  return resolved;
}

/** A text as stored, from editing Markdown, with what was made of it. */
export async function textFromMarkdown(
  markdown: string,
  previous: ContentOutputData | null,
) {
  const parsed = parseEditMarkdownToBlocks(markdown);
  const data = normalizeContentData({
    blocks: resolveDiaryDays(parsed.blocks) as never,
  });
  await assertLinksExist(data, previous);
  return { data, warnings: parsed.warnings };
}

/**
 * What is said in a session, made into a text to read like any other, with
 * its tables (`shared/ai-message-text.ts`): a diary entry named by its day
 * gets its id where there is one. It is shown, never stored as the owner's,
 * so a link that leads nowhere stays as written rather than refuse the
 * message.
 */
export function messageFromMarkdown(markdown: string): AiMessagePiece[] {
  const resolved = <T>(value: T): T => {
    try {
      return resolveDiaryDays(value) as T;
    } catch {
      return value;
    }
  };
  return messageBody(markdown).map((piece) =>
    piece.kind === 'text'
      ? {
          kind: 'text',
          content: {
            ...piece.content,
            blocks: piece.content.blocks.map(resolved),
          },
        }
      : {
          kind: 'table',
          table: { ...piece.table, rows: piece.table.rows.map(resolved) },
        },
  );
}
