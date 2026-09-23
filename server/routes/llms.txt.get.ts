import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { getProfileIdentity } from '../thei/profile';
import { LIFE_PRESETS, lifePresetHref } from '#layers/thei/shared/life-presets';
import { siteUrl } from '../thei/site-url';

/**
 * A map of the site for language models, in the llms.txt convention.
 *
 * It says what the site is, what its entities mean — a reader that does not
 * know Thei cannot tell a project from an event — and where the Markdown
 * copies live. A closed site has none of this.
 */
export default defineEventHandler(async (event) => {
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private)
    throw createError({ statusCode: 404 });

  const identity = await getProfileIdentity();
  const phrase = THEI_SERVER.phrase;
  const link = (path: string, title: string, note: string) =>
    `- [${title}](${siteUrl(event, path)}): ${note}`;

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=3600');
  return [
    `# ${identity.profile.displayName}`,
    '',
    `> ${identity.profile.slogan || phrase.public_life_description}`,
    '',
    phrase.llms_txt_intro,
    '',
    `## ${phrase.llms_txt_sections}`,
    '',
    link('/', phrase.home, phrase.llms_txt_home),
    link('/life/', phrase.life, phrase.llms_txt_life),
    link(
      lifePresetHref(LIFE_PRESETS[0]!),
      phrase.diary_seo_title,
      phrase.llms_txt_diary,
    ),
    link('/tags/', phrase.tags, phrase.llms_txt_tags),
    link('/pages/', phrase.pages, phrase.llms_txt_pages),
    link('/sitemap.xml', 'sitemap.xml', phrase.llms_txt_sitemap),
    '',
    `## ${phrase.llms_txt_markdown_title}`,
    '',
    phrase.llms_txt_markdown,
    '',
  ].join('\n');
});
