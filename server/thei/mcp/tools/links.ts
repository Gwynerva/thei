import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { isContentEntityType } from '#layers/thei/shared/content-link';
import { entityOutline } from '../../content-links/anchors';
import {
  entityLinks,
  scanBrokenLinks,
  type BrokenLink,
} from '../../content-links/broken';
import { READS } from '../annotations';
import type { McpCallContext } from '../context';
import { resolveRef } from '../entities';
import { guardTool, McpToolError, toolResult } from '../result';

const PROBLEMS = {
  'entity-gone': 'what it led to is gone',
  'heading-gone': 'the heading it led to is gone',
} as const;

/** A broken link as a model is told of it: where it stands, where it may lead. */
export function brokenLinkText(item: BrokenLink): string {
  return [
    `- In ${item.in.ref} «${item.in.title}», ${item.in.text}: link ${item.link.id}${item.link.kind === 'card' ? ' (a link block)' : ` «${item.link.words}»`} → ${item.link.to}: ${PROBLEMS[item.problem]}${item.named ? ` (it named «${item.named}»)` : ''}${item.link.private ? '; in a private part' : ''}.`,
    `  May lead instead: ${item.candidates
      .map(
        (candidate) =>
          `${candidate.to ?? 'no link, the words kept'} (${candidate.why}${candidate.to ? `: ${candidate.title}` : ''})`,
      )
      .join('; ')}`,
  ].join('\n');
}

/**
 * The places inside an entity a link may lead to, its links, and the links
 * of the archive that lead nowhere now, with where each may lead instead.
 * All read; a link is mended or taken off with `propose` — revise, mode
 * relink.
 */
export function registerLinkTools(server: McpServer, _context: McpCallContext) {
  server.registerTool(
    'outline',
    {
      title: 'Where a link may lead inside an entity',
      description:
        'The headings of the text an entity’s page shows, each with the ' +
        'anchor a link names after # (thei:<kind>/<id>#<anchor>), and for a ' +
        'project its sections, each a ref of its own with its headings.',
      inputSchema: z.object({
        ref: z.string().describe('project:<id>, project-section:<id>, …'),
      }),
      annotations: READS,
    },
    ({ ref }) =>
      guardTool(async () => {
        const key = resolveRef(ref);
        if (!isContentEntityType(key.kind))
          throw new McpToolError('Only an entity of the site is linked to.');
        const outline = await entityOutline(key.kind, key.id);
        if (!outline) throw new McpToolError(`Nothing found for ${ref}.`);
        const lines = [
          `${ref} — ${outline.title}`,
          ...outline.headings.map(
            (heading) =>
              `${heading.level === 3 ? '    ' : '  '}#${heading.id} — ${heading.title}${heading.private ? ' (private)' : ''}`,
          ),
          ...(outline.sections ?? []).map(
            (section) =>
              `  section project-section:${section.entityId} — ${section.title}${section.stage ? ` (stage ${section.stage.number} of ${section.stage.count})` : ''}`,
          ),
        ];
        return toolResult(lines.join('\n'));
      }),
  );

  server.registerTool(
    'links_in',
    {
      title: 'The links of an entity',
      description:
        'Every link of an entity’s texts to the site’s own entities, in the ' +
        'order they stand, each by its id with where it leads, whether it ' +
        'leads nowhere, and whether it repeats a link to the same entity ' +
        'earlier in its part of the text — a part links an entity once. A ' +
        'link is pointed elsewhere or taken off with propose: revise, mode ' +
        'relink.',
      inputSchema: z.object({
        ref: z
          .string()
          .describe('project:<id>, event:<id>, diary-entry:<day>, …'),
      }),
      annotations: READS,
    },
    ({ ref }) =>
      guardTool(async () => {
        const key = resolveRef(ref);
        const links = await entityLinks(key);
        if (!links.length) return toolResult(`${ref} links nowhere.`);
        return toolResult(
          links
            .map(
              (link) =>
                `- ${link.text}: link ${link.id}${link.kind === 'card' ? ' (a link block)' : ` «${link.words}»`} → ${link.to}${link.title ? ` (${link.title})` : ''}${link.problem ? `: ${PROBLEMS[link.problem]}` : ''}${link.repeat ? '; repeats a link to it earlier in its part' : ''}${link.private ? '; in a private part' : ''}`,
            )
            .join('\n'),
        );
      }),
  );

  server.registerTool(
    'broken_links',
    {
      title: 'Links that lead nowhere',
      description:
        'The links of the archive’s texts to its own entities that lead ' +
        'nowhere now — the entity is gone, or the heading it named — a page ' +
        'at a time, each with where it may lead instead, best first: the ' +
        'heading a renamed one became, one named like it, the whole entity; ' +
        'for an entity gone, what the link’s words name, and at last no ' +
        'link. Go on with next until there is none.',
      inputSchema: z.object({
        cursor: z.string().optional().describe('next of the page before'),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: READS,
    },
    ({ cursor, limit }) =>
      guardTool(async () => {
        const page = await scanBrokenLinks({ cursor, limit });
        const lines = page.links.map(brokenLinkText);
        return toolResult(
          [
            lines.length
              ? lines.join('\n')
              : 'No broken link in this part of the archive.',
            page.next
              ? `More may follow: call again with cursor "${page.next}".`
              : 'That was the whole archive.',
          ].join('\n'),
        );
      }),
  );
}
