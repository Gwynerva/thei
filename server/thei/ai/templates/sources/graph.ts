import { createHash } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import type { ContentOutputData } from '#layers/thei/shared/content';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';
import type { EntityKind } from '../../../entity-kinds';
import { digestLine, loadDocuments } from '../../../mcp/documents';
import { changesBetween } from '../changes';
import type { CheckItem, TemplateSource } from './index';
import { wordsOf } from './proofread';
import { inScope } from './scope';

/**
 * «Relations and links between entities»: the projects, events and diary
 * entries it has not looked over yet, or whose words changed since — eight a
 * run, the latest changed first. What it reads of one is its name, its other
 * names and the words of its texts; relations, their removal and links are
 * what it proposes, so neither a relation applied, which moves the entity's
 * version, nor a link it gained hands the entity back to it.
 */

/** How many entities one run is given. */
const BATCH = 8;

/** The kinds a relation joins, each an area of its own. */
const KINDS: EntityKind[] = ['project', 'event', 'diary-entry'];
const AREAS: Record<string, string> = {
  project: 'projects',
  event: 'events',
  'diary-entry': 'diary entries',
};

/** The words of every text of these kinds, by `kind:id`. */
function textsByOwner(): Map<string, string[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      ownerType: schema.content.ownerType,
      ownerId: schema.content.ownerId,
      slot: schema.content.slot,
      data: schema.content.data,
    })
    .from(schema.content)
    .where(inArray(schema.content.ownerType, KINDS as never[]))
    .all() as {
    ownerType: string;
    ownerId: string;
    slot: string;
    data: ContentOutputData;
  }[];
  const texts = new Map<string, { slot: string; data: ContentOutputData }[]>();
  for (const row of rows) {
    const key = `${row.ownerType}:${row.ownerId}`;
    texts.set(key, [...(texts.get(key) ?? []), row]);
  }
  return new Map(
    [...texts].map(([key, list]) => [
      key,
      list
        .sort((a, b) => a.slot.localeCompare(b.slot))
        .map(
          (text) =>
            `${text.slot}\n${wordsOf(contentToEditMarkdown(text.data))}`,
        ),
    ]),
  );
}

export const graphSource: TemplateSource = {
  areas: AREAS,

  async due({ scope, areas, covered, busy, force }) {
    const documents = new Map(
      loadDocuments(KINDS).map((document) => [
        `${document.kind}:${document.id}`,
        document,
      ]),
    );
    const texts = textsByOwner();
    const batch: CheckItem[] = [];
    for (const change of changesBetween({ from: 0, kinds: KINDS })) {
      if (batch.length >= BATCH) break;
      const id = `${change.key.kind}:${change.key.id}`;
      if (!inScope(scope, change.key)) continue;
      if (areas && !areas.has(change.key.kind)) continue;
      const subject = `entity:${id}`;
      const document = documents.get(id);
      if (!document || busy.has(subject)) continue;
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify([
            document.title,
            document.synonyms ?? [],
            texts.get(id) ?? [],
          ]),
        )
        .digest('hex')
        .slice(0, 16);
      if (!force && covered.get(subject)?.fingerprint === fingerprint) continue;
      batch.push({
        subject,
        entity: change.key,
        fingerprint,
        parts: [],
        shown: digestLine(document),
      });
    }
    return batch;
  },

  brief(batch) {
    return [
      'Look for the relations these entities lack, both ways: from each of them to the rest of the archive, and from the rest of the archive to each. Read their digests and read in full what matters (read_entity), search the archive for what they name, and look at the relations they already have. A relation is the owner’s deliberate claim that two belong together — related, depends on, affects — while a mention in a text is only a link: propose a relation only where the two truly belong together, sure only when it is plain, with why. A relation of theirs without good grounds, or at odds with another, is proposed for removal — relation, op remove, never as sure — with why.',
      'Where a text of theirs names another project, event or diary entry, a project’s section or one of its headings (outline gives them) without a link, propose the link: revise, mode proofread, corrections of category link, every word kept, at its first mention in a part of the text — only where you are sure it belongs. links_in gives the links they have: one plainly wrong — leading somewhere its words do not mean — or redundant, a repeat in its part, is taken off or pointed where it should lead: revise, mode relink, with why. A link is never a reason for a relation, nor a relation for a link. An entity with nothing to add gets nothing.',
      '',
      ...batch.map((item) => item.shown),
    ].join('\n');
  },
};
