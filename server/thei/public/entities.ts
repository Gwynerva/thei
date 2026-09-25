import { publicPagination } from './pagination';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { and, eq } from 'drizzle-orm';
import {
  AssetType,
  type OtherAssetUsageMeta,
  type ShowcaseAssetUsageMeta,
} from '#layers/thei/shared/asset';
import type {
  PublicEntitySummary,
  PublicEventResponseFull,
  PublicAction,
  PublicFile,
  PublicPaginatedResponse,
  PublicReferenceGroup,
  PublicReferenceLink,
  PublicReferences,
  PublicProjectSection,
  PublicProjectSectionResponse,
  PublicProjectResponse,
  PublicEntityReference,
  PublicProjectStage,
  PublicProjectStageResponse,
  PublicDiaryResponse,
  PublicTagListItem,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type {
  PublicPageListItem,
  PublicPageResponse,
} from '#layers/thei/shared/api/page';
import { coverDatedPeriods } from '#layers/thei/shared/date-precision';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import {
  externalLinkHostname,
  type ProjectExternalLink,
} from '#layers/thei/shared/external-link';
import {
  extractContentReferenceCandidates,
  type ContentReferenceLinkCandidate,
} from '#layers/thei/shared/public-content-reference';
import {
  splitPublicReferenceFiles,
  splitPublicReferenceLinks,
} from '#layers/thei/shared/public-references';
import { isPublicSecret } from '#layers/thei/shared/api/public';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { richTextToPlainText } from '#layers/thei/shared/rich-text';
import type {
  ContentOutputData,
  PublicContentOutputData,
} from '#layers/thei/shared/content';
import {
  buildProjectChildUrl,
  buildProjectUrl,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import { sortPublicTimelineItemsNewestFirst } from '#layers/thei/shared/public-timeline';
import type { TagItem } from '#layers/thei/shared/tag';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  archivedOriginalFromMeta,
  buildPublicProjectMedia,
  buildPublicEventMedia,
  buildPublicTagMedia,
  buildPublicPageMedia,
} from '../assets/urls';
import { resolveEntityIconMedia } from '../media/generated-icon';
import { getProjectContentSections } from '../projects/content-sections';
import { getProjectStages } from '../projects/stages';
import { getEventPeriods } from '../events/periods';
import {
  buildPublicRelatedLinks,
  countPublicRelated,
  resolvePublicRelated,
} from './related';
import {
  createExternalLinkLoader,
  findExternalLink,
} from '../external-links/repository';
import { getExternalLinkList } from '../external-links/lists';
import { listTagsForContainer } from '../tags';
import { parseInternalUrl } from '#layers/thei/shared/internal-url';
import { internalUrlSite } from '../site-url';
import {
  findContentEntity,
  findContentEntityByTarget,
} from '../content-entities';
import { buildSecretReference } from './secret';
import {
  buildPublicContentData,
  buildPublicEntityPreviewMedia,
  type PublicContentEntity,
} from './content';
import {
  entityNotesSlot,
  type EntityNotesOwner,
} from '#layers/thei/shared/entity-notes';
import { getCurrentStatus } from '../statuses';

/**
 * The two fields only the owner sees: the reminder that flags the entity, and
 * the notes kept at the bottom of its page. A visitor gets neither key at all,
 * so nothing downstream has to remember to strip them.
 */
async function buildOwnerOnlyNotes(
  owner: EntityNotesOwner,
  ownerId: string,
  entity: PublicContentEntity,
  reminder: string,
  isAdmin: boolean,
): Promise<{ reminder?: string; notes?: PublicContentOutputData }> {
  if (!isAdmin) return {};
  const notes = await buildPublicContentData(
    owner,
    ownerId,
    entityNotesSlot(owner),
    entity,
    true,
  );
  return {
    ...(reminder ? { reminder } : {}),
    ...(notes?.blocks.length ? { notes } : {}),
  };
}

type ProjectRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.projects.findByUuid>>
>;
type EventRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.events.findByUuid>>
>;
type PageRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.pages.findByUuid>>
>;

export function buildPublicEntityChronology(entity: {
  createdAt: number;
  updatedAt: number;
}) {
  const createdAt = new Date(entity.createdAt).toISOString().slice(0, 10);
  const updatedAt = new Date(entity.updatedAt).toISOString().slice(0, 10);
  return {
    createdAt,
    ...(updatedAt !== createdAt ? { updatedAt } : {}),
  };
}

export function canListPublicEntity(
  access: ProjectEventAccessLevel,
  isAdmin: boolean,
) {
  return isAdmin || access === ProjectEventAccessLevel.Public;
}

export function canOpenPublicEntity(
  access: ProjectEventAccessLevel,
  isAdmin: boolean,
) {
  return isAdmin || access !== ProjectEventAccessLevel.Private;
}

export function paginatePublic<T>(
  items: T[],
  pageValue: unknown,
  pageSize = 24,
): PublicPaginatedResponse<T> {
  const { page, pageCount, total } = publicPagination(
    items.length,
    pageValue,
    pageSize,
  );
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    pageCount,
    total,
  };
}

