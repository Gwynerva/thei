import type { AiEntityType, AiMessagePart } from '#layers/thei/shared/ai';
import { refuse as fail } from '../../entity-patch/text';
import {
  entityFace,
  findEntity,
  refOf,
  type EntityKey,
} from '../../entity-kinds';
import { sessionModel } from '../model/settings';
import { startTurn } from '../runner/queue';
import {
  createSession,
  insertMessage,
  linkSessionEntities,
} from '../sessions/store';
import { CHECK_BATCH_TOOL } from '../../mcp/tools/checks';
import { busySubjects, coverageOf, holdBatch } from './coverage';
import { TEMPLATE_SOURCES, type CheckItem } from './sources';
import { findTemplate, recordRun } from './store';

/**
 * A built-in check's run. It asks its source what is due — what it has not
 * looked at yet, as it reads now — and only then starts a session, so with
 * nothing new no session starts and nothing is spent. The entities the run
 * is about — the one of a ✦, those the owner names — bound it; the owner's
 * own words, beyond the check's, narrow it further: the model reads them
 * and asks for what they name with `check_batch`, and is given only what of
 * that is due. Without them, the run is given its batch at once.
 */

/** A request's words alone: mentions, marks and spacing aside. */
function plainWords(markdown: string) {
  return markdown
    .replace(/\[([^\]]*)\]\(thei:[^)]*\)/g, ' ')
    .replace(/[*_`#>~\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function shortDate(at: number) {
  return new Intl.DateTimeFormat(THEI_SERVER.config.languageCode, {
    day: 'numeric',
    month: 'short',
  }).format(at);
}

/** The entities a run is about, by their refs; one gone is refused. */
function scopeOf(about: readonly string[] | undefined) {
  if (!about?.length) return undefined;
  return [...new Set(about)].map(
    (ref) => findEntity(ref) ?? fail(`There is no entity ${ref}.`),
  );
}

export async function runTemplate(
  templateId: string,
  options: {
    /** Only what belongs to these entities, by their refs. */
    about?: readonly string[];
    /** The owner's words the run was asked with, editing Markdown. */
    request?: string;
    /** The entities again from the start, looked at before or not. */
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
  const scope = scopeOf(options.about);
  if (options.force && !scope)
    fail('Only the entities named are checked again from the start.');
  const source = TEMPLATE_SOURCES[key];
  const request = options.request?.trim() ?? '';
  const worded =
    plainWords(request) !== '' &&
    plainWords(request) !== plainWords(template.instruction);
  const due = await source.due({
    scope,
    covered: coverageOf(templateId),
    busy: busySubjects(templateId),
    force: options.force,
  });
  if (!due.length) return { sessionUuid: null };

  const now = options.now ?? Date.now();
  const faces = (scope ?? []).flatMap((item) => entityFace(item) ?? []);
  const { db, schema } = THEI_SERVER.useDb();
  const sessionUuid = db.transaction((tx) => {
    // Another run may have taken some of it meanwhile.
    const busy = busySubjects(templateId, tx);
    if (due.every((item) => busy.has(item.subject))) return null;
    const sessionUuid = createSession(
      {
        origin: 'template',
        templateId,
        title: `${template.title} · ${
          faces.length
            ? `${faces[0]!.title}${faces.length > 1 ? ' …' : ''}`
            : shortDate(now)
        }`,
      },
      now,
    );
    // A worded run is given its batch when its model asks for it.
    const free = worded
      ? []
      : holdBatch(tx, schema, templateId, sessionUuid, due);
    const part: AiMessagePart = {
      type: 'template',
      templateId,
      ...(scope ? { scope: scope.map(refOf) } : {}),
      ...(options.force ? { force: true } : {}),
    };
    insertMessage(
      tx,
      schema,
      sessionUuid,
      {
        role: 'note',
        text: THEI_SERVER.phrase.ai_template_note(
          template.title,
          worded ? null : free.length,
        ),
        parts: [part],
        transcript: [
          {
            role: 'user',
            text: brief(template, key, {
              scope,
              faces,
              request: worded ? request : undefined,
              batch: free,
            }),
          },
        ],
      },
      now,
    );
    const about: EntityKey[] = scope ?? [
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

/** What a run's model is asked, in English. */
function brief(
  template: { title: string; instruction: string },
  key: keyof typeof TEMPLATE_SOURCES,
  run: {
    scope: EntityKey[] | undefined;
    faces: { ref: string; title: string }[];
    request: string | undefined;
    batch: readonly CheckItem[];
  },
) {
  const source = TEMPLATE_SOURCES[key];
  const about = run.faces.length
    ? `It looks only at ${run.faces.map((face) => `${face.ref} — ${face.title}`).join('; ')}.`
    : 'It looks only at what it has not looked at yet, as it reads now; what did not fit waits for the next run.';
  if (!run.request)
    return [
      `The owner started this session from the built-in check «${template.title}»: ${template.instruction}`,
      about,
      source.brief(run.batch),
      'End with a short account of what you looked at and proposed — or say plainly that nothing needed it.',
    ].join('\n\n');
  return [
    `The owner started this session from the built-in check «${template.title}» — ${template.instruction} — and asked, in their own words:`,
    run.request,
    about,
    `What this check looks at, by area:\n${Object.entries(source.areas)
      .map(([area, what]) => `- ${area}: ${what}`)
      .join('\n')}`,
    `First call ${CHECK_BATCH_TOOL} with the areas — and the entities, by ref — the owner's words ask for; leave out what they do not narrow. It gives you what of that is due: only what this check has not looked at yet, as it reads now. Then do as the check says below with what it gives you, and nothing beyond what the owner asked. When the words ask for nothing this check looks at, say so and stop.`,
    source.brief([]),
    'End with a short account of what you looked at and proposed — or say plainly that nothing needed it.',
  ].join('\n\n');
}
