import { createHash } from 'node:crypto';
import type { EntityKind } from '../../../entity-kinds';
import {
  digestLine,
  loadDocuments,
  type McpDocument,
} from '../../../mcp/documents';
import { changesBetween } from '../changes';
import type { CheckItem, TemplateSource } from './index';
import { inScope } from './scope';

/**
 * «Tag audit»: the projects, events and tags it has not looked over yet, or
 * whose words changed since — ten a run, the latest changed first — each
 * with the tags it carries, or the entities a tag is on. What it reads of
 * one is its name, its other names and its words: tags it adds or takes
 * off are what it proposes, so they hand nothing back to it.
 */

/** How many entities and tags one run is given. */
const BATCH = 10;

/** What carries tags, and the tags themselves, each an area of its own. */
const KINDS: EntityKind[] = ['project', 'event', 'tag'];
const AREAS: Record<string, string> = {
  project: 'projects and the tags they carry',
  event: 'events and the tags they carry',
  tag: 'the tags themselves: whether each is needed',
};

/** How many entities a tag's line names before it counts the rest. */
const USED_BY_SHOWN = 12;

function tagsLine(document: McpDocument, titles: Map<string, string>) {
  if (document.kind === 'tag') {
    const usedBy = document.usedBy ?? [];
    return usedBy.length
      ? `  on ${usedBy.length}: ${usedBy.slice(0, USED_BY_SHOWN).join(', ')}${usedBy.length > USED_BY_SHOWN ? ', …' : ''}`
      : '  on nothing';
  }
  const tags = document.tagRefs ?? [];
  return tags.length
    ? `  tags: ${tags.map((ref) => `${ref} «${titles.get(ref) ?? ref}»`).join(', ')}`
    : '  tags: none';
}

export const tagsSource: TemplateSource = {
  areas: AREAS,
  kinds: KINDS,

  async due({ scope, areas, covered, busy, whole }) {
    const documents = new Map(
      loadDocuments(KINDS).map((document) => [document.ref, document]),
    );
    const titles = new Map(
      [...documents.values()]
        .filter((document) => document.kind === 'tag')
        .map((document) => [document.ref, document.title]),
    );
    const batch: CheckItem[] = [];
    for (const change of changesBetween({ from: 0, kinds: KINDS })) {
      if (!whole && batch.length >= BATCH) break;
      if (!inScope(scope, change.key)) continue;
      if (areas && !areas.has(change.key.kind)) continue;
      const document = documents.get(change.ref);
      const subject = `entity:${change.ref}`;
      if (!document || busy.has(subject)) continue;
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([document.text]))
        .digest('hex')
        .slice(0, 16);
      if (covered.get(subject)?.fingerprint === fingerprint) continue;
      batch.push({
        subject,
        entity: change.key,
        fingerprint,
        parts: [],
        shown: `${digestLine(document)}\n${tagsLine(document, titles)}`,
      });
    }
    return batch;
  },

  brief(batch) {
    return [
      'Audit the tags of these projects and events, and these tags themselves. Tags classify the archive: a tag is a trait several entities surely share, worth following on its own — never one added to have some. Read what matters in full (read_entity), list the tags there are (list_entities, kind tag) and weigh the site’s own suggestions (tag_candidates).',
      '- An entity that lacks a tag that plainly fits it gets it; one that carries a tag that does not fit loses it: tags, add and remove, with why.',
      '- A new tag only for a trait several entities surely share that no tag covers yet: create, entity tag, with a description of what it gathers, then tags on each of them — never for one entity alone.',
      '- A tag that gathers nothing worth following — on one entity or none, or the same as another — is proposed for deletion, never as sure: delete, the tag as the target; its entities moved to the tag it repeats first.',
      '- Diary entries carry no tags. What needs nothing gets nothing.',
      '',
      ...batch.map((item) => item.shown),
    ].join('\n');
  },
};
