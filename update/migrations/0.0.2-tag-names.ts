import { defineMigration } from './types';

/**
 * Tags gain synonyms, and «ё» stops setting one tag apart from another.
 *
 * Synonyms are other words a tag is known by — «грим» and «косплей» for
 * «Образы Петры» — kept in a JSON column that starts empty.
 *
 * A tag's identity used to be its title without case and compatibility forms;
 * «Ёлка» and «Елка» were two tags. Identity now also reads «ё» as «е», so
 * every stored identity is computed again — from the title as this release
 * stores it, runs of whitespace collapsed — and tags that turn out to be one
 * are merged into the one used most: the others' placements move over to it,
 * as does a description or an icon it lacks, and the others are removed.
 */

type TagRow = { tagUuid: string; title: string; description: string };

/**
 * A title as this release stores it: trimmed, every run of whitespace inside
 * collapsed to one space. Written out on purpose, like the identity below.
 */
function cleanTitle(title: string) {
  return title.trim().replace(/\s+/gu, ' ');
}

/** The identity rule as it stands in this release, written out on purpose. */
function tagIdentity(title: string) {
  return cleanTitle(title)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replaceAll('ё', 'е');
}

export default defineMigration({
  id: '0.0.2/010-tag-names',
  version: '0.0.2',
  title: {
    en: 'Add tag synonyms',
    ru: 'Синонимы тегов',
  },
  description: {
    en: 'Tags gain synonyms, and tags differing only in «ё» become one tag.',
    ru: 'У тегов появляются синонимы, а теги, различающиеся только буквой «ё», становятся одним.',
  },
  up({ rawDb }) {
    rawDb
      .prepare(
        "ALTER TABLE `tags` ADD COLUMN `synonyms` text DEFAULT '[]' NOT NULL",
      )
      .run();

    const tags = rawDb
      .prepare('SELECT `tagUuid`, `title`, `description` FROM `tags`')
      .all() as TagRow[];
    const usageCount = rawDb.prepare(
      'SELECT count(*) AS `count` FROM `tag-usages` WHERE `tagUuid` = ?',
    );
    const groups = new Map<string, TagRow[]>();
    for (const tag of tags) {
      const identity = tagIdentity(tag.title);
      groups.set(identity, [...(groups.get(identity) ?? []), tag]);
    }

    const iconOf = rawDb.prepare(
      "SELECT `assetUuid` FROM `asset-usages` WHERE `containerType` = 'tag' AND `containerId` = ? AND `role` = 'icon'",
    );
    for (const [identity, group] of groups) {
      const [kept, ...merged] = group
        .map((tag) => ({
          tag,
          uses: (usageCount.get(tag.tagUuid) as { count: number }).count,
        }))
        .sort(
          (left, right) =>
            right.uses - left.uses ||
            left.tag.tagUuid.localeCompare(right.tag.tagUuid),
        )
        .map(({ tag }) => tag);
      for (const tag of merged) {
        rawDb
          .prepare(
            'INSERT OR IGNORE INTO `tag-usages` (`tagUuid`, `containerType`, `containerId`, `sortOrder`) SELECT ?, `containerType`, `containerId`, `sortOrder` FROM `tag-usages` WHERE `tagUuid` = ?',
          )
          .run(kept!.tagUuid, tag.tagUuid);
        rawDb
          .prepare('DELETE FROM `tag-usages` WHERE `tagUuid` = ?')
          .run(tag.tagUuid);
        if (!kept!.description && tag.description) {
          rawDb
            .prepare('UPDATE `tags` SET `description` = ? WHERE `tagUuid` = ?')
            .run(tag.description, kept!.tagUuid);
          kept!.description = tag.description;
        }
        if (!iconOf.get(kept!.tagUuid))
          rawDb
            .prepare(
              "UPDATE `asset-usages` SET `containerId` = ? WHERE `containerType` = 'tag' AND `containerId` = ? AND `role` = 'icon'",
            )
            .run(kept!.tagUuid, tag.tagUuid);
        rawDb
          .prepare(
            "DELETE FROM `asset-usages` WHERE `containerType` = 'tag' AND `containerId` = ?",
          )
          .run(tag.tagUuid);
        rawDb
          .prepare('DELETE FROM `tags` WHERE `tagUuid` = ?')
          .run(tag.tagUuid);
      }
      rawDb
        .prepare(
          'UPDATE `tags` SET `title` = ?, `normalizedTitle` = ? WHERE `tagUuid` = ?',
        )
        .run(cleanTitle(kept!.title), identity, kept!.tagUuid);
    }
  },
});
