import type { AiEntityType, AiMessagePart } from '#layers/thei/shared/ai';
import type { AiTemplateRunResponse } from '#layers/thei/shared/ai-template';
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
  findSession,
  insertMessage,
  linkSessionEntities,
} from '../sessions/store';
import { CHECK_BATCH_TOOL } from '../../mcp/tools/checks';
import {
  busySubjects,
  coverageOf,
  coveredSince,
  forgetAll,
  forgetSubjects,
  holdBatch,
  lastAsked,
} from './coverage';
import { TEMPLATE_SOURCES, type CheckItem } from './sources';
import { findTemplate, recordRun } from './store';
import { dueNext, withdrawContinue } from './continue';
import { postOwnerMessage } from '../sessions/owner';

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
    /**
     * Over the whole archive, all it looked at is forgotten first: it looks
     * at everything again, from the start, a run's worth at a time.
     */
    again?: boolean;
    now?: number;
  } = {},
): Promise<AiTemplateRunResponse> {
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
  if (options.again && !scope) forgetAll(templateId);
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
  // Nothing new: how much it has looked at, and where it last looked, for
  // the owner to see what it found — or to have it look again.
  if (!due.length) {
    const last = template.lastSession;
    return {
      sessionUuid: null,
      ...(scope ? {} : { looked: coveredSince(templateId, 0) }),
      ...(last
        ? {
            lastSessionUuid: last.sessionUuid,
            // What waits in an archived session counts nowhere.
            lastWaiting: last.archived ? 0 : last.waiting,
          }
        : {}),
    };
  }

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
    const transcript = [
      {
        role: 'user' as const,
        text: brief(template, key, {
          scope,
          faces,
          request: worded ? request : undefined,
          batch: free,
        }),
      },
    ];
    // Sent with words from a composer, the run is the owner's message, as
    // written, marked as begun from the check; run with none — from the
    // templates' table — a note says it was started.
    insertMessage(
      tx,
      schema,
      sessionUuid,
      request
        ? { role: 'owner', text: request, parts: [part], transcript }
        : {
            role: 'note',
            text: THEI_SERVER.phrase.ai_template_note(
              template.title,
              free.length,
            ),
            parts: [part],
            transcript,
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
    `The built-in check «${template.title}» asks: ${template.instruction}`,
    'The owner started this session from it and wrote, in their own words — the check’s request with whatever they added or changed. Do all of what they wrote: what to look at, how much, and how.',
    run.request,
    about,
    `What this check looks at, by area:\n${Object.entries(source.areas)
      .map(([area, what]) => `- ${area}: ${what}`)
      .join('\n')}`,
    `First call ${CHECK_BATCH_TOOL} with the areas — and the entities and files, by ref — the owner's words ask for; leave out what they do not narrow. It gives you what of that is due: only what this check has not looked at yet, as it reads now. Then do with it what the check says below and what the owner's words say. When they ask for more than one batch — a number, or all of it — call it again for the next batch once you have proposed for this one, until it says nothing is due or what they asked for is done. When the words ask for nothing this check looks at, say so and stop.`,
    source.brief([]),
    CHECK_END,
  ].join('\n\n');
}

/**
 * The owner goes on with a check's run from its «go on»: the next batch of
 * what its model last asked for — the same areas, the same entities. The
 * owner's message says only that; the model is told what to do. Answers
 * the message's id, or none when nothing is due any more.
 */
export async function continueRun(
  sessionUuid: string,
): Promise<{ messageUuid: string | null }> {
  const session = findSession(sessionUuid);
  if (!session || session.origin !== 'template')
    fail('Only a check’s run goes on.');
  if (session.archivedAt || session.closedAt)
    fail('The session is archived: bring it back to write in it');
  if (session.state === 'running') fail('The session is answering already.');
  const template = session.templateId
    ? findTemplate(session.templateId)
    : undefined;
  if (!template?.builtin) fail('There is no such template.');
  const next = await dueNext(sessionUuid);
  withdrawContinue(sessionUuid);
  if (!next) return { messageUuid: null };
  const ask = lastAsked(sessionUuid);
  const words = THEI_SERVER.phrase.ai_continue_text;
  const narrowed = [
    ask?.areas?.length ? `the areas ${ask.areas.join(', ')}` : '',
    ask?.refs?.length ? `the refs ${ask.refs.join(', ')}` : '',
    ask?.count ? `count ${next.next}` : '',
  ]
    .filter(Boolean)
    .join(' and ');
  const messageUuid = postOwnerMessage(sessionUuid, {
    text: words,
    brief: `${words}\n\n(Thei: the owner goes on with the check «${template.title}». Call ${CHECK_BATCH_TOOL} once${narrowed ? ` with ${narrowed}` : ''} for the next batch and do with it as before. Only that batch: the owner asked for ${next.next} more, as the button they pressed said.)`,
  });
  return { messageUuid };
}
