import { createHash } from 'node:crypto';
import { and, desc, inArray } from 'drizzle-orm';
import type { ContentOutputData } from '#layers/thei/shared/content';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';
import type { AiRevisePart } from '#layers/thei/shared/ai-actions';
import {
  entityFaces,
  entityText,
  entityTextOfSlot,
  findEntity,
  refOf,
  type EntityKey,
  type EntityKind,
} from '../../../entity-kinds';
import { readEntity } from '../../../mcp/entities';
import { currentText } from '../../actions/current';
import { targetOf } from '../../actions/rows';
import { isFileKey } from '../../actions/target';
import { backgroundEvent } from '../../runner/background-event';
import type { CheckItem, Covered, DueInput, TemplateSource } from './index';
import { inScope, withSections } from './scope';
import { shortTexts, touchedKeys, type ShortText } from './short-texts';

/**
 * «Fixing text mistakes»: whatever the owner typed that it has not
 * proofread yet, as it reads now — the paragraphs of the texts, with the
 * captions and titles of their pictures and files, and every short text
 * beside them: titles, summaries, reminders, the names of dated stretches,
 * status lines, notes on links and relations, the titles and captions of
 * placed files, the owner's name and slogan, a project's button. About
 * twelve thousand characters a run, short texts first, the latest changed
 * first. What is known of a paragraph is its words alone: a link it gained
 * leaves it proofread, a word changed hands it back. A fix the owner accepts
 * leaves what it mended proofread; what the owner changed by hand beside it
 * waits for the next run.
 */

/** About how much text one run is given. */
const BATCH_CHARS = 12_000;

const AREAS = {
  texts:
    'the bodies and notes of diary entries, events, projects, sections and pages, and the owner’s About',
  captions:
    'captions and titles of pictures and files: inside texts, and placed on projects and events',
  titles: 'titles of projects, sections, events, pages and tags',
  summaries: 'summaries, and a tag’s description',
  reminders: 'the owner’s reminders on entities',
  periods:
    'what a dated stretch is called, and the note on how sure its dates are',
  statuses: 'the status lines of the owner and of projects',
  links:
    'the names of and notes on links: to other sites, and link blocks in texts',
  relations: 'the notes on relations',
  profile: 'the owner’s name, nickname and slogan',
  action: 'the words on a project’s button',
};

/** The kinds whose texts it reads. */
const KINDS: EntityKind[] = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
  'profile',
];

