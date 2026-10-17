import type { McpServer } from '@modelcontextprotocol/server';
import { READS, SUGGESTS } from '../annotations';
import { z } from 'zod';
import {
  RELATION_WORD_OF_TYPE,
  type RelationNote,
} from '#layers/thei/shared/relation';
import {
  entityFaces,
  findEntity,
  refOf,
  type EntityKind,
} from '../../entity-kinds';
import {
  fromStoredRelationNote,
  fromStoredRelationType,
} from '../../relations';
import type { McpCallContext } from '../context';
import { digestLine, loadDocuments } from '../documents';
import { formatPeriod } from '../render';
import { guardTool, McpToolError, toolResult } from '../result';
import { spendWrite } from '../scope';
import { AI_DIGEST_MAX, digestOf, writeDigest } from '../../ai/digests';
import { sessionModel } from '../../ai/model/settings';

/**
 * Reading wide without reading everything: the digests of many entities at
 * once, and every relation of the archive in one table. A model scans these
 * first and opens in full only what it needs — what keeps a review of a large
 * archive affordable.
 */

/** Digests one call may ask for. */
const DIGESTS_PER_CALL = 50;
/** How much of a relation's note the table shows. */
const NOTE_LENGTH = 120;

function noteLine(note: RelationNote | undefined): string {
  const text =
    note?.type === 'shared'
      ? note.text
      : note
        ? [note.currentText, note.relatedText].filter(Boolean).join(' / ')
        : '';
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > NOTE_LENGTH ? `${flat.slice(0, NOTE_LENGTH)}…` : flat;
}

export function registerDigestTools(
  server: McpServer,
  context: McpCallContext,
) {
  server.registerTool(
    'read_digests',
    {
      title: 'Digests of several entities',
      description:
        `The digests of up to ${DIGESTS_PER_CALL} entities at once: the ` +
        'lines a model wrote of each after reading it whole, while it reads ' +
        'the same, and otherwise its title, dates, summary or opening words ' +
        'and keywords — a few lines each, not the whole. Read these to judge ' +
        'what matters, then read_entity only that.',
      inputSchema: z.object({
        refs: z.array(z.string()).min(1).max(DIGESTS_PER_CALL),
      }),
      annotations: READS,
    },
    ({ refs }) =>
      guardTool(() => {
        const documents = new Map(
          loadDocuments().map((document) => [document.ref, document]),
        );
        const lines = refs.map((ref) => {
          // A diary entry may be named by its id as well as by its day.
          const key = findEntity(ref);
          const document = key ? documents.get(refOf(key)) : undefined;
          if (!key || !document) return `- ${ref} — not found`;
          const line = digestLine(
            document,
            document.periods?.length
              ? document.periods.map(formatPeriod).join('; ')
              : undefined,
          );
          // A model's own digest, while the entity reads as it read it.
          const digest = digestOf(key);
          if (!digest) return line;
          const head = line.split('\n')[0]!;
          return digest.fresh
            ? `${head}\n  ${digest.text.replace(/\n+/g, '\n  ')}`
            : `${line}\n  (a digest was written of it, but it has changed since)`;
        });
        return toolResult(lines.join('\n'));
      }),
  );

  server.registerTool(
    'write_digest',
    {
      title: 'Write the digest of an entity',
      description:
        'Keeps your own few lines about an entity you have just read in ' +
        'full with read_entity: what it is and what matters in it, 3–6 ' +
        `lines, at most ${AI_DIGEST_MAX} characters, in the site’s ` +
        'language. read_digests gives them while the entity reads the ' +
        'same — so write only what reading it again would tell. Never ' +
        'anything private into a digest of a public entity.',
      inputSchema: z.object({ ref: z.string(), digest: z.string() }),
      annotations: SUGGESTS,
    },
    ({ ref, digest }) =>
      guardTool(() => {
        spendWrite(context);
        const key = findEntity(ref);
        if (!key) throw new McpToolError(`There is no ${ref}.`);
        if (context.session && !context.session.live())
          throw new McpToolError('The turn was stopped; nothing was kept.');
        writeDigest(
          key,
          digest,
          context.session
            ? (sessionModel()?.model ?? '')
            : (context.client ?? context.principal.label),
        );
        return toolResult(`The digest of ${refOf(key)} is kept.`);
      }),
  );

  server.registerTool(
    'relation_graph',
    {
      title: 'Every relation at once',
      description:
        "The owner's map of their life: every relation between projects, " +
        'events and diary entries, one a line — which depends on or affects ' +
        'which, with the start of its note. Narrow it to some kinds, or to ' +
        'what touches some refs.',
      inputSchema: z.object({
        kinds: z
          .array(z.enum(['project', 'event', 'diary-entry']))
          .optional()
          .describe('Only relations whose two ends are both of these kinds'),
        touching: z
          .array(z.string())
          .optional()
          .describe('Only relations with one of these refs at an end'),
      }),
      annotations: READS,
    },
    ({ kinds, touching }) =>
      guardTool(() => {
        const { db, schema } = THEI_SERVER.useDb();
        const rows = db.select().from(schema.entityRelations).all();
        const faces = entityFaces(
          rows.flatMap((row) => [
            { kind: row.firstType as EntityKind, id: row.firstId },
            { kind: row.secondType as EntityKind, id: row.secondId },
          ]),
        );
        const wanted = touching?.map((ref) => {
          const key = findEntity(ref);
          if (!key) throw new McpToolError(`Nothing found for ${ref}.`);
          return `${key.kind}:${key.id}`;
        });
        const lines = rows.flatMap((row) => {
          const first = `${row.firstType}:${row.firstId}`;
          const second = `${row.secondType}:${row.secondId}`;
          if (
            kinds &&
            !(
              kinds.includes(row.firstType as never) &&
              kinds.includes(row.secondType as never)
            )
          )
            return [];
          if (wanted && !wanted.includes(first) && !wanted.includes(second))
            return [];
          const a = faces.get(first);
          const b = faces.get(second);
          if (!a || !b) return [];
          const word =
            RELATION_WORD_OF_TYPE[fromStoredRelationType(row.type, true)];
          const note = noteLine(
            fromStoredRelationNote(row.note ?? undefined, true),
          );
          return [
            `- ${a.ref} "${a.title}" ${word === 'related' ? '— related —' : word === 'depends-on' ? '→ depends on →' : '→ affects →'} ${b.ref} "${b.title}"${note ? ` · ${note}` : ''}`,
          ];
        });
        return toolResult(
          lines.length
            ? [`${lines.length} relations:`, ...lines].join('\n')
            : 'No relations.',
        );
      }),
  );
}
