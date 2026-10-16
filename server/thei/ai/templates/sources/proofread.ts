import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ContentOutputData } from '#layers/thei/shared/content';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';
import type { AiRevisePart } from '#layers/thei/shared/ai-actions';
import {
  entityFaces,
  entityText,
  entityTextOfSlot,
  type EntityKey,
  type EntityKind,
} from '../../../entity-kinds';
import { readEntity } from '../../../mcp/entities';
import { currentText } from '../../actions/current';
import { targetOf } from '../../actions/rows';
import { isFileKey } from '../../actions/target';
import { backgroundEvent } from '../../runner/background-event';
import type { CheckItem, TemplateSource } from './index';

/**
 * «Fixing text mistakes»: the paragraphs of the archive's texts it has not
 * proofread yet, as they read now — a text by text, the latest changed
 * first, about twelve thousand characters a run. A paragraph is known by its
 * words alone: a link it gained, or one pointed elsewhere, leaves it as
 * proofread, while a word changed hands it back. A fix the owner accepts
 * leaves its paragraph proofread; what the owner changed by hand beside it
 * waits for the next run.
 */

/** About how much text one run is given. */
const BATCH_CHARS = 12_000;

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

/**
 * The words of a paragraph, as proofreading reads them: where a link leads
 * and a block's attributes left out, the spacing set aside.
 */
function wordsOf(paragraph: string): string {
  return paragraph
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function paragraphHash(paragraph: string): string {
  return createHash('sha1')
    .update(wordsOf(paragraph))
    .digest('hex')
    .slice(0, 12);
}

function fingerprintOf(hashes: readonly string[]): string {
  return createHash('sha256')
    .update(hashes.join('|'))
    .digest('hex')
    .slice(0, 16);
}

/** The subject of a text: whose it is and where it is kept. */
function subjectOf(key: Pick<EntityKey, 'kind' | 'id'>, slot: string) {
  return `text:${key.kind}:${key.id}:${slot}`;
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

/** The texts it may read, the latest changed first: of one entity, or all. */
function textsOf(scope: EntityKey | undefined): StoredText[] {
  const { db, schema } = THEI_SERVER.useDb();
  const owners: Pick<EntityKey, 'kind' | 'id'>[] | undefined = scope
    ? [
        scope,
        // A project is read with its sections.
        ...(scope.kind === 'project'
          ? db
              .select({ id: schema.projectContentSections.sectionUuid })
              .from(schema.projectContentSections)
              .where(eq(schema.projectContentSections.projectUuid, scope.id))
              .all()
              .map((row: { id: string }) => ({
                kind: 'project-section' as const,
                id: row.id,
              }))
          : []),
      ]
    : undefined;
  const kinds = owners
    ? [...new Set(owners.map((owner) => owner.kind))]
    : KINDS;
  const rows = db
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
        ...(owners
          ? [
              inArray(
                schema.content.ownerId,
                owners.map((owner) => owner.id),
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
  }[];
  const known = rows.filter((row) => entityTextOfSlot(row.ownerType, row.slot));
  const faces = entityFaces(
    known.map((row) => ({ kind: row.ownerType, id: row.ownerId })),
  );
  return known.flatMap((row) => {
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

export const proofreadSource: TemplateSource = {
  async due({ scope, covered, busy, force }) {
    const picked: {
      text: StoredText;
      subject: string;
      parts: string[];
      hashes: string[];
      given: Set<number>;
    }[] = [];
    let room = BATCH_CHARS;
    for (const text of textsOf(scope)) {
      if (room <= 0) break;
      const subject = subjectOf(text.key, text.slot);
      if (busy.has(subject)) continue;
      const parts = paragraphsOf(text.markdown);
      const hashes = parts.map(paragraphHash);
      const kept = new Set(force ? [] : (covered.get(subject)?.parts ?? []));
      const given = new Set<number>();
      parts.forEach((part, index) => {
        if (kept.has(hashes[index]!)) return;
        // At least one paragraph a run, however long.
        if (room <= 0 || (given.size + picked.length && part.length > room))
          return;
        given.add(index);
        room -= part.length;
      });
      if (given.size) picked.push({ text, subject, parts, hashes, given });
    }
    const about = await aboutTexts([
      ...new Map(
        picked.map(({ text }) => [`${text.key.kind}:${text.key.id}`, text.key]),
      ).values(),
    ]);
    const faces = entityFaces(picked.map(({ text }) => text.key));
    return picked.map(({ text, subject, parts, hashes, given }): CheckItem => {
      const kept = new Set(force ? [] : (covered.get(subject)?.parts ?? []));
      // What it will have proofread: what it had and still reads so, and
      // what it is given now.
      const done = hashes.filter(
        (hash, index) => kept.has(hash) || given.has(index),
      );
      const face = faces.get(`${text.key.kind}:${text.key.id}`);
      return {
        subject,
        entity: text.key,
        fingerprint: fingerprintOf(hashes),
        parts: [...new Set(done)],
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
  },

  brief(batch) {
    return [
      'Proofread these parts of the owner’s texts: local fixes of clear mistakes, in the author’s own voice and words; whatever is a matter of taste, or doubtful, is the owner’s — leave it, or propose it unsure with why. Read revise with describe_actions before you first propose. A text’s fixes go as one action: revise, mode proofread, the text by its name; a find must stand once in the whole text — read the text whole when an excerpt is not enough to be sure. A mention of an entity may become a link at its first mention in a part of the text, as a correction of its own, category link. A text that needs nothing gets nothing.',
      '',
      ...batch.map((item) => item.shown),
    ].join('\n\n');
  },

  coveredBy(action, covered) {
    if (action.kind !== 'revise') return [];
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
    const subject = subjectOf(key, slot);
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
          ...new Set(
            hashes.filter((hash) => kept.has(hash) || mended.has(hash)),
          ),
        ],
        shown: '',
      },
    ];
  },
};