/** A text's paragraphs, as editing Markdown parts them: at an empty line. */
function paragraphsOf(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Of a link's address or a block's attributes, the words the owner wrote. */
function ownWords(inside: string, names: readonly string[]) {
  return names
    .flatMap((name) =>
      [...inside.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map(
        (match) => ` ${match[1]}`,
      ),
    )
    .join('');
}

/**
 * The words of a paragraph, as proofreading reads them: a link's words and
 * its note without where it leads, of a block's attributes only the title
 * and the note it shows, the spacing set aside.
 */
function wordsOf(paragraph: string): string {
  return paragraph
    .replace(
      /\[([^\]]*)\]\(([^)]*)\)/g,
      (_, words: string, inside: string) =>
        `${words}${[...inside.matchAll(/"([^"]*)"/g)].map((match) => ` ${match[1]}`).join('')}`,
    )
    .replace(/\{([^}]*)\}/g, (_, inside: string) =>
      ownWords(inside, ['title', 'note']),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The area of a paragraph: a picture, a sound or a file is its caption and
 * title, a link block its note, anything else the text.
 */
function areaOf(paragraph: string) {
  if (/^::(link|card)\b/.test(paragraph)) return 'links';
  return /^:{2,3}(media|audio|file|gallery)\b/.test(paragraph)
    ? 'captions'
    : 'texts';
}

function hashOf(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function paragraphHash(paragraph: string): string {
  return hashOf(wordsOf(paragraph));
}

/** A short text's part: what it is, and its words. */
function shortPart(text: Pick<ShortText, 'key' | 'value'>) {
  return `${text.key}|${hashOf(text.value.replace(/\s+/g, ' ').trim())}`;
}

function fingerprintOf(parts: readonly string[]): string {
  return createHash('sha256')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 16);
}

/** The subject of a text: whose it is and where it is kept. */
function textSubject(key: Pick<EntityKey, 'kind' | 'id'>, slot: string) {
  return `text:${key.kind}:${key.id}:${slot}`;
}

/** The subject of an entity's short texts. */
function shortSubject(key: Pick<EntityKey, 'kind' | 'id'>) {
  return `fields:${key.kind}:${key.id}`;
}

/**
 * Of a text, the paragraphs given, with the one before and after each; the
 * rest left out with a mark.
 */
function excerpt(parts: readonly string[], given: ReadonlySet<number>) {
  const shown = parts.map(
    (_, index) =>
      given.has(index) || given.has(index - 1) || given.has(index + 1),
  );
  const out: string[] = [];
  let skipped = false;
  parts.forEach((part, index) => {
    if (shown[index]) {
      if (skipped) out.push('…');
      skipped = false;
      out.push(part);
    } else skipped = true;
  });
  if (skipped) out.push('…');
  return out.join('\n\n');
}

interface StoredText {
  key: EntityKey;
  slot: string;
  name: string;
  markdown: string;
}

/** The texts it may read, the latest changed first: of the scope, or all. */
function textsOf(scope: readonly EntityKey[] | undefined): StoredText[] {
  const { db, schema } = THEI_SERVER.useDb();
  const kinds = scope
    ? [...new Set(scope.map((key) => key.kind))].filter((kind) =>
        KINDS.includes(kind),
      )
    : KINDS;
  if (!kinds.length) return [];
  const rows = (
    db
      .select({
        ownerType: schema.content.ownerType,
        ownerId: schema.content.ownerId,
        slot: schema.content.slot,
        data: schema.content.data,
      })
      .from(schema.content)
      .where(
        and(
          inArray(schema.content.ownerType, kinds as never[]),
          ...(scope
            ? [
                inArray(
                  schema.content.ownerId,
                  scope.map((key) => key.id),
                ),
              ]
            : []),
        ),
      )
      .orderBy(desc(schema.content.updatedAt))
      .all() as {
      ownerType: EntityKind;
      ownerId: string;
      slot: string;
      data: ContentOutputData;
    }[]
  ).filter(
    (row) =>
      entityTextOfSlot(row.ownerType, row.slot) &&
      inScope(scope, { kind: row.ownerType, id: row.ownerId }),
  );
  const faces = entityFaces(
    rows.map((row) => ({ kind: row.ownerType, id: row.ownerId })),
  );
  return rows.flatMap((row) => {
    const face = faces.get(`${row.ownerType}:${row.ownerId}`);
    if (!face) return [];
    return [
      {
        key: face.key,
        slot: row.slot,
        name: entityTextOfSlot(row.ownerType, row.slot)!.name,
        markdown: contentToEditMarkdown(row.data),
      },
    ];
  });
}

/** What each entity's texts are, said to the model before them. */
async function aboutTexts(keys: readonly EntityKey[]) {
  const context = {
    event: backgroundEvent(),
    // Read as Thei's own model reads.
    principal: { tokenUuid: 'thei', label: 'Thei', scopes: ['read' as const] },
  };
  const about = new Map<string, string>();
  for (const key of keys) {
    const view = await readEntity(key, context).catch(() => undefined);
    for (const text of view?.texts ?? [])
      about.set(`${key.kind}:${key.id}:${text.name}`, text.about);
  }
  return about;
}

/** What a run gives, its pieces counted against one budget. */
class Budget {
  room = BATCH_CHARS;
  taken = 0;
  /** At least one piece a run, however long. */
  fits(length: number) {
    return this.room > 0 && (!this.taken || length <= this.room);
  }
  take(length: number) {
    this.room -= length;
    this.taken++;
  }
}

/** Of the entities' short texts, those not proofread as they read now. */
function shortItems(input: DueInput, budget: Budget): CheckItem[] {
  const { scope, areas, covered, busy, force } = input;
  const entities = [...shortTexts(scope).values()].sort(
    (left, right) => right.at - left.at,
  );
  const faces = entityFaces(entities.map((entity) => entity.key));
  const items: CheckItem[] = [];
  for (const entity of entities) {
    if (budget.room <= 0) break;
    const subject = shortSubject(entity.key);
    if (busy.has(subject)) continue;
    const parts = entity.texts.map(shortPart);
    const kept = new Set(force ? [] : (covered.get(subject)?.parts ?? []));
    const given = entity.texts.filter((text, index) => {
      if (kept.has(parts[index]!)) return false;
      if (areas && !areas.has(text.area)) return false;
      if (!budget.fits(text.value.length)) return false;
      budget.take(text.value.length);
      return true;
    });
    if (!given.length) continue;
    const face = faces.get(`${entity.key.kind}:${entity.key.id}`);
    items.push({
      subject,
      entity: entity.key,
      fingerprint: fingerprintOf(parts),
      parts: entity.texts.flatMap((text, index) =>
        kept.has(parts[index]!) || given.includes(text) ? [parts[index]!] : [],
      ),
      shown: [
        `## ${face?.ref ?? refOf(entity.key)} — ${face?.title ?? ''}: its short texts`,
        ...given.map((text) => `- ${text.label}: «${text.value}»`),
      ].join('\n'),
    });
  }
  return items;
}

/** Of the texts, the paragraphs not proofread as they read now. */
async function textItems(
  input: DueInput,
  budget: Budget,
): Promise<CheckItem[]> {
  const { scope, areas, covered, busy, force } = input;
  const picked: {
    text: StoredText;
    subject: string;
    parts: string[];
    hashes: string[];
    given: Set<number>;
    kept: Set<string>;
  }[] = [];
  for (const text of textsOf(scope)) {
    if (budget.room <= 0) break;
    const subject = textSubject(text.key, text.slot);
    if (busy.has(subject)) continue;
    const parts = paragraphsOf(text.markdown);
    const hashes = parts.map(paragraphHash);
    const kept = new Set(force ? [] : (covered.get(subject)?.parts ?? []));
    const given = new Set<number>();
    parts.forEach((part, index) => {
      if (kept.has(hashes[index]!)) return;
      if (areas && !areas.has(areaOf(part))) return;
      if (!budget.fits(part.length)) return;
      given.add(index);
      budget.take(part.length);
    });
    if (given.size) picked.push({ text, subject, parts, hashes, given, kept });
  }
  const about = await aboutTexts([
    ...new Map(
      picked.map(({ text }) => [`${text.key.kind}:${text.key.id}`, text.key]),
    ).values(),
  ]);
  const faces = entityFaces(picked.map(({ text }) => text.key));
  return picked.map(({ text, subject, parts, hashes, given, kept }) => {
    const face = faces.get(`${text.key.kind}:${text.key.id}`);
    return {
      subject,
      entity: text.key,
      fingerprint: fingerprintOf(hashes),
      // What it will have proofread: what it had and still reads so, and
      // what it is given now.
      parts: [
        ...new Set(
          hashes.filter((hash, index) => kept.has(hash) || given.has(index)),
        ),
      ],
      shown: [
        `## ${face?.ref ?? subject} — ${face?.title ?? ''}, text "${text.name}"`,
        about.get(`${text.key.kind}:${text.key.id}:${text.name}`) ?? '',
        given.size === parts.length
          ? 'All of it, not proofread yet:'
          : 'The paragraphs not proofread yet, with one around each; … marks what is left out:',
        '',
        excerpt(parts, given),
      ]
        .filter((line, index) => line || index > 1)
        .join('\n'),
    };
  });
}

/** What an applied change of short texts leaves proofread, on one entity. */
function shortCovered(
  key: EntityKey,
  touched: (key: string) => boolean,
  covered: (subject: string) => Covered | undefined,
): CheckItem[] {
  const entity = shortTexts([key]).get(`${key.kind}:${key.id}`);
  if (!entity) return [];
  const mended = entity.texts.filter((text) => touched(text.key));
  if (!mended.length) return [];
  const subject = shortSubject(key);
  const parts = entity.texts.map(shortPart);
  const kept = new Set(covered(subject)?.parts ?? []);
  return [
    {
      subject,
      entity: key,
      fingerprint: fingerprintOf(parts),
      parts: entity.texts.flatMap((text, index) =>
        kept.has(parts[index]!) || mended.includes(text) ? [parts[index]!] : [],
      ),
      shown: '',
    },
  ];
}

/** What an accepted proofreading fix in a text leaves proofread. */
function textCovered(
  action: Parameters<NonNullable<TemplateSource['coveredBy']>>[0],
  covered: (subject: string) => Covered | undefined,
): CheckItem[] {
  const payload = action.payload as {
    text: string;
    mode: string;
    parts: AiRevisePart[];
  };
  if (payload.mode !== 'proofread') return [];
  // A text is always an entity's: a file has none.
  const target = targetOf(action);
  const key = isFileKey(target) ? undefined : target;
  const slot = key && entityText(key.kind, payload.text)?.slot;
  const text = key && slot ? currentText(key, payload.text) : undefined;
  if (!key || !slot || !text) return [];
  const applied = new Set(
    ((action.parts ?? []) as { id: string; state: string }[])
      .filter((part) => part.state === 'applied')
      .map((part) => part.id),
  );
  const fixes = payload.parts.flatMap((part) =>
    part.type === 'correction' && applied.has(part.id)
      ? [wordsOf(part.replacePlain)]
      : [],
  );
  if (!fixes.length) return [];
  const parts = paragraphsOf(contentToEditMarkdown(text.data));
  const hashes = parts.map(paragraphHash);
  const subject = textSubject(key, slot);
  const kept = new Set(covered(subject)?.parts ?? []);
  // Only a paragraph a fix stands in is proofread by it.
  const mended = new Set(
    parts.flatMap((part, index) =>
      fixes.some((fix) => fix && wordsOf(part).includes(fix))
        ? [hashes[index]!]
        : [],
    ),
  );
  if (!mended.size) return [];
  return [
    {
      subject,
      entity: key,
      fingerprint: fingerprintOf(hashes),
      parts: [
        ...new Set(hashes.filter((hash) => kept.has(hash) || mended.has(hash))),
      ],
      shown: '',
    },
  ];
}

export const proofreadSource: TemplateSource = {
  areas: AREAS,

  async due(input) {
    const scoped = { ...input, scope: withSections(input.scope) };
    const budget = new Budget();
    const short = shortItems(scoped, budget);
    return [...short, ...(await textItems(scoped, budget))];
  },

  brief(batch) {
    return [
      'Proofread what the owner wrote here: local fixes of clear mistakes, in the author’s own voice and words; whatever is a matter of taste, or doubtful, is the owner’s — leave it, or propose it unsure with why. Read revise with describe_actions before you first propose one.',
      '- A text’s fixes go as one action: revise, mode proofread, the text by its name; a find must stand once in the whole text — read the text whole when an excerpt is not enough to be sure. A caption or a title of a picture or a file in a text is fixed the same way. A mention of an entity may become a link at its first mention in a part of the text, as a correction of its own, category link.',
      '- A short text is fixed on its entity: a title, a summary, a reminder, a tag’s description or the slogan with field; the owner’s name and nickname, a project’s button (actionText) and status lines (statuses [{ id, text }]) with update; dated stretches with periods, the whole list as read_entity gives it; notes on links and relations and the titles and captions of placed files with update, the list whole as read_entity gives it, every item kept.',
      '- A caption takes no full stop when it is one sentence; a title never ends with one. The names an entity is found by, addresses and slugs are not words to fix.',
      '- What needs nothing gets nothing.',
      '',
      ...batch.map((item) => item.shown),
    ].join('\n\n');
  },

  coveredBy(action, covered) {
    if (action.kind === 'revise') return textCovered(action, covered);
    const key = targetOf(action);
    if (!key || isFileKey(key)) return [];
    const touched = touchedKeys(
      action.kind,
      (action.payload ?? {}) as Record<string, unknown>,
    );
    const ends = [key];
    // A relation's note may be read on its other end.
    const other = (action.payload as { other?: unknown } | null)?.other;
    if (action.kind === 'relation' && typeof other === 'string') {
      const end = findEntity(other);
      if (end) ends.push(end);
    }
    return ends.flatMap((end) => shortCovered(end, touched, covered));
  },
};
