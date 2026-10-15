import { and, eq, inArray } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/server';
import { READS } from '../annotations';
import { z } from 'zod';
import {
  contentPlainText,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import {
  clampTagContextText,
  joinTagContextText,
  type TagRecommendation,
  type TagRecommendationRequest,
} from '#layers/thei/shared/tag-recommendation';
import { readRelationRows } from '../../relations';
import { recommendTagsForDraft } from '../../tag-recommendations';
import type { McpCallContext } from '../context';
import { readEntity, resolveRef, type McpEntityView } from '../entities';
import { guardTool, McpToolError, toolResult } from '../result';

function describeReasons(recommendation: TagRecommendation): string[] {
  return recommendation.reasons.map((reason) => {
    switch (reason.kind) {
      case 'text':
        return `its words: ${reason.terms.join(', ')}`;
      case 'similar':
        return `similar entities carry it: ${reason.entities.map((e) => e.title).join(', ')}`;
      case 'related':
        return `related entities carry it: ${reason.entities.map((e) => e.title).join(', ')}`;
      case 'together':
        return `often goes with: ${reason.tags.join(', ')}`;
    }
  });
}

/** A project's sections as tag recommendations read a project: their words too. */
function sectionWords(view: McpEntityView): string[] {
  const sections = view.sections ?? [];
  if (!sections.length) return [];
  const { db, schema } = THEI_SERVER.useDb();
  const bodies = new Map(
    db
      .select({ ownerId: schema.content.ownerId, data: schema.content.data })
      .from(schema.content)
      .where(
        and(
          eq(schema.content.ownerType, 'project-section'),
          inArray(
            schema.content.ownerId,
            sections.map((section) =>
              section.ref.slice('project-section:'.length),
            ),
          ),
        ),
      )
      .all()
      .map((row) => [
        row.ownerId,
        contentPlainText(row.data as ContentOutputData),
      ]),
  );
  return sections.flatMap((section) => [
    section.title,
    section.summary,
    bodies.get(section.ref.slice('project-section:'.length)) ?? '',
  ]);
}

/**
 * The site's own tag recommendations, with their reasons: evidence from the
 * archive itself, for the model to weigh rather than guess.
 */
export function registerTagCandidatesTool(
  server: McpServer,
  context: McpCallContext,
) {
  server.registerTool(
    'tag_candidates',
    {
      title: 'Tags that may fit',
      description:
        "The site's own recommendations of existing tags for a project or " +
        'an event, or for any text, with the evidence behind each: its ' +
        'words, similar or related entities carrying the tag, tags it goes ' +
        'with. Weigh them; they are not decisions.',
      inputSchema: z.object({
        ref: z.string().optional().describe('project:<id> or event:<id>'),
        title: z.string().optional(),
        text: z.string().optional().describe('Words to find tags for'),
      }),
      annotations: READS,
    },
    ({ ref, title, text }) =>
      guardTool(async () => {
        let request: TagRecommendationRequest;
        if (ref) {
          const key = resolveRef(ref);
          if (key.kind !== 'project' && key.kind !== 'event')
            throw new McpToolError(
              'Only projects and events carry tags; diary entries never do.',
            );
          const view = await readEntity(key, context);
          // What a visitor reads, as the editor's own recommendations do:
          // private notes say nothing about what the entity is.
          const descriptions = view.texts
            .filter((item) => !item.private)
            .map((item) => item.markdown);
          request = {
            title: String(view.fields.title ?? ''),
            text: clampTagContextText(
              joinTagContextText([
                String(view.fields.summary ?? ''),
                ...descriptions,
                ...sectionWords(view),
              ]),
            ),
            owner: { type: key.kind, id: key.id },
            selectedTagUuids: (view.tags ?? []).map((tag) =>
              tag.ref.slice('tag:'.length),
            ),
            related: readRelationRows({ type: key.kind, id: key.id }).map(
              (row) => row.other,
            ),
          };
        } else {
          if (!title && !text)
            throw new McpToolError('Give a ref, or a title or a text.');
          request = {
            title: title ?? '',
            text: clampTagContextText(text ?? ''),
            selectedTagUuids: [],
            related: [],
          };
        }
        const candidates = (await recommendTagsForDraft(request)).map(
          (recommendation) => ({
            ref: `tag:${recommendation.tagUuid}`,
            title: recommendation.title,
            score: Math.round(recommendation.score * 100) / 100,
            because: describeReasons(recommendation),
          }),
        );
        return toolResult(
          { candidates },
          candidates.length
            ? candidates
                .map(
                  (candidate) =>
                    `- ${candidate.ref} — ${candidate.title} (score ${candidate.score}): ${candidate.because.join('; ')}`,
                )
                .join('\n')
            : 'No existing tag fits well.',
        );
      }),
  );
}
