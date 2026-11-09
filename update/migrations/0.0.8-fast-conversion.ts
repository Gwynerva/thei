import { defineMigration } from './types';

/**
 * The "fast conversion" of a video — one realtime pass of libvpx instead of
 * two — is gone: on the media bench it came out at 0.88 to 3.2 of the size
 * the editor had promised and three to eight VMAF points under two passes,
 * so nothing honest could be said about a file before it was made. Every
 * encode now takes the two passes at `cpu-used 4`.
 *
 * The recipes stored with the flag lose it, and their settings keys lose the
 * `:fast:0` or `:fast:1` part, so a key the code builds today finds them. A
 * file made the fast way stays what it is; only its description changes, as
 * when the crop recipes were rewritten in 0.0.2. The one row in a family
 * whose new key and bytes another row already has keeps its old key: the
 * unique index on (family, hash, key) comes first, and such a pair cannot
 * arise from one source anyway.
 */
export default defineMigration({
  id: '0.0.8/003-fast-conversion',
  version: '0.0.8',
  title: {
    en: 'Drop the fast video conversion from file recipes',
    ru: 'Убрать быструю конвертацию из рецептов файлов',
  },
  description: {
    en: 'Videos are always converted in two passes now; the recipes of files made with the fast conversion lose that mark. The files themselves do not change.',
    ru: 'Видео теперь всегда конвертируется в два прохода; рецепты файлов, сделанных быстрой конвертацией, теряют эту отметку. Сами файлы не меняются.',
  },
  up({ rawDb }) {
    const stripped =
      "replace(replace(`settingsKey`, ':fast:1', ''), ':fast:0', '')";
    rawDb
      .prepare(
        `UPDATE \`assets\`
         SET \`settingsKey\` = ${stripped},
             \`settings\` = CASE
               WHEN \`settings\` IS NULL THEN NULL
               ELSE json_remove(\`settings\`, '$.fastConversion')
             END
         WHERE \`settingsKey\` LIKE 'video-transform:%'
           AND (\`settingsKey\` LIKE '%:fast:%'
                OR \`settings\` LIKE '%"fastConversion"%')
           AND NOT EXISTS (
             SELECT 1 FROM \`assets\` AS other
             WHERE other.\`familyUuid\` = \`assets\`.\`familyUuid\`
               AND other.\`contentHash\` = \`assets\`.\`contentHash\`
               AND other.\`assetUuid\` != \`assets\`.\`assetUuid\`
               AND other.\`settingsKey\` = ${stripped.replace(/`settingsKey`/g, '`assets`.`settingsKey`')}
           )`,
      )
      .run();
  },
});
