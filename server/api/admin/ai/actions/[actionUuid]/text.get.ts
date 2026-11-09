import type { AiReviewText } from '#layers/thei/shared/ai';
import { writtenTexts } from '#layers/thei/shared/ai-action-texts';
import { requireAiOn } from '../../../../../thei/ai-on';
import { writtenText } from '../../../../../thei/ai/actions/kinds/text';
import { findAction } from '../../../../../thei/ai/actions/rows';
import { actionItems } from '../../../../../thei/ai/sessions/view';
import {
  findSession,
  sessionName,
} from '../../../../../thei/ai/sessions/store';
import {
  buildContentFieldValue,
  findContentByOwner,
  hydrateContentData,
} from '../../../../../thei/content/repository';
import { entityText, findEntity } from '../../../../../thei/entity-kinds';
import { textFromMarkdown } from '../../../../../thei/mcp/text-input';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * A text edit with the text it is about as the editor reads it — its files
 * and links filled in — for the screen it is gone through on; or a text
 * written whole, a new entity's texts among them, with each as it would
 * stand.
 */
export default defineEventHandler(async (event): Promise<AiReviewText> => {
  requireAiOn();
  markReadOnlyRequest(event);
  const row = findAction(getRouterParam(event, 'actionUuid') ?? '');
  if (!row) throw createError({ statusCode: 404 });
  const reviewed =
    row.kind === 'revise'
      ? await editedText(row)
      : row.kind === 'write'
        ? await writeText(row)
        : row.kind === 'create'
          ? await createdTexts(row)
          : undefined;
  if (!reviewed) throw createError({ statusCode: 404 });
  const session = findSession(row.sessionUuid);
  const [action] = await actionItems([row]);
  return {
    action: action!,
    ...reviewed,
    ...(session
      ? {
          session: {
            sessionUuid: session.sessionUuid,
            // An app's session goes by the app's name until it has a title.
            title: sessionName(session),
          },
        }
      : {}),
  };
});

type Row = NonNullable<ReturnType<typeof findAction>>;
type Reviewed = Pick<AiReviewText, 'data' | 'written'>;

/** The stored text an action is about, and where it is kept. */
function textOf(row: Row) {
  if (!row.targetType || !row.targetId) return undefined;
  const key = findEntity(`${row.targetType}:${row.targetId}`);
  const text = key
    ? entityText(key.kind, (row.payload as { text?: string }).text)
    : undefined;
  return key && text ? { key, slot: text.slot } : undefined;
}

async function editedText(row: Row): Promise<Reviewed | undefined> {
  const text = textOf(row);
  if (!text) return undefined;
  const field = await buildContentFieldValue(
    text.key.kind as never,
    text.key.id,
    text.slot,
  );
  return { data: field?.data ?? { blocks: [] } };
}

/** The text as it is, and as the written one would leave it. */
async function writeText(row: Row): Promise<Reviewed | undefined> {
  const text = textOf(row);
  if (!text) return undefined;
  const payload = row.payload as {
    mode: 'new' | 'append' | 'replace';
    markdown: string;
  };
  const stored = await findContentByOwner(
    text.key.kind as never,
    text.key.id,
    text.slot,
  );
  const [written] = writtenTexts(row.kind, row.payload);
  if (!written) return undefined;
  return {
    data: stored ? await hydrateContentData(stored.data) : { blocks: [] },
    written: [
      {
        key: written.key,
        proposed: await hydrateContentData(
          await writtenText(stored?.data, payload),
        ),
      },
    ],
  };
}

/** Each text a new entity is written with, as it would stand. */
async function createdTexts(row: Row): Promise<Reviewed | undefined> {
  const texts = writtenTexts(row.kind, row.payload);
  if (!texts.length) return undefined;
  const sections = ((row.payload as { fields?: { sections?: unknown } }).fields
    ?.sections ?? []) as { title?: unknown }[];
  return {
    data: { blocks: [] },
    written: await Promise.all(
      texts.map(async (text) => {
        const title = sections[text.section ?? -1]?.title;
        return {
          key: text.key,
          ...(text.section === undefined
            ? { field: text.field }
            : { section: typeof title === 'string' ? title : '' }),
          proposed: await hydrateContentData(
            (await textFromMarkdown(text.value, null)).data,
          ),
        };
      }),
    ),
  };
}
