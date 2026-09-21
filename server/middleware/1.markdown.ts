import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { getRequestPath } from '../thei/request';
import {
  renderEventMarkdown,
  renderPageMarkdown,
  renderProjectChildMarkdown,
  renderProjectMarkdown,
  type MarkdownDocument,
} from '../thei/markdown/render';

/**
 * `…/index.md` beside every public page.
 *
 * Matched here rather than as a route file because the addresses mirror the
 * pages themselves, which are Vue routes: a middleware can answer them without
 * a second copy of the site's URL shape.
 *
 * The Markdown is a representation of the page, not a page of its own, so it
 * points a crawler back at the original and stays out of the index itself.
 */
export default defineEventHandler(async (event) => {
  const path = getRequestPath(event);
  if (!path.endsWith('/index.md')) return;
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private)
    throw createError({ statusCode: 404 });

  const segments = path
    .slice(1, -'/index.md'.length)
    .split('/')
    .filter(Boolean);
  const document = await resolve(event, segments);
  if (!document) throw createError({ statusCode: 404 });

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8');
  setHeader(event, 'X-Robots-Tag', 'noindex');
  setHeader(event, 'Link', `<${document.canonical}>; rel="canonical"`);
  setHeader(event, 'Cache-Control', 'public, max-age=300');
  return document.body;
});

function resolve(
  event: Parameters<typeof renderProjectMarkdown>[0],
  segments: string[],
): Promise<MarkdownDocument | undefined> | undefined {
  const [section, part, childKind, childPart] = segments;
  if (section === 'projects' && part) {
    const publicId = publicIdOf(part);
    if (segments.length === 2) return renderProjectMarkdown(event, publicId);
    if (
      segments.length === 4 &&
      (childKind === 'stages' || childKind === 'sections') &&
      childPart
    )
      return renderProjectChildMarkdown(
        event,
        childKind,
        publicId,
        publicIdOf(childPart),
      );
    return undefined;
  }
  if (section === 'events' && part && segments.length === 2)
    return renderEventMarkdown(event, publicIdOf(part));
  if (section === 'pages' && part && segments.length === 2)
    return renderPageMarkdown(event, part);
  return undefined;
}

/** Addresses read `human-readable-PublicId`; only the id identifies anything. */
const publicIdOf = publicIdFromProjectUrlPart;