export async function buildPublicProjectSummary(
  project: ProjectRow,
  isAdmin = false,
): Promise<PublicEntitySummary> {
  const reference = await buildPublicEntityReference(project);
  return {
    type: 'project',
    title: reference.title,
    href: reference.href,
    summary: project.summary,
    access: project.access,
    media: reference.iconMedia,
    tags: await buildPublicTags(
      await listTagsForContainer('project', project.projectUuid),
    ),
    date: new Date(project.createdAt).toISOString().slice(0, 10),
    showcase: project.showcase,
    cv: project.cv,
    ...(isAdmin && project.reminder ? { reminder: project.reminder } : {}),
  };
}

export async function buildPublicEntityReference(
  project: ProjectRow,
): Promise<PublicEntityReference> {
  const icon = (
    await THEI_SERVER.assets.usages.findByContainer(
      'project',
      project.projectUuid,
    )
  ).find((usage) => usage.role === 'icon');
  return {
    entityType: 'project',
    title: project.title,
    summary: project.summary,
    href: buildProjectUrl(project.humanReadableSlug, project.publicId),
    iconMedia: resolveEntityIconMedia(
      'project',
      project.projectUuid,
      icon
        ? await buildPublicProjectMedia(project, icon.asset, 'icon')
        : undefined,
    ),
  };
}

export async function buildPublicEventSummary(
  event: EventRow,
  isAdmin = false,
): Promise<PublicEntitySummary> {
  const [media, periods, tags, relations] = await Promise.all([
    buildPublicEntityPreviewMedia(
      'event',
      event.eventUuid,
      'event-body',
      { type: 'event', ...event },
      isAdmin,
    ),
    getEventPeriods(event.eventUuid),
    listTagsForContainer('event', event.eventUuid),
    resolvePublicRelated({ type: 'event', id: event.eventUuid }, isAdmin),
  ]);
  return {
    type: 'event',
    title: event.title,
    summary: event.summary,
    href: buildEventUrl(event.humanReadableSlug, event.publicId),
    access: event.access,
    media,
    tags: await buildPublicTags(tags),
    date:
      periods
        .map((period) => period.endDate)
        .sort()
        .at(-1) ?? new Date(event.createdAt).toISOString().slice(0, 10),
    // A card names the projects an event belongs to, not everything around
    // it: the rest waits on the event's own page.
    relatedEntities: await buildPublicRelatedLinks(
      relations.filter((item) => item.endpoint.type === 'project'),
      isAdmin,
    ),
    ...(isAdmin && event.reminder ? { reminder: event.reminder } : {}),
  };
}

export async function buildPublicPageIcon(page: PageRow) {
  const icon = (
    await THEI_SERVER.assets.usages.findByContainer('page', page.pageUuid)
  ).find((usage) => usage.role === 'icon');
  return resolveEntityIconMedia(
    'page',
    page.pageUuid,
    icon ? await buildPublicPageMedia(page, icon.asset) : undefined,
  );
}

export async function buildPublicPageListItem(
  page: PageRow,
): Promise<PublicPageListItem> {
  return {
    title: page.title,
    summary: page.summary,
    href: buildPageUrl(page.slug),
    access: page.access,
    iconMedia: await buildPublicPageIcon(page),
    updatedAt: new Date(page.updatedAt).toISOString().slice(0, 10),
  };
}

