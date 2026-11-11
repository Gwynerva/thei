import {
  isPublicSecret,
  type PublicEntityLink,
  type PublicExcerpt,
} from '#layers/thei/shared/api/public';
import { excerptAnchorId } from '#layers/thei/shared/content-headings';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

type ListedExcerpt = Pick<PublicExcerpt, 'publicId' | 'title' | 'about'>;

/**
 * What tells one subject from another: its address, or the key of one closed
 * to the reader. Never its codename: those come from a short list, and two
 * closed subjects may go by the same one.
 */
function subjectKey(link: PublicEntityLink): string {
  return isPublicSecret(link) ? `key:${link.key}` : `href:${link.href}`;
}

/**
 * A page's own excerpts in its contents, in the owner's order, as the page
 * shows them: what a run of them is about, by name, and under it the title of
 * each, the way a heading stands over its subheadings. The same subject after
 * another one is named again, so the contents never part from the page.
 *
 * The entry of a subject leads to the first excerpt of its run and is lit
 * while any of them is read (`covers`). An excerpt about nothing any more
 * stands by its own title, with no icon either: the excerpt's icon marks the
 * block of excerpts written elsewhere about the page. One the reader may not
 * read is no entry at all: it is neither a heading nor a link.
 */
export function publicOwnExcerptContents(
  excerpts: readonly ListedExcerpt[],
  subjectName: (link: PublicEntityLink) => string,
): ContentHeading[] {
  const result: ContentHeading[] = [];
  let run: { key: string; entry: ContentHeading } | undefined;
  for (const excerpt of excerpts) {
    const id = excerptAnchorId(excerpt.publicId);
    const subject = excerpt.about[0];
    if (!subject) {
      run = undefined;
      result.push({
        title: excerpt.title,
        level: 2,
        id,
        href: `#${id}`,
        path: `excerpt:${excerpt.publicId}`,
      });
      continue;
    }
    const key = subjectKey(subject);
    if (run?.key !== key) {
      run = {
        key,
        entry: {
          title: subjectName(subject),
          level: 2,
          id,
          href: `#${id}`,
          path: `excerpt-subject:${excerpt.publicId}`,
          covers: [],
        },
      };
      result.push(run.entry);
    }
    run.entry.covers!.push(id);
    result.push({
      title: excerpt.title,
      level: 3,
      id,
      href: `#${id}`,
      path: `excerpt:${excerpt.publicId}`,
    });
  }
  return result;
}
