import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import aiSessionPurge from '../../update/migrations/0.0.6-ai-session-purge';

let rawDb: Database.Database | undefined;
afterEach(() => rawDb?.close());

/** The session tables as 0.0.6/009 left them: a purged session among two. */
function purgedDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE \`ai-sessions\` (\`sessionUuid\` text PRIMARY KEY NOT NULL, \`title\` text DEFAULT '' NOT NULL, \`origin\` text NOT NULL, \`tokenUuid\` text, \`client\` text, \`templateId\` text, \`model\` text, \`state\` text DEFAULT 'idle' NOT NULL, \`pinned\` integer DEFAULT false NOT NULL, \`waiting\` integer DEFAULT 0 NOT NULL, \`applied\` integer DEFAULT 0 NOT NULL, \`rejected\` integer DEFAULT 0 NOT NULL, \`summary\` text DEFAULT '' NOT NULL, \`tokens\` integer DEFAULT 0 NOT NULL, \`error\` text, \`createdAt\` integer NOT NULL, \`lastActiveAt\` integer NOT NULL, \`closedAt\` integer, \`archivedAt\` integer, \`purgedAt\` integer);
    CREATE INDEX \`ai-sessions-active-idx\` ON \`ai-sessions\` (\`archivedAt\`,\`lastActiveAt\`);
    CREATE TABLE \`ai-session-entities\` (\`sessionUuid\` text NOT NULL, \`entityType\` text NOT NULL, \`entityId\` text NOT NULL, \`role\` text NOT NULL, \`at\` integer NOT NULL, PRIMARY KEY(\`sessionUuid\`, \`entityType\`, \`entityId\`));
  `);
  const session = rawDb.prepare(
    "INSERT INTO `ai-sessions` (sessionUuid, origin, createdAt, lastActiveAt, archivedAt, purgedAt) VALUES (?, 'owner', 1, 2, ?, ?)",
  );
  session.run('ais-live', null, null);
  session.run('ais-purged', 3, 4);
  const entity = rawDb.prepare(
    "INSERT INTO `ai-session-entities` VALUES (?, 'project', 'p-1', 'about', 1)",
  );
  entity.run('ais-live');
  entity.run('ais-purged');
  return rawDb;
}

describe('0.0.6/018: purged sessions go whole', () => {
  it('deletes what purges left, and the columns that told of them', () => {
    const db = purgedDb();
    aiSessionPurge.up!({ rawDb: db } as never);
    expect(db.prepare('SELECT sessionUuid FROM `ai-sessions`').all()).toEqual([
      { sessionUuid: 'ais-live' },
    ]);
    expect(
      db.prepare('SELECT sessionUuid FROM `ai-session-entities`').all(),
    ).toEqual([{ sessionUuid: 'ais-live' }]);
    const columns = (
      db.prepare("PRAGMA table_info('ai-sessions')").all() as {
        name: string;
      }[]
    ).map((column) => column.name);
    expect(columns).not.toContain('purgedAt');
    expect(columns).not.toContain('summary');
  });

  it('does nothing run again', () => {
    const db = purgedDb();
    aiSessionPurge.up!({ rawDb: db } as never);
    expect(() => aiSessionPurge.up!({ rawDb: db } as never)).not.toThrow();
    expect(db.prepare('SELECT count(*) AS n FROM `ai-sessions`').get()).toEqual(
      { n: 1 },
    );
  });
});
