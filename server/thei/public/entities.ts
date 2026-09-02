import { publicPagination } from './pagination';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { and, eq } from 'drizzle-orm';
import {
  AssetType,
  assetSourceName,
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
  PublicProjectSection,
  PublicProjectSectionResponse,
  PublicProjectResponse,
  PublicProjectReference,
  PublicProjectStage,
  PublicProjectStageResponse,
  PublicTagListItem,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type {
  PublicPageListItem,
  PublicPageResponse,
} from '#layers/thei/shared/api/page';
import { coverDateRanges } from '#layers/thei/shared/date-range';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { externalLinkHostname } from '#layers/thei/shared/external-link';
import { extractContentReferenceCandidates } from '#layers/thei/shared/public-content-reference';
import { richTextToPlainText } from '#layers/thei/shared/rich-text';
import type {
  ContentOutputData,
  PublicContentOutputData,
} from '#layers/thei/shared/content';
import {
  buildProjectChildUrl,
  buildProjectUrl,
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
import { getProjectExternalLinks } from '../projects/external-links';
import { getProjectRelations } from '../projects/relations';
import { getEventPeriods } from '../events/periods';
import { getEventRelations } from '../events/relations';
import { getEventExternalLinks } from '../events/external-links';
import { findExternalLink } from '../external-links/repository';
import { listTagsForContainer } from '../tags';
import {
  buildPublicContentData,
  buildPublicContentPreviewMedia,
} from './content';

type ProjectRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.projects.findByUuid>>
>;
type EventRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.events.findByUuid>>
>;
type PageRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.pages.findByUuid>>
>;

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
): Promise<PublicEntitySummary> {
  const reference = await buildPublicProjectReference(project);
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
  };
}

