import { defineMigration } from './types';

/**
 * An app over MCP has no session in Thei any more: an editor's key applies
 * its changes at once, as the owner agreed in the app's own conversation,
 * and a reader's key only reads. The sessions apps left go whole, as the
 * owner deletes one: their actions, messages and the entities they named;
 * the versions of texts their actions held for an undo are let go, and so
 * are the files placed in them — the library's sweep takes those nothing
 * else holds. What their actions applied stays applied. The columns that
 * tied a session to an app's key and name go with them.
 */
export default defineMigration({
  id: '0.0.8/002-direct-app-writes',
  version: '0.0.8',
  title: {
    en: 'Let AI apps write directly',
    ru: 'ИИ-приложения пишут напрямую',
  },
  description: {
    en: 'An AI app connected over MCP applies what the owner asked it for at once; the sessions apps left in the admin are removed.',
    ru: 'ИИ-приложение, подключённое по MCP, сразу применяет то, о чём попросил владелец; сессии приложений в админке удаляются.',
  },
  up({ rawDb }) {
    const apps =
      "SELECT `sessionUuid` FROM `ai-sessions` WHERE `origin` = 'app'";
    // The files its session placed or its actions named, read before they go.
    const named = (
      rawDb
        .prepare(
          `SELECT \`assetUuid\` FROM \`asset-usages\` WHERE \`containerType\` = 'ai-session' AND \`containerId\` IN (${apps}) UNION SELECT value FROM \`ai-actions\`, json_each(\`ai-actions\`.\`assetUuids\`) WHERE \`sessionUuid\` IN (${apps})`,
        )
        .all() as { assetUuid: string }[]
    ).map((row) => row.assetUuid);
    rawDb
      .prepare(
        `UPDATE \`content-history\` SET \`heldBy\` = NULL WHERE \`heldBy\` IN (SELECT \`actionUuid\` FROM \`ai-actions\` WHERE \`sessionUuid\` IN (${apps}))`,
      )
      .run();
    for (const statement of [
      `DELETE FROM \`asset-usages\` WHERE \`containerType\` = 'ai-session' AND \`containerId\` IN (${apps})`,
      `UPDATE \`ai-memory\` SET \`sessionUuid\` = NULL WHERE \`sessionUuid\` IN (${apps})`,
      `DELETE FROM \`ai-actions\` WHERE \`sessionUuid\` IN (${apps})`,
      `DELETE FROM \`ai-messages\` WHERE \`sessionUuid\` IN (${apps})`,
      `DELETE FROM \`ai-session-entities\` WHERE \`sessionUuid\` IN (${apps})`,
      "DELETE FROM `ai-sessions` WHERE `origin` = 'app'",
    ])
      rawDb.prepare(statement).run();
    // Of those, a file nothing holds any more — no placement, no version of a
    // text, no action of the site's model that may still need it — starts
    // its last day, as one the owner lets go does. A file still held keeps
    // its date: the upload date taken from it next must not become today's.
    rawDb
      .prepare(
        `UPDATE \`assets\` SET \`touchedAt\` = ? WHERE \`assetUuid\` IN (SELECT value FROM json_each(?))
          AND NOT EXISTS (SELECT 1 FROM "asset-usages" u WHERE u.assetUuid = \`assets\`.\`assetUuid\`)
          AND NOT EXISTS (SELECT 1 FROM "content-history" h, json_each(h.assetUuids) j WHERE j.value = \`assets\`.\`assetUuid\`)
          AND NOT EXISTS (SELECT 1 FROM "ai-actions" a, json_each(a.assetUuids) j WHERE j.value = \`assets\`.\`assetUuid\` AND a.state IN ('pending', 'applying', 'applied'))`,
      )
      .run(Date.now(), JSON.stringify(named));
    for (const statement of [
      'DROP INDEX IF EXISTS `ai-sessions-app-idx`',
      'ALTER TABLE `ai-sessions` DROP COLUMN `tokenUuid`',
      'ALTER TABLE `ai-sessions` DROP COLUMN `client`',
    ])
      rawDb.prepare(statement).run();
  },
});
