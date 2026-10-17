import { count } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { McpServer } from '@modelcontextprotocol/server';
import { READS } from '../annotations';
import { lifeArrivalCutoff } from '#layers/thei/shared/life';
import { getProfile } from '../../profile';
import { siteUrl } from '../../site-url';
import type { McpCallContext } from '../context';
import { EDITING_MARKDOWN_REFERENCE } from '#layers/thei/shared/content-edit-markdown/reference';
import { archiveModel } from '../instructions';
import { guardTool, toolResult } from '../result';
import { scopeSummary } from '../scope';
import { listTerms } from '../../ai/terms';
import { kindMemoryOverview } from '../../ai/memory/read';

export function registerOverviewTool(
  server: McpServer,
  context: McpCallContext,
) {
  server.registerTool(
    'site_overview',
    {
      title: 'Overview of the site',
      description:
        'What this site is and how much it holds, today, what this token may ' +
        "do, the owner's own instructions and dictionary, how the archive " +
        'is built, and how texts are written. Call it before anything else.',
      annotations: READS,
    },
    () =>
      guardTool(async () => {
        const { db, schema } = THEI_SERVER.useDb();
        const total = (table: SQLiteTable) =>
          db.select({ value: count() }).from(table).get()!.value;
        const profile = getProfile();
        const language = THEI_SERVER.phrase.language_name;
        const terms = listTerms().length;
        const instructions = THEI_SERVER.config.mcp.instructions.trim();
        const lines = [
          `# ${profile.displayName} — Thei`,
          '',
          profile.slogan ? `“${profile.slogan}”` : '',
          `Site: ${siteUrl(context.event, '/')} · language: ${language} (${THEI_SERVER.config.languageCode})`,
          `Today: ${new Date().toISOString().slice(0, 10)} (UTC); the latest day that has come somewhere on Earth: ${lifeArrivalCutoff()}. The site keeps no time zone: ask the owner which day it is for them when it matters.`,
          `It holds ${total(schema.projects)} projects, ${total(schema.events)} events, ${total(schema.diaryEntries)} diary entries, ${total(schema.pages)} pages and ${total(schema.tags)} tags.`,
          '',
          `## Your token: “${context.principal.label}”`,
          '',
          ...scopeSummary(context.principal.scopes).map((line) => `- ${line}`),
          '',
          "## The owner's own instructions",
          '',
          instructions || '_(none)_',
          '',
          "## The owner's dictionary",
          '',
          terms
            ? `The owner keeps ${terms} words — names, places, their own words — with what each means. When one stands in a text you read, read_entity says what it means; a correction of a word kept as written is refused.`
            : '_(empty)_',
          '',
          '## Memory',
          '',
          'The owner keeps memory for you, each record anchored to what it is about — an entity, a pair of them, every entity of a kind — and read only with it: read_entity gives an entity’s, read_memory any of it. What the owner tells you to remember, propose with remember; a word of theirs, with term.',
          ...kindMemoryOverview(),
          '',
          '## Digests',
          '',
          'A digest is your own few lines about an entity, kept until it changes: read_digests gives them, the archive’s plain lines where none is fresh. When read_entity says an entity has no fresh digest and you read it in full, write one with write_digest — what it is, what matters in it, in 3–6 lines.',
          '',
          archiveModel(language),
          '',
          '## Refs',
          '',
          'Entities are named kind:id — project:<id>, project-section:<id>, event:<id>, page:<id>, tag:<id>, profile — and a diary entry by its day, diary-entry:YYYY-MM-DD.',
          '',
          EDITING_MARKDOWN_REFERENCE,
        ];
        return toolResult(
          lines
            .filter((line, index) => line !== '' || lines[index - 1] !== '')
            .join('\n'),
        );
      }),
  );
}
