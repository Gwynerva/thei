import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { normalizeContentData } from '#layers/thei/shared/content';
import { editBlockKey } from '#layers/thei/shared/content-edit-markdown/merge';
import { parseEditMarkdownToBlocks } from '#layers/thei/shared/content-edit-markdown/parse';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';

/**
 * Every text of the playground, written as editing Markdown and read back,
 * must be the text it was. Real texts hold what no hand-made fixture thinks
 * of. Skipped where there is no playground.
 */
const database = new URL('../../.playground/content/thei.db', import.meta.url);

describe.skipIf(!existsSync(database))(
  'editing markdown over real texts',
  () => {
    // The lab's archive is the playground now, thousands of texts: read
    // alongside the whole suite they take longer than vitest's five seconds.
    it('reads every playground text back as it was', () => {
      const db = new Database(database.pathname.replace(/^\/(\w:)/, '$1'), {
        readonly: true,
      });
      const rows = db
        .prepare('SELECT contentUuid, data FROM content')
        .all() as { contentUuid: string; data: string }[];
      db.close();
      const broken: string[] = [];
      for (const row of rows) {
        const data = normalizeContentData(JSON.parse(row.data));
        const parsed = normalizeContentData({
          blocks: parseEditMarkdownToBlocks(contentToEditMarkdown(data)).blocks,
        } as never);
        const keys = (blocks: typeof data.blocks) => blocks.map(editBlockKey);
        if (
          JSON.stringify(keys(parsed.blocks)) !==
          JSON.stringify(keys(data.blocks))
        )
          broken.push(row.contentUuid);
      }
      expect(rows.length).toBeGreaterThan(0);
      expect(broken).toEqual([]);
    }, 60_000);
  },
);