export async function buildPublicPage(
  page: PageRow,
  isAdmin: boolean,
  /**
   * The private view of this page in particular, which a share link grants
   * without making its holder the owner of anything else. The owner's notes
   * and reminder follow `isAdmin` rather than this.
   */
  asOwner = isAdmin,
): Promise<PublicPageResponse> {
  const content = (await buildPublicContentData(
    'page',
    page.pageUuid,
    'page-body',
    { type: 'page', ...page },
    asOwner,
  )) ?? { blocks: [] };
  return {
    title: page.title,
    summary: page.summary,
    slug: page.slug,
    access: page.access,
    chronology: buildPublicEntityChronology(page),
    iconMedia: await buildPublicPageIcon(page),
    content,
    references: await buildPublicReferences(
      emptyPublicReferenceGroup(),
      await buildPublicContentReferenceGroup(content, asOwner),
      asOwner,
    ),
    ...(await buildOwnerOnlyNotes(
      'page',
      page.pageUuid,
      { type: 'page', ...page },
      page.reminder,
      isAdmin,
    )),
  };
}

export async function buildPublicProject(
  project: ProjectRow,
  isAdmin: boolean,
): Promise<Omit<PublicProjectResponse, 'timeline'>> {
  const usages = await THEI_SERVER.assets.usages.findByContainer(
    'project',
    project.projectUuid,
  );
  const icon = usages.find((usage) => usage.role === 'icon');
  const banner = usages.find((usage) => usage.role === 'banner');
  const [
    rawStages,
    rawSections,
    rawShowcase,
    rawFiles,
    tags,
    description,
    rawLinks,
    relations,
    status,
  ] = await Promise.all([
    getProjectStages(project.projectUuid),
    getProjectContentSections(project.projectUuid),
    THEI_SERVER.assets.usages.findShowcase(project.projectUuid),
    THEI_SERVER.assets.usages.findOther(project.projectUuid),
    listTagsForContainer('project', project.projectUuid),
    buildPublicContentData(
      'project',
      project.projectUuid,
      'project-description',
      { type: 'project', ...project },
      isAdmin,
    ),
    getExternalLinkList({ type: 'project', id: project.projectUuid }),
    resolvePublicRelated({ type: 'project', id: project.projectUuid }, isAdmin),
    getCurrentStatus({ type: 'project', id: project.projectUuid }, isAdmin),
  ]);
  const visibleStages = rawStages.filter(
    (stage) => isAdmin || !stage.isPrivate,
  );
  const visibleSections = rawSections.filter(
    (section) => isAdmin || !section.isPrivate,
  );
  const showcase = await Promise.all(
    rawShowcase
      .filter(
        ({ asset }) =>
          asset.type === AssetType.Image || asset.type === AssetType.Video,
      )
      .map(async ({ asset, meta }) => {
        if (!isAdmin && usageIsPrivate(meta))
          return buildSecretReference(
            'media',
            `${project.projectUuid}:${asset.assetUuid}`,
          );
        const item = meta as ShowcaseAssetUsageMeta | null;
        const href = `${buildProjectUrl(project.humanReadableSlug, project.publicId)}media/showcase-asset/${asset.slug}.${asset.extension}`;
        return buildPublicAssetDescriptor(
          asset,
          href,
          await buildPublicProjectMedia(project, asset, 'showcase-asset'),
          item?.role === 'showcase-asset' ? (item.caption ?? '') : '',
        );
      }),
  );
  const files = await Promise.all(
    rawFiles.map(({ asset, meta }) =>
      !isAdmin && usageIsPrivate(meta)
        ? buildSecretReference(
            'file',
            `${project.projectUuid}:${asset.assetUuid}`,
          )
        : buildPublicDirectFile(
            project,
            asset,
            meta as OtherAssetUsageMeta | null,
          ),
    ),
  );
  const [unsortedStageItems, sectionItems] = await Promise.all([
    Promise.all(
      visibleStages.map((stage) =>
        buildPublicProjectStageSummary(project, stage, isAdmin),
      ),
    ),
    Promise.all(
      visibleSections.map((section) =>
        buildPublicProjectSectionSummary(project, section, isAdmin),
      ),
    ),
  ]);
  const stageItems = sortPublicTimelineItemsNewestFirst(
    unsortedStageItems,
    (stage) => stage.period,
  );
  const manualReferences = buildPublicManualReferenceGroup(
    rawLinks,
    files,
    isAdmin,
  );
  return {
    title: project.title,
    summary: project.summary,
    access: project.access,
    humanReadableSlug: project.humanReadableSlug,
    publicId: project.publicId,
    chronology: {
      ...buildPublicEntityChronology(project),
      ...(status.firstAt ? { firstStatusAt: status.firstAt } : {}),
    },
    isShowcase: project.showcase,
    isCv: project.cv,
    iconMedia: resolveEntityIconMedia(
      'project',
      project.projectUuid,
      icon
        ? await buildPublicProjectMedia(project, icon.asset, 'icon')
        : undefined,
    ),
    bannerMedia: banner
      ? await buildPublicProjectMedia(project, banner.asset, 'banner')
      : undefined,
    description,
    stages: stageItems,
    sections: sectionItems,
    showcase,
    files,
    tags: await buildPublicTags(tags),
    related: countPublicRelated(relations),
    currentStatus: status.current,
    statusCount: status.total,
    references: await buildPublicReferences(
      manualReferences,
      await buildPublicContentReferenceGroup(description, isAdmin),
      isAdmin,
    ),
    action: await buildPublicAction(project, usages, isAdmin),
    ...(await buildOwnerOnlyNotes(
      'project',
      project.projectUuid,
      { type: 'project', ...project },
      project.reminder,
      isAdmin,
    )),
  };
}