export async function buildPublicProjectReference(
  project: ProjectRow,
): Promise<PublicProjectReference> {
  const icon = (
    await THEI_SERVER.assets.usages.findByContainer(
      'project',
      project.projectUuid,
    )
  ).find((usage) => usage.role === 'icon');
  return {
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
    buildPublicContentPreviewMedia(
      'event',
      event.eventUuid,
      'event-body',
      { type: 'event', ...event },
      isAdmin,
    ),
    getEventPeriods(event.eventUuid),
    listTagsForContainer('event', event.eventUuid),
    getEventRelations(event.eventUuid),
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
    relatedProjects: await buildRelatedProjectReferences(relations, isAdmin),
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
): Promise<PublicPageResponse> {
  const content = (await buildPublicContentData(
    'page',
    page.pageUuid,
    'page-body',
    { type: 'page', ...page },
    isAdmin,
  )) ?? { blocks: [] };
  return {
    title: page.title,
    summary: page.summary,
    slug: page.slug,
    access: page.access,
    iconMedia: await buildPublicPageIcon(page),
    content,
    references: {
      manual: { links: [], files: [] },
      content: await buildPublicContentReferenceGroup(content, isAdmin),
    },
  };
}

async function buildRelatedProjectReferences(
  relations: Awaited<ReturnType<typeof getEventRelations>>,
  isAdmin: boolean,
) {
  const references = await Promise.all(
    relations.map(async (relation) => {
      const project = await THEI_SERVER.projects.findByUuid(
        relation.projectUuid,
      );
      if (!project || !canListPublicEntity(project.access, isAdmin))
        return undefined;
      return {
        ...(await buildPublicProjectReference(project)),
        relationType: 'related' as const,
      };
    }),
  );
  return references.filter((item) => item !== undefined);
}

export async function buildPublicProject(
  project: ProjectRow,
  isAdmin: boolean,
): Promise<PublicProjectResponse> {
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
    getProjectExternalLinks(project.projectUuid),
    getProjectRelations(project.projectUuid),
  ]);
  const visibleStages = rawStages.filter(
    (stage) => isAdmin || !stage.isPrivate,
  );
  const visibleSections = rawSections.filter(
    (section) => isAdmin || !section.isPrivate,
  );
  const showcase = await Promise.all(
    rawShowcase
      .filter(({ meta }) =>
        isAdmin || meta?.role !== 'showcase-asset' ? true : !meta.isPrivate,
      )
      .filter(
        ({ asset }) =>
          asset.type === AssetType.Image || asset.type === AssetType.Video,
      )
      .map(async ({ asset, meta }) => {
        const item = meta as ShowcaseAssetUsageMeta | null;
        const href = `${buildProjectUrl(project.humanReadableSlug, project.publicId)}media/showcase-asset/${asset.slug}.${asset.extension}`;
        return buildPublicAssetDescriptor(
          asset,
          href,
          await buildPublicProjectMedia(project, asset, 'showcase-asset'),
          assetSourceName(asset.meta) || asset.slug,
          item?.role === 'showcase-asset' ? item.caption : undefined,
        );
      }),
  );
  const files = await Promise.all(
    rawFiles
      .filter(({ meta }) =>
        isAdmin || meta?.role !== 'other-asset' ? true : !meta.isPrivate,
      )
      .map(({ asset, meta }) =>
        buildPublicDirectFile(
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
  const relatedProjects = await buildProjectRelationReferences(
    relations,
    isAdmin,
  );
  const visibleStagePeriods = visibleStages.flatMap((stage) => stage.periods);
  const firstStageAt = visibleStagePeriods
    .map((period) => period.startDate)
    .sort()
    .at(0);
  const lastStageAt = visibleStagePeriods
    .map((period) => period.endDate)
    .sort()
    .at(-1);
  return {
    title: project.title,
    summary: project.summary,
    access: project.access,
    humanReadableSlug: project.humanReadableSlug,
    publicId: project.publicId,
    chronology: {
      createdAt: new Date(project.createdAt).toISOString().slice(0, 10),
      firstStageAt,
      lastStageAt,
      updatedAt: new Date(project.updatedAt).toISOString().slice(0, 10),
    },
    isShowcase: project.showcase,
    isPortfolio: project.cv,
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
    relatedProjects,
    references: {
      manual: manualReferences,
      content: await buildPublicContentReferenceGroup(description, isAdmin),
    },
    action: await buildPublicAction(project, usages, isAdmin),
  };
}

export async function buildPublicProjectStageSummary(
  project: Pick<ProjectRow, 'humanReadableSlug' | 'publicId'>,
  stage: Awaited<ReturnType<typeof getProjectStages>>[number],
  isAdmin = false,
): Promise<PublicProjectStage> {
  const period = coverDateRanges(stage.periods);
  return {
    title: stage.title,
    summary: stage.summary,
    date: period.endDate,
    period,
    periods: stage.periods,
    media: await buildPublicContentPreviewMedia(
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
    media: await buildPublicContentPreviewMedia(
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
    ...(await buildPublicProjectReference(project)),
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
    content,
    project: parent,
    references: {
      manual: emptyPublicReferenceGroup(),
      content: await buildPublicContentReferenceGroup(content, isAdmin),
    },
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
    content: content ?? { blocks: [] },
    project: parent,
    references: {
      manual: emptyPublicReferenceGroup(),
      content: await buildPublicContentReferenceGroup(content, isAdmin),
    },
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
      getEventExternalLinks(stored.eventUuid),
      listTagsForContainer('event', stored.eventUuid),
      getEventRelations(stored.eventUuid),
      THEI_SERVER.assets.usages.findByContainer('event', stored.eventUuid),
    ]);
  const files = await Promise.all(
    rawFiles
      .filter(({ meta }) =>
        isAdmin || meta?.role !== 'other-asset' ? true : !meta.isPrivate,
      )
      .map(({ asset, meta }) => {
        const item = meta as OtherAssetUsageMeta | null;
        const href = `${buildEventUrl(stored.humanReadableSlug, stored.publicId)}other-asset/${asset.slug}.${asset.extension}`;
        return {
          key: asset.slug,
          title:
            item?.role === 'other-asset'
              ? richTextToPlainText(item.title || asset.slug)
              : asset.slug,
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
  const relatedProjects = await buildRelatedProjectReferences(
    relations,
    isAdmin,
  );
  const manual = buildPublicManualEventReferenceGroup(rawLinks, files, isAdmin);
  return {
    title: stored.title,
    summary: stored.summary,
    access: stored.access,
    humanReadableSlug: stored.humanReadableSlug,
    publicId: stored.publicId,
    periods,
    content: content ?? { blocks: [] },
    references: {
      manual,
      content: await buildPublicContentReferenceGroup(content, isAdmin),
    },
    tags: await buildPublicTags(tags),
    relatedProjects,
    action: await buildPublicAction(stored, usages, isAdmin),
  };
}

function emptyPublicReferenceGroup(): PublicReferenceGroup {
  return { links: [], files: [] };
}

export function buildPublicManualEventReferenceGroup(
  links: Awaited<ReturnType<typeof getEventExternalLinks>>,
  files: PublicFile[],
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

function buildPublicManualReferenceGroup(
  links: Awaited<ReturnType<typeof getProjectExternalLinks>>,
  files: PublicFile[],
  includePrivate: boolean,
): PublicReferenceGroup {
  return {
    links: links
      .filter((link) => includePrivate || !link.isPrivate)
      .map((link) => ({
        kind: 'external' as const,
        title: link.name || link.title || externalLinkHostname(link.url),
        href: link.url,
        description: link.description,
        iconMedia: link.faviconMedia,
      })),
    files,
  };
}

async function buildProjectRelationReferences(
  relations: Awaited<ReturnType<typeof getProjectRelations>>,
  isAdmin: boolean,
) {
  const references = await Promise.all(
    relations.map(async ({ projectUuid, type }) => {
      const project = await THEI_SERVER.projects.findByUuid(projectUuid);
      if (!project || !canListPublicEntity(project.access, isAdmin))
        return undefined;
      return {
        ...(await buildPublicProjectReference(project)),
        relationType: type,
      };
    }),
  );
  return references.filter((item) => item !== undefined);
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
  const links = await Promise.all(
    candidates.links.map(
      async (candidate): Promise<PublicReferenceLink | undefined> => {
        if (candidate.kind === 'external') {
          const link = await findExternalLink(candidate.url);
          return {
            kind: 'external',
            title: link?.title || externalLinkHostname(candidate.url),
            href: candidate.url,
            description: link?.description,
            iconMedia: link?.faviconMedia,
          };
        }
        if (candidate.kind === 'project') {
          const project = await THEI_SERVER.projects.findByUuid(
            candidate.projectUuid,
          );
          if (!project || !canOpenPublicEntity(project.access, includePrivate))
            return undefined;
          const reference = await buildPublicProjectReference(project);
          return {
            kind: 'project',
            title: reference.title,
            href: reference.href,
            description: reference.summary,
            iconMedia: reference.iconMedia,
          };
        }
        if (candidate.kind === 'event') {
          const event = await THEI_SERVER.events.findByUuid(
            candidate.eventUuid,
          );
          if (!event || !canOpenPublicEntity(event.access, includePrivate))
            return undefined;
          return {
            kind: 'event',
            title: event.title,
            href: buildEventUrl(event.humanReadableSlug, event.publicId),
            description: event.summary,
            iconMedia: await buildPublicContentPreviewMedia(
              'event',
              event.eventUuid,
              'event-body',
              { type: 'event', ...event },
              includePrivate,
            ),
          };
        }
        const page = await THEI_SERVER.pages.findByUuid(candidate.pageUuid);
        if (!page || !canOpenPublicEntity(page.access, includePrivate))
          return undefined;
        return {
          kind: 'page',
          title: page.title,
          href: buildPageUrl(page.slug),
          description: page.summary,
          iconMedia: await buildPublicPageIcon(page),
        };
      },
    ),
  );
  return {
    links: links.filter((link): link is PublicReferenceLink => Boolean(link)),
    files: candidates.files
      .map(({ asset, title, caption }): PublicFile | undefined => {
        if (!asset.assetUrl || !asset.extension) return undefined;
        return {
          key: asset.assetUuid,
          title: richTextToPlainText(title || asset.name || asset.assetUuid),
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
        accentColor: tag.accentColor,
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
      accentColor: tag.accentColor || undefined,
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
      meta?.role === 'other-asset'
        ? richTextToPlainText(meta.title || asset.slug)
        : asset.slug,
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

async function buildPublicAction(
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
    if (!usage) return undefined;
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
  return {
    text: action.text,
    accentColor: action.accentColor,
    target: action.target,
    href,
    iconMedia: await media(icon),
    backgroundMedia: await media(background),
    backgroundMode: action.backgroundMode,
    backgroundSize: action.backgroundSize,
    backgroundRepeat: action.backgroundRepeat,
  };
}

export { buildTagUrl };
