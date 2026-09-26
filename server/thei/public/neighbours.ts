import type {
  PublicNeighbour,
  PublicNeighbours,
} from '#layers/thei/shared/api/public';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import type { getProjectStages } from '../projects/stages';
import type { getProjectContentSections } from '../projects/content-sections';
import { buildPublicEntityPreviewMedia } from './content';
import {
  buildPublicProjectSectionSummary,
  buildPublicProjectStageSummary,
} from './entities';

type ProjectRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.projects.findByUuid>>
>;
type Stage = Awaited<ReturnType<typeof getProjectStages>>[number];
type Section = Awaited<ReturnType<typeof getProjectContentSections>>[number];

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
 * A stage's neighbours in time, among the stages the viewer may open. The
 * list comes from `getProjectStages`, which already orders them by period.
 */
export async function buildProjectStageNeighbours(
  project: ProjectRow,
  stages: Stage[],
  stage: Stage,
  isOwner: boolean,
): Promise<PublicNeighbours> {
  const visible = stages.filter((item) => isOwner || !item.isPrivate);
  return await describe(neighboursOf(visible, stage), async (item) => {
    const summary = await buildPublicProjectStageSummary(
      project,
      item,
      isOwner,
    );
    return { title: summary.title, href: summary.href, media: summary.media };
  });
}

/** A section's neighbours in the project's own order. */
export async function buildProjectSectionNeighbours(
  project: ProjectRow,
  sections: Section[],
  section: Section,
  isOwner: boolean,
): Promise<PublicNeighbours> {
  const visible = sections.filter((item) => isOwner || !item.isPrivate);
  return await describe(neighboursOf(visible, section), async (item) => {
    const summary = await buildPublicProjectSectionSummary(
      project,
      item,
      isOwner,
    );
    return { title: summary.title, href: summary.href, media: summary.media };
  });
}

/**
 * The entries written before and after a day. Only the owner steps onto
 * entries a visitor cannot find: a link shared for one entry opens that
 * entry, not the ones beside it.
 */
export async function buildDiaryEntryNeighbours(
  date: string,
  isAdmin: boolean,
): Promise<PublicNeighbours> {
  const pair = await THEI_SERVER.diary.findNeighbours(date, isAdmin);
  return await describe(
    { previous: pair.previous ?? undefined, next: pair.next ?? undefined },
    async (entry) => ({
      title: '',
      date: entry.date,
      href: buildDiaryUrl(entry.date),
      media: await buildPublicEntityPreviewMedia(
        'diary-entry',
        entry.diaryUuid,
        'diary-body',
        { type: 'diary-entry', date: entry.date },
        isAdmin,
      ),
    }),
  );
}
