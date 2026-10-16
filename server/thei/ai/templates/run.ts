import type { AiEntityType, AiMessagePart } from '#layers/thei/shared/ai';
import { refuse as fail } from '../../entity-patch/text';
import { entityFace, findEntity, refOf } from '../../entity-kinds';
import { sessionModel } from '../model/settings';
import { startTurn } from '../runner/queue';
import {
  createSession,
  insertMessage,
  linkSessionEntities,
} from '../sessions/store';
import { busySubjects, coverageOf, holdBatch } from './coverage';
import { TEMPLATE_SOURCES } from './sources';
import { findTemplate, recordRun } from './store';

/**
 * A built-in check's run. It asks its source what is due — what it has not
 * looked at yet, as it reads now — and only then starts a session, with
 * that and nothing else: with nothing new there is no session and nothing
 * is spent. Run from an entity's ✦ it looks at that entity alone, and may
 * look at it again from the start.
 */

function shortDate(at: number) {
  return new Intl.DateTimeFormat(THEI_SERVER.config.languageCode, {
    day: 'numeric',
    month: 'short',
  }).format(at);
}

export async function runTemplate(
  templateId: string,
  options: {
    /** A run from an entity's ✦: only what belongs to it, by its ref. */
    about?: string;
    /** That entity again from the start, looked at before or not. */
    force?: boolean;
    now?: number;
  } = {},
): Promise<{ sessionUuid: string | null }> {
  const template =
    findTemplate(templateId) ?? fail('There is no such template.');
  const key =
    template.builtin ??
    fail('A ready-made request opens as a new session; it is not run.');
  if (!THEI_SERVER.config.mcp.enabled) fail('AI is off.');
  if (!sessionModel(template.model)) fail('No model is set up to answer.');
  const scope =
    options.about === undefined
      ? undefined
      : (findEntity(options.about) ?? fail('There is no such entity.'));
  if (options.force && !scope)
    fail('Only one entity is checked again from the start.');
  const source = TEMPLATE_SOURCES[key];
  const due = await source.due({
    scope,
    covered: coverageOf(templateId),
    busy: busySubjects(templateId),
    force: options.force,
  });
  if (!due.length) return { sessionUuid: null };

  const now = options.now ?? Date.now();
  const face = scope ? entityFace(scope) : undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const sessionUuid = db.transaction((tx) => {
    // Another run may have taken some of it meanwhile.
    const busy = busySubjects(templateId, tx);
    if (due.every((item) => busy.has(item.subject))) return null;
    const sessionUuid = createSession(
      {
        origin: 'template',
        templateId,
        title: `${template.title} · ${face ? face.title : shortDate(now)}`,
      },
      now,
    );
    const free = holdBatch(tx, schema, templateId, sessionUuid, due);
    const part: AiMessagePart = { type: 'template', templateId };
    insertMessage(
      tx,
      schema,
      sessionUuid,
      {
        role: 'note',
        text: THEI_SERVER.phrase.ai_template_note(template.title, free.length),
        parts: [part],
        transcript: [
          {
            role: 'user',
            text: [
              `The owner started this session from the built-in check «${template.title}»: ${template.instruction}`,
              scope
                ? `It looks at ${refOf(scope)}${face ? ` — ${face.title}` : ''} alone.`
                : 'It looks only at what it has not looked at yet, as it reads now; what did not fit waits for the next run.',
              source.brief(free),
              'End with a short account of what you looked at and proposed — or say plainly that nothing needed it.',
            ].join('\n\n'),
          },
        ],
      },
      now,
    );
    const about = scope
      ? [scope]
      : [
          ...new Map(
            free.flatMap((item) =>
              item.entity
                ? [[`${item.entity.kind}:${item.entity.id}`, item.entity]]
                : [],
            ),
          ).values(),
        ];
    linkSessionEntities(
      tx,
      schema,
      sessionUuid,
      about.map((entity) => ({
        type: entity.kind as AiEntityType,
        id: entity.id,
        role: 'about' as const,
      })),
      now,
    );
    return sessionUuid;
  });
  if (!sessionUuid) return { sessionUuid: null };
  recordRun(templateId, sessionUuid, now);
  startTurn(sessionUuid);
  return { sessionUuid };
}
