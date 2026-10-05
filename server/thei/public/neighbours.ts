import type {
  PublicNeighbour,
  PublicNeighbours,
} from '#layers/thei/shared/api/public';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { diaryContentExcerpt } from '#layers/thei/shared/diary-text';
import {
  isDatedSection,
  sortStagesNewestFirst,
} from '#layers/thei/shared/project-content-item';
import type { ProjectSectionRecord } from '../projects/content-sections';
import { buildPublicEntityPreviewMedia } from './content';
import { buildPublicProjectSectionSummary } from './entities';

type ProjectRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.projects.findByUuid>>
>;
type Section = ProjectSectionRecord;

/** The items right before and right after `current` in an ordered list. */
export function neighboursOf<T>(items: readonly T[], current: T) {
  const index = items.indexOf(current);
  if (index < 0) return {};
  return {
    previous: index > 0 ? items[index - 1] : undefined,
    next: index < items.length - 1 ? items[index + 1] : undefined,
  };
}

async function describe<T>(
  pair: { previous?: T; next?: T },
  build: (item: T) => Promise<PublicNeighbour>,
): Promise<PublicNeighbours> {
  const [previous, next] = await Promise.all([
    pair.previous === undefined ? undefined : build(pair.previous),
    pair.next === undefined ? undefined : build(pair.next),
  ]);
  return {
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
  };
}

/**
 * A section's neighbours among the sections of its own kind the viewer may
 * open: a dated one beside the dated ones in time, each with its stretch; an
 * undated one beside the undated ones in the project's own order, each with
 * what it is about. The list comes from `listProjectSections`, which keeps
 * both orders.
 */
export async function buildProjectSectionNeighbours(
  project: ProjectRow,
  sections: Section[],
  section: Section,
  isOwner: boolean,
): Promise<PublicNeighbours> {
  const dated = isDatedSection(section);
  const visible = sections.filter(
    (item) => (isOwner || !item.isPrivate) && isDatedSection(item) === dated,
  );
  // The stages from the oldest, in the order their page lists them and
  // counts them.
  const ordered = dated ? sortStagesNewestFirst(visible).reverse() : visible;
  return await describe(neighboursOf(ordered, section), async (item) => {
    const summary = await buildPublicProjectSectionSummary(
      project,
      item,
      isOwner,
    );
    return {
      title: summary.title,
      href: summary.href,
      media: summary.media,
      ...(summary.period
        ? { period: summary.period }
        : summary.summary
          ? { summary: summary.summary }
          : {}),
    };
  });
}

/**
 * The entries written before and after a day, each with how it begins. Only
 * the owner steps onto entries a visitor cannot find: a link shared for one
 * entry opens that entry, not the ones beside it. A private section of an
 * entry stays out of what a visitor reads of its beginning.
 */
export async function buildDiaryEntryNeighbours(
  date: string,
  isAdmin: boolean,
): Promise<PublicNeighbours> {
  const pair = await THEI_SERVER.diary.findNeighbours(date, isAdmin);
  return await describe(
    { previous: pair.previous ?? undefined, next: pair.next ?? undefined },
    async (entry) => {
      const [media, content] = await Promise.all([
        buildPublicEntityPreviewMedia(
          'diary-entry',
          entry.diaryUuid,
          'diary-body',
          { type: 'diary-entry', date: entry.date },
          isAdmin,
        ),
        THEI_SERVER.content.findByOwner(
          'diary-entry',
          entry.diaryUuid,
          'diary-body',
        ),
      ]);
      const summary = diaryContentExcerpt(
        content?.data,
        isAdmin,
        THEI_SERVER.phrase.content_private_section,
      );
      return {
        title: '',
        date: entry.date,
        href: buildDiaryUrl(entry.date),
        media,
        ...(summary ? { summary } : {}),
      };
    },
  );
}
