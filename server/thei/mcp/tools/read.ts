import type { McpServer } from '@modelcontextprotocol/server';
import { READS } from '../annotations';
import { z } from 'zod';
import type { McpCallContext } from '../context';
import { readEntity, resolveRef } from '../entities';
import { actionDef } from '../../ai/actions/registry';
import { actionsAbout } from '../../ai/actions/rows';
import { digestOf } from '../../ai/digests';
import { memoryLines } from '../../ai/memory/read';
import { termLines } from '../../ai/terms';
import { pageOfText, renderEntity, TEXT_PAGE } from '../render';
import { guardTool, McpToolError, toolResult } from '../result';

/** Declined actions a read shows, newest first. */
const DECLINED_SHOWN = 15;

export function registerReadTool(server: McpServer, context: McpCallContext) {
  server.registerTool(
    'read_entity',
    {
      title: 'Read an entity',
      description:
        'One entity in full, as the owner sees it: its fields, every text ' +
        'in editing Markdown with the version a change must name, its ' +
        "periods, tags and relations, a project's sections, what its " +
        'texts link to, the actions already waiting for the owner and ' +
        'those the owner declined lately, what is remembered about it and ' +
        'the words of the owner’s dictionary it uses. Refs come from search, list and ' +
        `other reads. A text longer than ${TEXT_PAGE} characters comes in ` +
        'parts: read the rest with text and offset.',
      inputSchema: z.object({
        ref: z
          .string()
          .describe(
            'project:<id>, project-section:<id>, event:<id>, ' +
              'diary-entry:YYYY-MM-DD, page:<id>, tag:<id> or profile',
          ),
        text: z
          .string()
          .optional()
          .describe('Only this text, by its name — with offset, its next part'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Where in the text to go on, as a cut-off part names it'),
      }),
      annotations: READS,
    },
    ({ ref, text: textName, offset }) =>
      guardTool(async () => {
        const key = resolveRef(ref);
        const view = await readEntity(key, context);
        if (textName !== undefined) {
          const text = view.texts.find((item) => item.name === textName);
          if (!text)
            throw new McpToolError(
              `${view.ref} has no text "${textName}": it has ${view.texts.map((item) => `"${item.name}"`).join(', ') || 'none'}.`,
            );
          const page = pageOfText(text.markdown, offset ?? 0);
          return toolResult(
            [
              `# ${view.ref} — text "${text.name}" (version ${text.version ?? 'none: empty'}), characters ${page.from}–${page.to} of ${text.markdown.length}`,
              '',
              page.part || '_(empty)_',
              ...(page.next !== null
                ? [
                    '',
                    `… continues: read_entity with text "${text.name}", offset ${page.next}`,
                  ]
                : []),
            ].join('\n'),
          );
        }
        if (offset !== undefined)
          throw new McpToolError(
            'offset goes with text: name the text to go on with.',
          );

        const rendered = renderEntity(view);
        const lines = [rendered];
        // What the owner keeps for it: its memory, and the words of their
        // dictionary its texts use.
        lines.push(...memoryLines(key), ...termLines(rendered));
        // What is already waiting for the owner, and what the owner turned
        // down, so neither is proposed again — in these words or others.
        const summaryOf = (row: { kind: string; payload: unknown }) =>
          actionDef(row.kind).summary(row.payload as never);
        const waiting = actionsAbout(key, ['pending']);
        if (waiting.length)
          lines.push(
            '',
            '## Actions waiting for the owner',
            '',
            ...waiting.map(
              (row) => `- ${row.actionUuid}: ${row.kind} — ${summaryOf(row)}`,
            ),
          );
        const declined = actionsAbout(key, ['rejected'])
          .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))
          .slice(0, DECLINED_SHOWN);
        if (declined.length)
          lines.push(
            '',
            '## Declined by the owner lately',
            '',
            ...declined.map(
              (row) =>
                `- ${new Date(row.decidedAt ?? row.createdAt).toISOString().slice(0, 10)}: ${row.kind} — ${summaryOf(row)}`,
            ),
          );
        const digest = digestOf(key);
        if (!digest?.fresh)
          lines.push(
            '',
            digest
              ? 'Its digest is out of date: once you have read it in full, write it anew with write_digest.'
              : 'It has no digest yet: once you have read it in full, write one with write_digest.',
          );
        return toolResult(lines.join('\n'));
      }),
  );
}