export async function buildPublicProjectStageSummary(
  project: Pick<ProjectRow, 'humanReadableSlug' | 'publicId'>,
  stage: Awaited<ReturnType<typeof getProjectStages>>[number],
  isAdmin = false,
): Promise<PublicProjectStage> {
  const period = coverDatedPeriods(stage.periods);
  return {
    title: stage.title,
    summary: stage.summary,
    date: period.endDate,
    period,
    periods: stage.periods,
    media: await buildPublicEntityPreviewMedia(
      'project-stage',
      stage.stageUuid,
      'project-stage-body',
      { type: 'project', ...project },
      isAdmin,
    ),
    href: buildProjectChildUrl(
      project.humanReadableSlug,
      project.publicId,
      'stages',
      stage.humanReadableSlug,
      stage.publicId,
    ),
  };
}

export async function buildPublicProjectSectionSummary(
  project: Pick<ProjectRow, 'humanReadableSlug' | 'publicId'>,
  section: Awaited<ReturnType<typeof getProjectContentSections>>[number],
  isAdmin = false,
): Promise<PublicProjectSection> {
  return {
    title: section.title,
    summary: section.summary,
    date: new Date(section.createdAt).toISOString().slice(0, 10),
    media: await buildPublicEntityPreviewMedia(
      'project-section',
      section.sectionUuid,
      'project-section-body',
      { type: 'project', ...project },
      isAdmin,
    ),
    href: buildProjectChildUrl(
      project.humanReadableSlug,
      project.publicId,
      'sections',
      section.humanReadableSlug,
      section.publicId,
    ),
  };
}

export async function buildPublicProjectChildParent(project: ProjectRow) {
  return {
    ...(await buildPublicEntityReference(project)),
    access: project.access,
    humanReadableSlug: project.humanReadableSlug,
    publicId: project.publicId,
  };
}

export async function buildPublicProjectStage(
  project: ProjectRow,
  stage: Awaited<ReturnType<typeof getProjectStages>>[number],
  isAdmin: boolean,
): Promise<PublicProjectStageResponse> {
  const [summary, content, parent] = await Promise.all([
    buildPublicProjectStageSummary(project, stage, isAdmin),
    buildPublicContentData(
      'project-stage',
      stage.stageUuid,
      'project-stage-body',
      { type: 'project', ...project },
      isAdmin,
    ),
    buildPublicProjectChildParent(project),
  ]);
  return {
    ...summary,
    humanReadableSlug: stage.humanReadableSlug,
    publicId: stage.publicId,
    chronology: buildPublicEntityChronology(stage),
    content,
    project: parent,
    references: await buildPublicReferences(
      emptyPublicReferenceGroup(),
      await buildPublicContentReferenceGroup(content, isAdmin),
      isAdmin,
    ),
  };
}

