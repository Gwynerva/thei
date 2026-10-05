import { randomInt, randomUUID } from 'node:crypto';
import { defineMigration } from './types';

/**
 * Project stages become project sections.
 *
 * A stage was a section about a stretch of time: the same title, summary,
 * body, privacy and address, plus periods. From now on there is one kind of
 * part, and its periods are optional. Each stage becomes a section that keeps
 * its uuid, public ID, slug, texts, privacy and dates of creation and change;
 * it is placed after the project's sections, in the order of its first period.
 *
 * The periods of events and sections move to a table of their own, `periods`,
 * whose owner is called by its name — `event` or `project-section` — rather
 * than by the stage it used to be.
 *
 * Everything that named a stage by its kind follows: the owner of its body
 * and of its drafts, the entity links inside every text, and the addresses of
 * stage pages stored as links — in texts, in a project's or an event's links,
 * in an action — which now open the section the stage became. The old stage
 * addresses themselves are dropped, not redirected.
 */
export default defineMigration({
  id: '0.0.4/002-project-sections',
  version: '0.0.4',
  title: {
    en: 'Turn project stages into sections',
    ru: 'Этапы проекта становятся разделами',
  },
  description: {
    en: 'A stage was a section with dates. Every stage becomes a section with the same texts, address and periods, and links to stages now lead to those sections.',
    ru: 'Этап был разделом с датами. Каждый этап становится разделом с теми же текстами, адресом и промежутками, а ссылки на этапы ведут на эти разделы.',
  },
  up({ rawDb, log }) {
    const all = <T>(sql: string, ...params: unknown[]) =>
      rawDb.prepare(sql).all(...params) as T[];
    const run = (sql: string, ...params: unknown[]) =>
      rawDb.prepare(sql).run(...params);

    run(
      'CREATE TABLE `periods` (' +
        '`ownerType` text NOT NULL, ' +
        '`ownerId` text NOT NULL, ' +
        '`sortOrder` integer NOT NULL, ' +
        '`startDate` text NOT NULL, ' +
        '`endDate` text NOT NULL, ' +
        "`precision` text DEFAULT 'exact' NOT NULL, " +
        "`precisionNote` text DEFAULT '' NOT NULL, " +
        "`label` text DEFAULT '' NOT NULL, " +
        'PRIMARY KEY(`ownerType`, `ownerId`, `sortOrder`), ' +
        'CONSTRAINT "periods-owner-type-check" CHECK("periods"."ownerType" in (\'event\', \'project-section\'))' +
        ')',
    );

    // A stage whose uuid or public ID a section already holds gets new ones
    // before anything moves. The prefixes of the two kinds differ, so this
    // takes a collision of random values; it is handled, not expected.
    const uuidOf = new Map<string, string>();
    for (const { stageUuid } of all<{ stageUuid: string }>(
      'SELECT s.`stageUuid` FROM `project-stages` s ' +
        'JOIN `project-content-sections` c ON c.`sectionUuid` = s.`stageUuid`',
    )) {
      const next = `pcs-${randomUUID()}`;
      uuidOf.set(stageUuid, next);
      run(
        'UPDATE `project-stages` SET `stageUuid` = ? WHERE `stageUuid` = ?',
        next,
        stageUuid,
      );
      run(
        "UPDATE `stage-periods` SET `stageUuid` = ? WHERE `stageType` = 'project-stage' AND `stageUuid` = ?",
        next,
        stageUuid,
      );
      run(
        "UPDATE `content` SET `ownerId` = ? WHERE `ownerType` = 'project-stage' AND `ownerId` = ?",
        next,
        stageUuid,
      );
      run(
        "UPDATE `content-history` SET `ownerRef` = ? WHERE `ownerType` = 'project-stage' AND `ownerRef` = ?",
        next,
        stageUuid,
      );
      log(`Stage ${stageUuid} shared its uuid with a section; it is ${next}.`);
    }
    const takenPublicIds = new Set(
      all<{ publicId: string }>(
        'SELECT `publicId` FROM `project-content-sections` UNION SELECT `publicId` FROM `project-stages`',
      ).map((row) => row.publicId),
    );
    const formerPublicId = new Map<string, string>();
    for (const { stageUuid, publicId } of all<{
      stageUuid: string;
      publicId: string;
    }>(
      'SELECT s.`stageUuid`, s.`publicId` FROM `project-stages` s ' +
        'JOIN `project-content-sections` c ON c.`publicId` = s.`publicId`',
    )) {
      let next: string;
      do next = randomPublicId();
      while (takenPublicIds.has(next));
      takenPublicIds.add(next);
      formerPublicId.set(stageUuid, publicId);
      run(
        'UPDATE `project-stages` SET `publicId` = ? WHERE `stageUuid` = ?',
        next,
        stageUuid,
      );
      log(
        `Stage ${stageUuid} shared its public ID ${publicId} with a section; it is ${next}.`,
      );
    }

    type Stage = {
      stageUuid: string;
      projectUuid: string;
      title: string;
      summary: string;
      humanReadableSlug: string;
      publicId: string;
      isPrivate: number;
      createdAt: number;
      updatedAt: number;
      firstStart: string | null;
      firstEnd: string | null;
    };
    const stages = all<Stage>(
      'SELECT s.*, ' +
        "(SELECT p.`startDate` FROM `stage-periods` p WHERE p.`stageType` = 'project-stage' AND p.`stageUuid` = s.`stageUuid` ORDER BY p.`sortOrder` LIMIT 1) AS `firstStart`, " +
        "(SELECT p.`endDate` FROM `stage-periods` p WHERE p.`stageType` = 'project-stage' AND p.`stageUuid` = s.`stageUuid` ORDER BY p.`sortOrder` LIMIT 1) AS `firstEnd` " +
        'FROM `project-stages` s',
    );
    const stageUuids = new Set(stages.map((stage) => stage.stageUuid));

    // Addresses name a stage by its project's public ID and its own, the
    // readable parts being ignored on the way in; this is how a stored
    // address is told to be a stage of this very site.
    const projectPublicIds = new Map(
      all<{ projectUuid: string; publicId: string }>(
        'SELECT `projectUuid`, `publicId` FROM `projects`',
      ).map((row) => [row.projectUuid, row.publicId]),
    );
    const stageAddresses = new Map<string, string>();
    for (const stage of stages) {
      const projectPublicId = projectPublicIds.get(stage.projectUuid);
      if (!projectPublicId) continue;
      const former = formerPublicId.get(stage.stageUuid) ?? stage.publicId;
      stageAddresses.set(`${projectPublicId}/${former}`, stage.publicId);
    }

    const nextOrder = new Map(
      all<{ projectUuid: string; next: number }>(
        'SELECT `projectUuid`, MAX(`sortOrder`) + 1 AS `next` FROM `project-content-sections` GROUP BY `projectUuid`',
      ).map((row) => [row.projectUuid, row.next]),
    );
    const insertSection = rawDb.prepare(
      'INSERT INTO `project-content-sections` ' +
        '(`sectionUuid`, `projectUuid`, `title`, `summary`, `humanReadableSlug`, `publicId`, `isPrivate`, `sortOrder`, `createdAt`, `updatedAt`) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const ordered = [...stages].sort(
      (left, right) =>
        left.projectUuid.localeCompare(right.projectUuid) ||
        compareOptional(left.firstStart, right.firstStart) ||
        compareOptional(left.firstEnd, right.firstEnd) ||
        left.createdAt - right.createdAt ||
        left.stageUuid.localeCompare(right.stageUuid),
    );
    for (const stage of ordered) {
      const sortOrder = nextOrder.get(stage.projectUuid) ?? 0;
      nextOrder.set(stage.projectUuid, sortOrder + 1);
      insertSection.run(
        stage.stageUuid,
        stage.projectUuid,
        stage.title,
        stage.summary,
        stage.humanReadableSlug,
        stage.publicId,
        stage.isPrivate,
        sortOrder,
        stage.createdAt,
        stage.updatedAt,
      );
    }

    run(
      'INSERT INTO `periods` ' +
        '(`ownerType`, `ownerId`, `sortOrder`, `startDate`, `endDate`, `precision`, `precisionNote`, `label`) ' +
        "SELECT CASE `stageType` WHEN 'event-stage' THEN 'event' ELSE 'project-section' END, " +
        '`stageUuid`, `sortOrder`, `startDate`, `endDate`, `precision`, `precisionNote`, `label` ' +
        'FROM `stage-periods` ' +
        "WHERE `stageType` = 'event-stage' OR `stageUuid` IN (SELECT `stageUuid` FROM `project-stages`)",
    );
    const orphaned = all<{ count: number }>(
      "SELECT COUNT(*) AS `count` FROM `stage-periods` WHERE `stageType` = 'project-stage' AND `stageUuid` NOT IN (SELECT `stageUuid` FROM `project-stages`)",
    )[0]!.count;

    run(
      "UPDATE `content` SET `ownerType` = 'project-section', `slot` = 'project-section-body' WHERE `ownerType` = 'project-stage'",
    );
    run(
      "UPDATE `content-history` SET `ownerType` = 'project-section', `slot` = 'project-section-body' WHERE `ownerType` = 'project-stage'",
    );

    const sectionId = (id: string) => uuidOf.get(id) ?? id;
    const isStage = (id: string) => stageUuids.has(id) || uuidOf.has(id);

    /**
     * A stored address of a stage page of this site, at any origin or base,
     * as the address of the section the stage became. Anything else — another
     * site's `/stages/`, a stage that never existed here — is left alone.
     */
    const rewriteAddress = (value: string) =>
      value.replace(
        /(\/projects\/)([^/?#"\s]+)\/stages\/([^/?#"\s]+)(?=[/?#]|$)/g,
        (match, prefix: string, projectPart: string, stagePart: string) => {
          const projectPublicId = afterDash(projectPart);
          const next = stageAddresses.get(
            `${projectPublicId}/${afterDash(stagePart)}`,
          );
          if (!next) return match;
          const slug = stagePart.slice(0, stagePart.lastIndexOf('-') + 1);
          return `${prefix}${projectPart}/sections/${slug}${next}`;
        },
      );

    /**
     * One string of a stored text: its entity links to stages and its link
     * addresses. Only markup is touched — an `<a>` tag, which a typed `<`
     * never produces in rich text — and only a link to a stage that exists, so
     * the same characters typed into a plain-text note stay as typed.
     */
    const rewriteString = (value: string, key: string | undefined) => {
      let next = value.replace(/<a\b[^>]*>/g, (tag) => {
        let rewritten = tag;
        const entity =
          /^<a data-content-link="entity" data-entity-type="project-stage" data-entity-id="([^"]*)"/.exec(
            tag,
          );
        if (entity && isStage(entity[1]!))
          rewritten = rewritten.replace(
            entity[0],
            `<a data-content-link="entity" data-entity-type="project-section" data-entity-id="${sectionId(entity[1]!)}"`,
          );
        return rewritten.replace(
          /(\shref=")([^"]*)(")/,
          (_, before: string, href: string, after: string) =>
            `${before}${rewriteAddress(href)}${after}`,
        );
      });
      if (key === 'url' || key === 'externalUrl') next = rewriteAddress(next);
      return next;
    };

    /** Rewrites a parsed text in place and hands it back. */
    const rewriteNode = (node: unknown, key?: string): unknown => {
      if (typeof node === 'string') return rewriteString(node, key);
      if (Array.isArray(node)) {
        for (let index = 0; index < node.length; index++)
          node[index] = rewriteNode(node[index]);
        return node;
      }
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        for (const [name, value] of Object.entries(record))
          record[name] = rewriteNode(value, name);
        // An `entityLink` block names its kind as data, never as typed text,
        // so a dangling one is kept as a link to a section too.
        if (record.entityType === 'project-stage') {
          record.entityType = 'project-section';
          if (typeof record.entityId === 'string')
            record.entityId = sectionId(record.entityId);
        }
      }
      return node;
    };

    const rewriteJson = (source: string) => {
      const parsed = JSON.parse(source) as unknown;
      const next = JSON.stringify(rewriteNode(parsed));
      return next === JSON.stringify(JSON.parse(source)) ? undefined : next;
    };

    let texts = 0;
    for (const table of ['content', 'content-history'] as const) {
      const key = table === 'content' ? 'contentUuid' : 'id';
      const update = rawDb.prepare(
        `UPDATE \`${table}\` SET \`data\` = ? WHERE \`${key}\` = ?`,
      );
      for (const row of all<{ id: string; data: string }>(
        `SELECT \`${key}\` AS \`id\`, \`data\` FROM \`${table}\` ` +
          "WHERE `data` LIKE '%project-stage%' OR `data` LIKE '%/stages/%'",
      )) {
        const next = rewriteJson(row.data);
        if (next === undefined) continue;
        update.run(next, row.id);
        texts++;
      }
    }

    let links = 0;
    for (const { url } of all<{ url: string }>(
      "SELECT `url` FROM `external-links` WHERE `url` LIKE '%/stages/%'",
    )) {
      const next = rewriteAddress(url);
      if (next === url) continue;
      run(
        'INSERT OR IGNORE INTO `external-links` (`url`, `title`, `description`, `faviconKey`, `accent`, `status`, `touchedAt`) ' +
          'SELECT ?, `title`, `description`, `faviconKey`, `accent`, `status`, `touchedAt` FROM `external-links` WHERE `url` = ?',
        next,
        url,
      );
      for (const owner of [
        'project-external-links',
        'event-external-links',
        'profile-external-links',
      ]) {
        run(
          `UPDATE OR IGNORE \`${owner}\` SET \`url\` = ? WHERE \`url\` = ?`,
          next,
          url,
        );
        // Where the owner already had the new address, the old one goes.
        run(`DELETE FROM \`${owner}\` WHERE \`url\` = ?`, url);
      }
      run('DELETE FROM `external-links` WHERE `url` = ?', url);
      links++;
    }
    for (const table of ['projects', 'events'] as const) {
      const key = table === 'projects' ? 'projectUuid' : 'eventUuid';
      for (const row of all<{ id: string; action: string }>(
        `SELECT \`${key}\` AS \`id\`, \`action\` FROM \`${table}\` WHERE \`action\` LIKE '%/stages/%'`,
      )) {
        const next = rewriteJson(row.action);
        if (next === undefined) continue;
        run(
          `UPDATE \`${table}\` SET \`action\` = ? WHERE \`${key}\` = ?`,
          next,
          row.id,
        );
        links++;
      }
    }

    run('DROP TABLE `stage-periods`');
    run('DROP TABLE `project-stages`');

    log(
      `Turned ${stages.length} stages into sections` +
        `${orphaned ? `, dropped ${orphaned} periods of stages that no longer existed` : ''}` +
        `, rewrote ${texts} texts and ${links} stored links.`,
    );
  },
});

function afterDash(value: string) {
  return value.slice(value.lastIndexOf('-') + 1);
}

function compareOptional(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

const PUBLIC_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomPublicId() {
  let id = '';
  for (let index = 0; index < 14; index++)
    id += PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)];
  return id;
}
