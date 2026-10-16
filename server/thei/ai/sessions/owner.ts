import { eq } from 'drizzle-orm';
import { createError } from 'h3';
import type { AiEntityType, AiMessagePart } from '#layers/thei/shared/ai';
import { isPresetTemplate } from '#layers/thei/shared/ai-template';
import { findTemplate } from '../templates/store';
import { findEntity, refOf, type EntityKey } from '../../entity-kinds';
import { actionDef } from '../actions/registry';
import { findAction, targetOf } from '../actions/rows';
import { startTurn } from '../runner/queue';
import { publishSession } from './bus';
import {
  createSession,
  findMessage,
  findSession,
  insertMessage,
  linkSessionEntities,
  refreshSessionCounts,
} from './store';
import { cleanSessionTitle, titleFromWords } from './names';
import { placeSessionFiles, sessionFilesNote, sessionFilesOf } from './files';
import { sessionAnswerable } from './view';

/**
 * What the owner does in sessions: starts one about something, writes in
 * it, answers a question, comments on an action. A session the site's model
 * answers is answered at once; in an app's, the app reads it next time.
 */

const MESSAGE_MAX = 20_000;

function refused(message: string): never {
  throw createError({ statusCode: 400, message });
}

/** The entities a message names: links to them, as the composer makes them. */
export function mentionedIn(text: string): EntityKey[] {
  const found = new Map<string, EntityKey>();
  for (const match of text.matchAll(/\(thei:([a-z-]+)\/([^)\s]+)\)/g)) {
    const key = findEntity(`${match[1]}:${match[2]}`);
    if (key) found.set(refOf(key), key);
  }
  return [...found.values()];
}

function keysOf(refs: unknown): EntityKey[] {
  if (!Array.isArray(refs)) return [];
  return refs.flatMap((ref) => {
    const key = typeof ref === 'string' ? findEntity(ref) : undefined;
    return key ? [key] : [];
  });
}

export interface OwnerMessage {
  text: string;
  /** Entities attached besides those named in the text, as refs. */
  about?: unknown;
  /** Files of the library brought along, as `{ assetUuid, name }`. */
  files?: unknown;
  /** The message whose question this answers. */
  answers?: string;
  /** The action this comments on: a new version of it is due. */
  comment?: string;
}

/**
 * Adds the owner's message to a session and has the model answer it, where
 * the model answers. Returns the message's id.
 */
export function postOwnerMessage(
  sessionUuid: string,
  message: OwnerMessage,
  now = Date.now(),
): string {
  const session = findSession(sessionUuid);
  if (!session || session.purgedAt)
    throw createError({ statusCode: 404, message: 'No such session' });
  if (session.archivedAt || session.closedAt)
    refused('The session is archived: bring it back to write in it');
  const text = message.text.trim();
  const files = sessionFilesOf(message.files);
  if (!text && !files.length) refused('A message needs words or files');
  if (text.length > MESSAGE_MAX) refused('The message is too long');

  const about = [...mentionedIn(text), ...keysOf(message.about)];
  const parts: AiMessagePart[] = [];
  let said = text;
  let question: { messageUuid: string; parts: AiMessagePart[] } | undefined;
  if (message.answers) {
    const asked = findMessage(message.answers);
    const index =
      asked?.sessionUuid === sessionUuid
        ? asked.parts.findIndex(
            (part) => part.type === 'question' && !part.answer,
          )
        : -1;
    if (!asked || index === -1) refused('There is no open question there');
    const part = asked.parts[index] as Extract<
      AiMessagePart,
      { type: 'question' }
    >;
    question = {
      messageUuid: asked.messageUuid,
      parts: asked.parts.map((item, at) =>
        at === index ? { ...part, answer: text } : item,
      ),
    };
    said = `My answer to “${part.text}”: ${text}`;
  }
  if (message.comment) {
    const action = findAction(message.comment);
    if (!action || action.sessionUuid !== sessionUuid)
      refused('There is no such action in this session');
    parts.push({ type: 'comment', actionUuid: action.actionUuid });
    const target = targetOf(action);
    said = `About ${action.actionUuid} (${action.kind}${target ? ` on ${refOf(target)}` : ''}: ${actionDef(action.kind).summary(action.payload as never)}): ${text}`;
  }
  for (const file of files) parts.push({ type: 'file', ...file });
  said = [said, sessionFilesNote(files)].filter(Boolean).join('\n\n');

  const { db, schema } = THEI_SERVER.useDb();
  const row = db.transaction((tx) => {
    if (question)
      tx.update(schema.aiMessages)
        .set({ parts: question.parts })
        .where(eq(schema.aiMessages.messageUuid, question.messageUuid))
        .run();
    const inserted = insertMessage(
      tx,
      schema,
      sessionUuid,
      {
        role: 'owner',
        text,
        parts,
        transcript: [
          {
            role: 'user',
            text: said,
            ...(files.length
              ? { files: files.map((file) => file.assetUuid) }
              : {}),
          },
        ],
      },
      now,
    );
    placeSessionFiles(
      tx,
      schema,
      sessionUuid,
      files.map((file) => file.assetUuid),
      now,
    );
    linkSessionEntities(
      tx,
      schema,
      sessionUuid,
      about.map((key) => ({
        type: key.kind as AiEntityType,
        id: key.id,
        role: 'about' as const,
      })),
      now,
    );
    refreshSessionCounts(tx, schema, sessionUuid);
    return inserted;
  });
  if (question)
    publishSession(sessionUuid, {
      type: 'message',
      messageUuid: question.messageUuid,
    });
  publishSession(sessionUuid, {
    type: 'message',
    messageUuid: row.messageUuid,
  });
  publishSession(sessionUuid, { type: 'session' });
  if (sessionAnswerable(findSession(sessionUuid)!)) startTurn(sessionUuid);
  return row.messageUuid;
}

/** A template the owner may start a session from: one without a schedule. */
function presetOf(templateId: unknown) {
  const template =
    typeof templateId === 'string' ? findTemplate(templateId) : undefined;
  if (!template || !isPresetTemplate(template))
    refused('There is no such ready-made request.');
  return template;
}

/** Starts a session of the owner's, about what they name, with their first words. */
export function startOwnerSession(
  input: {
    title?: string;
    about?: unknown;
    text?: string;
    files?: unknown;
    /** The ready-made request the words began from, if any. */
    templateId?: unknown;
  },
  now = Date.now(),
): string {
  // The files are checked before a session is made for them.
  sessionFilesOf(input.files);
  const template =
    input.templateId === undefined || input.templateId === null
      ? undefined
      : presetOf(input.templateId);
  const given = cleanSessionTitle(input.title ?? '');
  const sessionUuid = createSession(
    {
      origin: 'owner',
      title: given || template?.title || titleFromWords(input.text ?? ''),
      ...(template ? { templateId: template.templateId } : {}),
    },
    now,
  );
  const about = keysOf(input.about);
  if (about.length) {
    const { db, schema } = THEI_SERVER.useDb();
    db.transaction((tx) =>
      linkSessionEntities(
        tx,
        schema,
        sessionUuid,
        about.map((key) => ({
          type: key.kind as AiEntityType,
          id: key.id,
          role: 'about' as const,
        })),
        now,
      ),
    );
  }
  if (input.text?.trim() || (Array.isArray(input.files) && input.files.length))
    postOwnerMessage(
      sessionUuid,
      { text: input.text ?? '', files: input.files },
      now,
    );
  return sessionUuid;
}