export async function buildPublicProjectSection(
  project: ProjectRow,
  section: Awaited<ReturnType<typeof getProjectContentSections>>[number],
  isAdmin: boolean,
): Promise<PublicProjectSectionResponse> {
  const [summary, content, parent] = await Promise.all([
    buildPublicProjectSectionSummary(project, section, isAdmin),
    buildPublicContentData(
      'project-section',
      section.sectionUuid,
      'project-section-body',
      { type: 'project', ...project },
      isAdmin,
    ),
    buildPublicProjectChildParent(project),
  ]);
  return {
    ...summary,
    humanReadableSlug: section.humanReadableSlug,
    publicId: section.publicId,
    chronology: buildPublicEntityChronology(section),
    content: content ?? { blocks: [] },
    project: parent,
    references: await buildPublicReferences(
      emptyPublicReferenceGroup(),
      await buildPublicContentReferenceGroup(content, isAdmin),
      isAdmin,
    ),
  };
}

export async function buildPublicEvent(
  stored: EventRow,
  isAdmin: boolean,
): Promise<PublicEventResponseFull> {
  const [periods, content, rawFiles, rawLinks, tags, relations, usages] =
    await Promise.all([
      getEventPeriods(stored.eventUuid),
      buildPublicContentData(
        'event',
        stored.eventUuid,
        'event-body',
        { type: 'event', ...stored },
        isAdmin,
      ),
      THEI_SERVER.assets.usages.findOtherForContainer(
        'event',
        stored.eventUuid,
      ),
      getExternalLinkList({ type: 'event', id: stored.eventUuid }),
      listTagsForContainer('event', stored.eventUuid),
      resolvePublicRelated({ type: 'event', id: stored.eventUuid }, isAdmin),
      THEI_SERVER.assets.usages.findByContainer('event', stored.eventUuid),
    ]);
  const files = await Promise.all(
    rawFiles.map(({ asset, meta }) => {
      if (!isAdmin && usageIsPrivate(meta))
        return buildSecretReference(
          'file',
          `${stored.eventUuid}:${asset.assetUuid}`,
        );
      const item = meta as OtherAssetUsageMeta | null;
      const href = `${buildEventUrl(stored.humanReadableSlug, stored.publicId)}other-asset/${asset.slug}.${asset.extension}`;
      return {
        key: asset.slug,
        title:
          item?.role === 'other-asset'
            ? richTextToPlainText(item.title ?? '')
            : '',
        description:
          item?.role === 'other-asset' && item.caption
            ? richTextToPlainText(item.caption)
            : undefined,
        href,
        extension: asset.extension,
        size: asset.size,
        archivedOriginal: archivedOriginalFromMeta(asset.meta),
      } satisfies PublicFile;
    }),
  );
  const manual = buildPublicManualReferenceGroup(rawLinks, files, isAdmin);
  return {
    title: stored.title,
    summary: stored.summary,
    access: stored.access,
    humanReadableSlug: stored.humanReadableSlug,
    publicId: stored.publicId,
    periods,
    chronology: buildPublicEntityChronology(stored),
    content: content ?? { blocks: [] },
    references: await buildPublicReferences(
      manual,
      await buildPublicContentReferenceGroup(content, isAdmin),
      isAdmin,
    ),
    tags: await buildPublicTags(tags),
    related: countPublicRelated(relations),
    action: await buildPublicAction(stored, usages, isAdmin),
    ...(await buildOwnerOnlyNotes(
      'event',
      stored.eventUuid,
      { type: 'event', ...stored },
      stored.reminder,
      isAdmin,
    )),
  };
}

/** Whether a placement is hidden from visitors by its own privacy flag. */
function usageIsPrivate(meta: unknown): boolean {
  return Boolean(
    meta && typeof meta === 'object' && 'isPrivate' in meta && meta.isPrivate,
  );
}

