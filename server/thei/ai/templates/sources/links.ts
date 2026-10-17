import { createHash } from 'node:crypto';
import { builtinTemplateId } from '#layers/thei/shared/ai-template';
import { forgetSubjects } from '../coverage';
import {
  scanBrokenLinks,
  type BrokenLink,
} from '../../../content-links/broken';
import { entityText, findEntity, parseRef } from '../../../entity-kinds';
import { brokenLinkText } from '../../../mcp/tools/links';
import type { CheckItem, TemplateSource } from './index';
import { entitiesOf, withSections } from './scope';

/**
 * «Fixing broken links»: the links of the archive's texts that lead nowhere
 * now, forty a run. One mended leads somewhere and is gone from the list; one
 * the model left, unsure where it should lead, waits until something about
 * it changes — its words, where it leads, or the places it could lead to: a
 * heading named like the one it lost comes back to it.
 */

/** How many links one run is given. */
const BATCH = 40;

function itemOf(link: BrokenLink): Omit<CheckItem, 'shown'> | undefined {
  const where = parseRef(link.in.ref);
  const slot = where && entityText(where.kind, link.in.text)?.slot;
  if (!slot) return undefined;
  return {
    subject: `link:${link.in.ref}:${slot}:${link.link.id}`,
    entity: findEntity(link.in.ref),
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify([
          link.link.to,
          link.link.words,
          link.candidates.map((candidate) => candidate.to),
        ]),
      )
      .digest('hex')
      .slice(0, 16),
    parts: [],
  };
}

export const linksSource: TemplateSource = {
  areas: { links: 'links inside texts that lead nowhere now' },

  async due({ scope, covered, busy, force }) {
    const owners = entitiesOf(withSections(scope));
    // A run about files alone has no texts to look in.
    if (owners && !owners.length) return [];
    const batch: CheckItem[] = [];
    const broken = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await scanBrokenLinks({ cursor, limit: 50, owners });
      for (const link of page.links) {
        const item = itemOf(link);
        if (!item) continue;
        broken.add(item.subject);
        if (busy.has(item.subject)) continue;
        if (
          !force &&
          covered.get(item.subject)?.fingerprint === item.fingerprint
        )
          continue;
        batch.push({ ...item, shown: brokenLinkText(link) });
        if (batch.length >= BATCH) return batch;
      }
      cursor = page.next;
    } while (cursor);
    // Every broken link read: what was looked at of one that leads somewhere
    // now, or is gone from its text, is let go.
    if (!owners)
      forgetSubjects(
        builtinTemplateId('links'),
        [...covered.keys()].filter(
          (subject) => subject.startsWith('link:') && !broken.has(subject),
        ),
      );
    return batch;
  },

  brief(batch) {
    return [
      'Mend these links that lead nowhere now, each where it should lead: a renamed heading first — the heading it became — then the place its words mean, read with outline; take a link off only when what it led to is gone and nothing fits, its words kept. A text’s links go as one action: revise, mode relink, each link by its id. A link you cannot place surely, leave, and say why: it comes back once something about it changes.',
      '',
      ...batch.map((item) => item.shown),
    ].join('\n');
  },
};
