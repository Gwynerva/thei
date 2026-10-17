import type { AiEntityType, AiMessagePart } from '#layers/thei/shared/ai';
import { refuse as fail } from '../../entity-patch/text';
import { entityFace } from '../../entity-kinds';
import {
  findTarget,
  isFileKey,
  targetRef,
  type ActionTarget,
} from '../actions/target';
import { libraryFile } from '../sessions/files';
import { sessionModel } from '../model/settings';
import { startTurn } from '../runner/queue';
import {
  createSession,
  insertMessage,
  linkSessionEntities,
} from '../sessions/store';
import { CHECK_BATCH_TOOL } from '../../mcp/tools/checks';
import {
  busySubjects,
  coverageOf,
  forgetSubjects,
  holdBatch,
} from './coverage';
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

/** The entities and files a run is about, by their refs; one gone is refused. */
function scopeOf(about: readonly string[] | undefined) {
  if (!about?.length) return undefined;
  return [...new Set(about)].map(
    (ref) => findTarget(ref) ?? fail(`There is no entity ${ref}.`),
  );
}

/** What a run is about, as its session's title and its model name it. */
function faceOf(key: ActionTarget) {
  if (!isFileKey(key)) return entityFace(key);
  const file = libraryFile(key.id);
  return file && { ref: targetRef(key), title: file.slug };
}

export async function runTemplate(
  templateId: string,
  options: {
    /** Only what belongs to these entities and files, by their refs. */
    about?: readonly string[];
    /** The owner's words the run was asked with, editing Markdown. */
    request?: string;
    /** The model chosen for its session; none for the connection's. */
    model?: string;
    now?: number;
  } = {},
): Promise<{ sessionUuid: string | null }> {
  const template =
    findTemplate(templateId) ?? fail('There is no such template.');
  const key =
    template.builtin ??
    fail('A ready-made request opens as a new session; it is not run.');
  if (!THEI_SERVER.config.mcp.enabled) fail('AI is off.');
  if (!sessionModel(options.model)) fail('No model is set up to answer.');
  const scope = scopeOf(options.about);
  const source = TEMPLATE_SOURCES[key];
  const request = options.request?.trim() ?? '';
  const worded =
    plainWords(request) !== '' &&
    plainWords(request) !== plainWords(template.instruction);
  const dueNow = () =>
    source.due({
      scope,
      covered: coverageOf(templateId),
      busy: busySubjects(templateId),
    });
  let due = await dueNow();
  // Entities the owner chose, all of them looked at already, are looked at
  // again from the start: what was looked at of them is let go, and the
  // runs go over them as over anything new, a run's worth at a time. The
  // whole archive is only ever looked at for what is new.
  if (!due.length && scope) {
    const every = await source.due({
      scope,
      covered: new Map(),
      busy: new Set(),
      whole: true,
    });
    const busy = busySubjects(templateId);
    if (every.length && !every.some((item) => busy.has(item.subject))) {
      forgetSubjects(
        templateId,
        every.map((item) => item.subject),
      );
      due = await dueNow();
    }
  }
  if (!due.length) return { sessionUuid: null };

  const now = options.now ?? Date.now();
  const faces = (scope ?? []).flatMap((item) => faceOf(item) ?? []);
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
        ...(options.model?.trim()
          ? { model: options.model.trim().slice(0, 200) }
          : {}),
      },
      now,
    );
    // A worded run is given its batch when its model asks for it.
    const free = worded
      ? []
      : holdBatch(tx, schema, templateId, sessionUuid, due, now);
    const part: AiMessagePart = {
      type: 'template',
      templateId,
      ...(scope ? { scope: scope.map(targetRef) } : {}),
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
    // What it is about: what the owner named; what it is given is linked as
    // it is given (`holdBatch`).
    linkSessionEntities(
      tx,
      schema,
      sessionUuid,
      (scope ?? []).map((entity) => ({
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

/**
 * How a check's answer ends: what the cards under it cannot say. Each
 * proposal is a card with what it changes and why, so retold in words it
 * only doubles the page.
 */
const CHECK_END =
  'End with a sentence or two: how much you looked at, what you left aside and why — never what a proposal says, which its card shows — or say plainly that nothing needed it.';

/** What a run's model is asked, in English. */
function brief(
  template: { title: string; instruction: string },
  key: keyof typeof TEMPLATE_SOURCES,
  run: {
    scope: ActionTarget[] | undefined;
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
      CHECK_END,
    ].join('\n\n');
  return [
    `The owner started this session from the built-in check «${template.title}» — ${template.instruction} — and asked, in their own words:`,
    run.request,
    about,
    `What this check looks at, by area:\n${Object.entries(source.areas)
      .map(([area, what]) => `- ${area}: ${what}`)
      .join('\n')}`,
    `First call ${CHECK_BATCH_TOOL} with the areas — and the entities and files, by ref — the owner's words ask for; leave out what they do not narrow. It gives you what of that is due: only what this check has not looked at yet, as it reads now. Then do as the check says below with what it gives you, and nothing beyond what the owner asked. When the words ask for nothing this check looks at, say so and stop.`,
    source.brief([]),
    CHECK_END,
  ].join('\n\n');
}