function emptyPublicReferenceGroup(): PublicReferenceGroup {
  return { links: [], files: [] };
}

/** An entity's own list of links as the sidebar shows it: the name the admin gave each one first. */
export function buildPublicManualReferenceGroup(
  links: ProjectExternalLink[],
  files: PublicReferenceGroup['files'],
  includePrivate: boolean,
): PublicReferenceGroup {
  return {
    links: links
      .filter((link) => includePrivate || !link.isPrivate)
      .map((link): PublicReferenceLink => ({
        kind: 'external',
        title: link.name || link.title || externalLinkHostname(link.url),
        href: link.url,
        description: link.description,
        iconMedia: link.faviconMedia,
      })),
    files,
  };
}

/**
 * One diary entry's page.
 *
 * The shortest builder in the file, and that is the point: an entry is its
 * day and what was written on it, plus whatever its own text refers to.
 */
export async function buildPublicDiaryEntry(
  stored: {
    diaryUuid: string;
    date: string;
    access: ProjectEventAccessLevel;
    reminder: string;
    createdAt: number;
    updatedAt: number;
  },
  isAdmin: boolean,
  asOwner = isAdmin,
): Promise<PublicDiaryResponse> {
  const [content, relations] = await Promise.all([
    buildPublicContentData(
      'diary-entry',
      stored.diaryUuid,
      'diary-body',
      { type: 'diary-entry', date: stored.date },
      asOwner,
    ),
    resolvePublicRelated(
      { type: 'diary-entry', id: stored.diaryUuid },
      isAdmin,
    ),
  ]);
  return {
    date: stored.date,
    access: stored.access,
    chronology: buildPublicEntityChronology(stored),
    content: content ?? { blocks: [] },
    references: await buildPublicReferences(
      emptyPublicReferenceGroup(),
      await buildPublicContentReferenceGroup(content, asOwner),
      asOwner,
    ),
    related: countPublicRelated(relations),
    ...(await buildOwnerOnlyNotes(
      'diary-entry',
      stored.diaryUuid,
      { type: 'diary-entry', date: stored.date },
      stored.reminder,
      isAdmin,
    )),
  };
}

export async function buildPublicContentReferenceGroup(
  content: ContentOutputData | PublicContentOutputData | null | undefined,
  includePrivate: boolean,
): Promise<PublicReferenceGroup> {
  const referenceContent: ContentOutputData | undefined = content
    ? {
        blocks: content.blocks.flatMap((block) => {
          if (block.type === 'privateSectionPlaceholder') return [];
          if (block.type === 'privateSectionExpanded') return block.data.blocks;
          return [block];
        }),
      }
    : undefined;
  const candidates = extractContentReferenceCandidates(
    referenceContent,
    includePrivate,
  );
  const loadExternalLink = createExternalLinkLoader();
  const links = await Promise.all(
    candidates.links.map((candidate) =>
      buildPublicReferenceLink(candidate, includePrivate, loadExternalLink),
    ),
  );
  return {
    links: links.filter((link): link is PublicReferenceLink => Boolean(link)),
    files: candidates.files
      .map(({ asset, title, caption }): PublicFile | undefined => {
        if (!asset.assetUrl || !asset.extension) return undefined;
        return {
          key: asset.assetUuid,
          title: richTextToPlainText(title ?? ''),
          description: caption ? richTextToPlainText(caption) : undefined,
          href: asset.assetUrl,
          extension: asset.extension,
          size: asset.size ?? 0,
          media: asset.media,
          archivedOriginal: asset.archivedOriginal,
        };
      })
      .filter((file): file is PublicFile => Boolean(file)),
  };
}

/**
 * Resolves a link candidate into what the sidebar shows. An external address
 * that opens an entity of this very site is shown as that entity, so it looks
 * like — and merges with — a link made through the entity picker.
 */
