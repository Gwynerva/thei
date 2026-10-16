import type { AiMessagePart } from '#layers/thei/shared/ai';
import {
  templateAwaitsReview,
  type AiTemplateItem,
} from '#layers/thei/shared/ai-template';
import { refuse as fail } from '../../entity-patch/text';
import type { EntityKind } from '../../entity-kinds';
import { sessionModel } from '../model/settings';
import { startTurn } from '../runner/queue';
import { createSession, insertMessage } from '../sessions/store';
import { changesBetween } from './changes';
import { dueTemplates, findTemplate, recordRun } from './store';

/**
 * A template's run: it starts a session with the template's request and
 * lets the model answer. What to read, the model takes from the request; it
 * is told when the template ran before and what in the archive changed
 * since, and may read of an entity it read then only what changed.
 */

/** How often the clock looks for templates whose time has come. */
const CLOCK_MS = 60_000;

const KIND_WORDS: Partial<Record<EntityKind, [string, string]>> = {
  'diary-entry': ['diary entry', 'diary entries'],
  project: ['project', 'projects'],
  'project-section': ['project section', 'project sections'],
  event: ['event', 'events'],
  page: ['page', 'pages'],
  tag: ['tag', 'tags'],
};

/** What changed since a moment, counted by kind: «3 diary entries, 1 project». */
function changedSince(since: number): string {
  const counts = new Map<EntityKind, number>();
  for (const change of changesBetween({ from: since }))
    counts.set(change.kind, (counts.get(change.kind) ?? 0) + 1);
  return [...counts]
    .flatMap(([kind, count]) => {
      const words = KIND_WORDS[kind];
      return words ? [`${count} ${count === 1 ? words[0] : words[1]}`] : [];
    })
    .join(', ');
}

/**
 * The day a run happens on for the owner, `YYYY-MM-DD`: in the time zone
 * their browser or their schedule named, else in UTC.
 */
function ownerDay(now: number, timeZone: string | undefined) {
  const day = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  try {
    return timeZone
      ? { day: day(timeZone), zone: timeZone }
      : { day: day('UTC'), zone: 'UTC' };
  } catch {
    return { day: day('UTC'), zone: 'UTC' };
  }
}

function brief(
  template: AiTemplateItem,
  run: {
    by: 'owner' | 'schedule';
    now: number;
    timeZone?: string;
    since?: number;
  },
) {
  const changed = run.since === undefined ? '' : changedSince(run.since);
  const today = ownerDay(run.now, run.timeZone);
  return [
    `This session was started ${run.by === 'schedule' ? 'by its schedule' : 'by the owner'} from the owner’s template «${template.title}». Its request, in the owner’s words:`,
    '',
    template.instruction,
    '',
    `Today is ${today.day} in the owner’s time zone (${today.zone}).`,
    run.since === undefined
      ? 'The template has not run before.'
      : `The template last ran at ${new Date(run.since).toISOString()}. ${
          changed
            ? `Since then the archive changed: ${changed} — changes_since lists them, from that run on.`
            : 'Nothing in the archive changed since.'
        }`,
    '',
    'Decide from the request what to read, and gather it with the tools, page after page until you have it all:',
    '- what is dated within days — a diary entry by its day, an event or a project stage by its periods: list_entities with its kind, from and to; a stretch of up to 62 days day by day: life_timeline;',
    '- what was made or changed within a time: changes_since, from the run before unless you name from;',
    '- what the request names by its words: search_archive; by a tag: list_entities with tag.',
    `Of an entity this template read before, read_entity with since "${template.templateId}" gives only what changed. With many, read their digests first and read in full what matters. Propose what the request asks for; ask the owner when a choice is theirs. End with a short account of what you read and proposed — or say plainly that there was nothing to do.`,
  ].join('\n');
}

function shortDate(at: number) {
  return new Intl.DateTimeFormat(THEI_SERVER.config.languageCode, {
    day: 'numeric',
    month: 'short',
  }).format(at);
}

export async function runTemplate(
  templateId: string,
  options: {
    now?: number;
    by?: 'owner' | 'schedule';
    /** The owner's time zone, as the browser that started it names it. */
    timeZone?: string;
  } = {},
): Promise<{ sessionUuid: string }> {
  const template =
    findTemplate(templateId) ?? fail('There is no such template.');
  // A ready-made request is the owner's to send, from a new session.
  const schedule =
    template.schedule.kind === 'manual'
      ? fail('A ready-made request opens as a new session; it is not run.')
      : template.schedule;
  if (!THEI_SERVER.config.mcp.enabled) fail('AI is off.');
  if (!sessionModel(template.model)) fail('No model is set up to answer.');
  if (template.lastSession?.state === 'running')
    fail('Its last run is still answering.');
  const now = options.now ?? Date.now();
  const by = options.by ?? 'owner';
  const since = template.lastRunAt;
  const sessionUuid = createSession(
    {
      origin: 'template',
      templateId,
      title: `${template.title} · ${shortDate(now)}`,
    },
    now,
  );
  const part: AiMessagePart = {
    type: 'template',
    templateId,
    by,
    ...(since === undefined ? {} : { since }),
  };
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    insertMessage(
      tx,
      schema,
      sessionUuid,
      {
        role: 'note',
        text: THEI_SERVER.phrase.ai_template_note(
          template.title,
          by === 'schedule',
          since === undefined ? null : shortDate(since),
        ),
        parts: [part],
        transcript: [
          {
            role: 'user',
            text: brief(template, {
              by,
              now,
              since,
              timeZone: options.timeZone ?? schedule.timeZone,
            }),
          },
        ],
      },
      now,
    );
  });
  recordRun(templateId, { at: now, sessionUuid });
  startTurn(sessionUuid);
  return { sessionUuid };
}

/** Runs the templates whose time has come; quiet while AI cannot answer. */
export async function runDueTemplates(now = Date.now()) {
  for (const template of dueTemplates(now)) {
    try {
      if (
        THEI_SERVER.config.mcp.enabled &&
        sessionModel(template.model) &&
        !templateAwaitsReview(template)
      )
        await runTemplate(template.templateId, { now, by: 'schedule' });
      // A run that could not happen — or waits for the last one to be gone
      // through — is not caught up on: the next one is, and it reads from
      // the last run that did.
      else recordRun(template.templateId, { at: now });
    } catch (error) {
      THEI_SERVER.console
        .tag('MCP')
        .error(
          `A template's run failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      recordRun(template.templateId, { at: now });
    }
  }
}

let clock: ReturnType<typeof setInterval> | undefined;

/** Starts looking for templates whose time has come, once a minute. */
export function startTemplateClock() {
  if (clock) return;
  const tick = () =>
    void runDueTemplates().catch(() => {
      THEI_SERVER.console.tag('MCP').error('The template clock failed');
    });
  clock = setInterval(tick, CLOCK_MS);
  clock.unref?.();
  setTimeout(tick, 15_000).unref?.();
}