async function buildPublicReferenceLink(
  candidate: ContentReferenceLinkCandidate,
  includePrivate: boolean,
  loadExternalLink: ReturnType<
    typeof createExternalLinkLoader
  > = findExternalLink,
): Promise<PublicReferenceLink | undefined> {
  const resolved =
    candidate.kind === 'external'
      ? {
          ...(await resolveSiteEntityCandidate(candidate.url)),
          note: candidate.note,
        }
      : candidate;
  // A note is why the link was worth making, which says more in a list than
  // the name of whatever it points at.
  if (resolved.kind === 'external') {
    const link = await loadExternalLink(resolved.url);
    return {
      kind: 'external',
      title: resolved.note || link?.title || externalLinkHostname(resolved.url),
      href: resolved.url,
      description: link?.description,
      iconMedia: link?.faviconMedia,
    };
  }
  const entity = await findContentEntity(resolved, includePrivate);
  if (!entity || !canOpenPublicEntity(entity.access, includePrivate))
    return undefined;
  const iconMedia = await entity.media('public', includePrivate);
  return {
    kind: entity.entityType,
    title: resolved.note || entity.title,
    href: entity.href,
    description: entity.summary,
    // A diary entry is called by its day, which the page writes out; a note
    // replaces the day just as it replaces any other title.
    ...(entity.date && !resolved.note ? { date: entity.date } : {}),
    ...(iconMedia ? { iconMedia } : {}),
  };
}

/**
 * Maps an address on this site's own origin back to the entity it opens.
 * Anything else — another origin, a tab, a file, an unknown entity — stays an
 * external link.
 */
export async function resolveSiteEntityCandidate(
  url: string,
): Promise<ContentReferenceLinkCandidate> {
  const external = { kind: 'external' as const, url };
  // Only absolute addresses: a manual link is always written as one, and a
  // bare path would be taken for this site whatever the author meant.
  if (!/^https?:\/\//i.test(url)) return external;
  const target = parseInternalUrl(url, internalUrlSite());
  const entity = target && (await findContentEntityByTarget(target, false));
  return entity
    ? {
        kind: 'entity',
        entityType: entity.entityType,
        entityId: entity.entityId,
      }
    : external;
}

/**
 * Builds the sidebar's "Links" and "Files": manual and content references,
 * with everything that appears in both lifted into `shared`.
 */
export async function buildPublicReferences(
  manual: PublicReferenceGroup,
  content: PublicReferenceGroup,
  includePrivate: boolean,
): Promise<PublicReferences> {
  const manualLinks = await Promise.all(
    manual.links.map((link) =>
      link.kind === 'external'
        ? buildManualSiteLink(link, includePrivate)
        : link,
    ),
  );
  // One file is the same file wherever its bytes are: two placements may hold
  // separate rows over one stored file.
  const hashes = new Map<string, string>();
  await Promise.all(
    [...manual.files, ...content.files].map(async (file) => {
      if (isPublicSecret(file) || hashes.has(file.key)) return;
      const asset = await THEI_SERVER.assets.findBySlug(file.key);
      if (asset) hashes.set(file.key, asset.contentHash);
    }),
  );
  return {
    links: splitPublicReferenceLinks(
      manualLinks.filter((link): link is PublicReferenceLink => Boolean(link)),
      content.links,
    ),
    files: splitPublicReferenceFiles(
      manual.files,
      content.files,
      (file) => hashes.get(file.key) ?? file.key,
    ),
  };
}

/** A hand-added address of this site becomes the entity it opens. */
async function buildManualSiteLink(
  link: PublicReferenceLink,
  includePrivate: boolean,
): Promise<PublicReferenceLink | undefined> {
  const candidate = await resolveSiteEntityCandidate(link.href);
  if (candidate.kind === 'external') return link;
  return buildPublicReferenceLink(candidate, includePrivate);
}

export async function buildPublicTags(
  tags: TagItem[],
): Promise<PublicTagSummary[]> {
  const { db, schema } = THEI_SERVER.useDb();
  return Promise.all(
    tags.map(async (tag) => {
      const icon = db
        .select({ asset: schema.assets })
        .from(schema.assetUsages)
        .innerJoin(
          schema.assets,
          eq(schema.assetUsages.assetUuid, schema.assets.assetUuid),
        )
        .where(
          and(
            eq(schema.assetUsages.containerType, 'tag'),
            eq(schema.assetUsages.containerId, tag.tagUuid),
            eq(schema.assetUsages.role, 'icon'),
          ),
        )
        .get();
      return {
        title: tag.title,
        slug: tag.slug,
        publicId: tag.publicId,
        description: tag.description,
        iconMedia: icon
          ? await buildPublicTagMedia(tag, icon.asset)
          : undefined,
      };
    }),
  );
}

export async function buildPublicTagListItems(
  rows: Array<{ tag: any; projectCount: number; eventCount: number }>,
): Promise<PublicTagListItem[]> {
  const tags = await buildPublicTags(
    rows.map(({ tag }) => ({
      tagUuid: tag.tagUuid,
      title: tag.title,
      slug: tag.slug,
      publicId: tag.publicId,
      description: tag.description || undefined,
    })),
  );
  return tags.map((tag, index) => ({
    ...tag,
    projectCount: rows[index]!.projectCount,
    eventCount: rows[index]!.eventCount,
  }));
}

function buildPublicDirectFile(
  project: ProjectRow,
  asset: any,
  meta: OtherAssetUsageMeta | null,
): PublicFile {
  return {
    key: asset.slug,
    title:
      meta?.role === 'other-asset' ? richTextToPlainText(meta.title ?? '') : '',
    description:
      meta?.role === 'other-asset' && meta.caption
        ? richTextToPlainText(meta.caption)
        : undefined,
    href: `${buildProjectUrl(project.humanReadableSlug, project.publicId)}media/other-asset/${asset.slug}.${asset.extension}`,
    extension: asset.extension,
    size: asset.size,
    archivedOriginal: archivedOriginalFromMeta(asset.meta),
  };
}

function buildPublicAssetDescriptor(
  asset: any,
  href: string,
  media: Awaited<ReturnType<typeof buildPublicProjectMedia>> | undefined,
  title: string,
  description?: string,
): PublicFile {
  return {
    key: asset.slug,
    title: richTextToPlainText(title),
    description: description ? richTextToPlainText(description) : undefined,
    href,
    extension: asset.extension,
    size: asset.size,
    media,
    archivedOriginal: archivedOriginalFromMeta(asset.meta),
  };
}

export async function buildPublicAction(
  entity: ProjectRow | EventRow,
  usages: Awaited<ReturnType<typeof THEI_SERVER.assets.usages.findByContainer>>,
  isAdmin: boolean,
): Promise<PublicAction | undefined> {
  const action = entity.action;
  if (!action?.enabled || (!isAdmin && action.isPrivate)) return;
  const isProject = 'projectUuid' in entity;
  const url = isProject
    ? buildProjectUrl(entity.humanReadableSlug, entity.publicId)
    : buildEventUrl(entity.humanReadableSlug, entity.publicId);
  const icon = usages.find((usage) => usage.role === 'action-icon');
  const background = usages.find((usage) => usage.role === 'action-background');
  const file = usages.find((usage) => usage.role === 'action-file');
  const media = (usage: typeof icon) => {
    if (
      !usage ||
      (usage.asset.type !== AssetType.Image &&
        usage.asset.type !== AssetType.Video)
    )
      return undefined;
    return isProject
      ? buildPublicProjectMedia(entity, usage.asset, usage.role)
      : buildPublicEventMedia(entity, usage.asset, usage.role);
  };
  const href =
    action.target === 'external-link'
      ? action.externalUrl
      : file
        ? `${url}${isProject ? 'media/' : ''}action-file/${file.asset.slug}.${file.asset.extension}`
        : undefined;
  if (!href) return;
  const actionLink =
    action.target === 'external-link' && action.externalUrl
      ? await findExternalLink(action.externalUrl)
      : undefined;
  return {
    text: action.text,
    accentColor: action.accentColor,
    target: action.target,
    href,
    iconMedia: action.iconMode === 'asset' ? await media(icon) : undefined,
    fileMedia: action.target === 'file' ? await media(file) : undefined,
    faviconMedia: actionLink?.faviconMedia,
    useFavicon: action.iconMode === 'favicon',
    backgroundMedia: await media(background),
    backgroundMode: action.backgroundMode,
    backgroundSize: action.backgroundSize,
    backgroundRepeat: action.backgroundRepeat,
  };
}

export { buildTagUrl };
