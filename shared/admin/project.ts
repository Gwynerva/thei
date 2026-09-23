import { ProjectEventAccessLevel } from '../access-level';
import type { StatusEditData } from '../status';
import {
  RelationValidationError,
  validateRelations,
  type RelationEditItem,
  type RelationNote,
  type RelationType,
} from '../relation';
import { normalizeEntityNotes, normalizeEntityReminder } from '../entity-notes';
import {
  collectContentAssetUuids,
  contentPlainText,
  ContentValidationError,
  normalizeContentData,
  type ContentFieldModelValue,
} from '../content';
import { isOneOf } from '../utils/isOneOf';
import {
  normalizeProjectContentSections,
  normalizeProjectStages,
  ProjectContentItemError,
  type ProjectSectionContentItem,
  type ProjectStageContentItem,
} from '../project-content-item';
import type { MediaDescriptor } from '../media';
import type { TagEditItem } from '../tag';
import {
  normalizeProjectAction,
  projectActionAssetUuids,
  type ProjectActionEditData,
} from '../project-action';
import {
  normalizeExternalLinkUrl,
  type ProjectExternalLinkEditItem,
} from '../external-link';
import {
  normalizeHumanReadableSlug,
  normalizePublicId,
  publicIdIsValid,
} from '../public-link';

/** Base save item for any project asset list (showcase, other-assets, …). */
export type AssetListSaveItem = { assetUuid: string };

export type ShowcaseAssetEditItem = AssetListSaveItem & {
  caption?: string;
  isPrivate: boolean;
};

export type OtherAssetSaveItem = AssetListSaveItem & {
  title: string;
  caption?: string;
  isPrivate: boolean;
};

/** Kept as aliases so callers name relations by one vocabulary. */
export type { RelationType, RelationNote, RelationEditItem };

export type ProjectEditData = Partial<StatusEditData> & {
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  access: ProjectEventAccessLevel | '';
  showcase: boolean;
  cv: boolean;
  iconAssetUuid?: string;
  bannerAssetUuid?: string;
  descriptionContent?: ContentFieldModelValue | null;
  contentSections?: ProjectSectionContentItem[];
  stages?: ProjectStageContentItem[];
  /** Showcase assets in display order. Array index = sort order. */
  showcaseAssets?: ShowcaseAssetEditItem[];
  /** Other files in display order. Array index = sort order. */
  otherAssets?: OtherAssetSaveItem[];
  /** Relations in this project's display order. */
  relations?: RelationEditItem[];
  /** External links in display order. */
  externalLinks?: ProjectExternalLinkEditItem[];
  tags?: TagEditItem[];
  action?: ProjectActionEditData;
  reminder?: string;
  notes?: ContentFieldModelValue | null;
};

export type ValidatedProjectEditData = Omit<
  ProjectEditData,
  'access' | 'action'
> & {
  access: ProjectEventAccessLevel;
  action: ProjectActionEditData;
};

export function projectAssetUsageDelta(
  current: ProjectEditData,
  saved: ProjectEditData,
): Record<string, number> {
  const currentCounts = countProjectAssetPlacements(current);
  const savedCounts = countProjectAssetPlacements(saved);
  const assetUuids = new Set([
    ...Object.keys(currentCounts),
    ...Object.keys(savedCounts),
  ]);

  return Object.fromEntries(
    Array.from(assetUuids, (assetUuid) => [
      assetUuid,
      (currentCounts[assetUuid] ?? 0) - (savedCounts[assetUuid] ?? 0),
    ]).filter(([, delta]) => delta !== 0),
  );
}

export function countProjectAssetPlacements(
  project: ProjectEditData,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (assetUuid: string | undefined) => {
    if (!assetUuid) return;
    counts[assetUuid] = (counts[assetUuid] ?? 0) + 1;
  };

  add(project.iconAssetUuid);
  add(project.bannerAssetUuid);
  projectActionAssetUuids(project.action).forEach(add);
  new Set(project.showcaseAssets?.map((item) => item.assetUuid) ?? []).forEach(
    add,
  );
  new Set(project.otherAssets?.map((item) => item.assetUuid) ?? []).forEach(
    add,
  );
  const addContent = (content: ContentFieldModelValue | null | undefined) => {
    collectContentAssetUuids(content?.data).forEach(add);
  };
  addContent(project.descriptionContent);
  for (const stage of project.stages ?? []) addContent(stage.content);
  for (const section of project.contentSections ?? []) {
    addContent(section.content);
  }
  return counts;
}

export function projectTagRecommendationText(project: ProjectEditData) {
  return [
    project.title,
    project.summary,
    contentPlainText(project.descriptionContent?.data),
    ...(project.stages ?? []).flatMap((stage) => [
      stage.title,
      stage.summary,
      contentPlainText(stage.content?.data),
    ]),
    ...(project.contentSections ?? []).flatMap((section) => [
      section.title,
      section.summary,
      contentPlainText(section.content?.data),
    ]),
  ]
    .filter(Boolean)
    .join(' ');
}

export function validateProjectData(
  data: ProjectEditData,
): string | ValidatedProjectEditData {
  const title = data.title?.trim();
  if (!title) return 'Title cannot be empty';

  const summary = data.summary?.trim();
  if (!summary) return 'Summary cannot be empty';

  const humanReadableSlug = normalizeHumanReadableSlug(data.humanReadableSlug);
  const publicId = normalizePublicId(data.publicId);
  if (!publicId) return 'Public ID cannot be empty';
  if (!publicIdIsValid(publicId)) return 'Invalid public ID';

  if (!isOneOf(data.access, ProjectEventAccessLevel))
    return 'Invalid access level';

  try {
    const showcaseAssets: ShowcaseAssetEditItem[] | undefined =
      data.showcaseAssets === undefined
        ? undefined
        : validateUniqueAssetList(
            data.showcaseAssets.map((item) => {
              const isPrivate = validateProjectAssetIsPrivate(item.isPrivate);
              if (isPrivate === undefined)
                throw new ProjectValidationError('Invalid asset privacy');

              return {
                assetUuid: item.assetUuid,
                caption: normalizeOptionalText(item.caption),
                isPrivate,
              };
            }),
            'Duplicate showcase asset',
          );

    const otherAssets: OtherAssetSaveItem[] | undefined =
      data.otherAssets === undefined
        ? undefined
        : validateUniqueAssetList(
            data.otherAssets.map((item) => {
              const isPrivate = validateProjectAssetIsPrivate(item.isPrivate);
              if (isPrivate === undefined)
                throw new ProjectValidationError('Invalid asset privacy');

              const itemTitle = normalizeOptionalText(item.title);
              if (!itemTitle) {
                throw new ProjectValidationError(
                  'Other file title cannot be empty',
                );
              }

              return {
                assetUuid: item.assetUuid,
                title: itemTitle,
                caption: normalizeOptionalText(item.caption),
                isPrivate,
              };
            }),
            'Duplicate other file',
          );

    const descriptionContent = validateContentField(data.descriptionContent);
    const contentSections = normalizeProjectContentSections(
      data.contentSections,
    );
    const stages = normalizeProjectStages(data.stages);
    const relations = validateRelations(data.relations);
    const externalLinks = validateProjectExternalLinks(data.externalLinks);
    const tags = validateProjectTags(data.tags);
    let action: ProjectActionEditData;
    try {
      action = normalizeProjectAction(data.action);
    } catch (error) {
      throw new ProjectValidationError(
        error instanceof Error ? error.message : 'Invalid action button',
      );
    }

    return {
      ...data,
      title,
      summary,
      humanReadableSlug,
      publicId,
      access: data.access,
      descriptionContent,
      contentSections,
      stages,
      showcaseAssets,
      otherAssets,
      relations,
      externalLinks,
      tags,
      action,
      reminder: normalizeEntityReminder(data.reminder),
      notes: normalizeEntityNotes(data.notes),
    };
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.message;
    if (error instanceof ContentValidationError) return error.message;
    if (error instanceof ProjectContentItemError) return error.message;
    if (error instanceof RelationValidationError) return error.message;
    throw error;
  }
}

function validateProjectExternalLinks(
  links: ProjectExternalLinkEditItem[] | undefined,
): ProjectExternalLinkEditItem[] | undefined {
  if (links === undefined) return undefined;
  if (!Array.isArray(links))
    throw new ProjectValidationError('Invalid external links');
  const seen = new Set<string>();
  return links.map((link) => {
    const url = normalizeExternalLinkUrl(link.url);
    if (seen.has(url))
      throw new ProjectValidationError('Duplicate external link');
    seen.add(url);
    const name = link.name?.trim();
    if (!name)
      throw new ProjectValidationError('External link name cannot be empty');
    if (Array.from(name).length > 300)
      throw new ProjectValidationError('External link name is too long');
    if (typeof link.isPrivate !== 'boolean')
      throw new ProjectValidationError('Invalid external link privacy');
    return {
      url,
      name,
      isPrivate: link.isPrivate,
      ...(typeof link.touchedAt === 'number' &&
      Number.isFinite(link.touchedAt) &&
      link.touchedAt > 0
        ? { touchedAt: link.touchedAt }
        : {}),
    };
  });
}

function validateProjectTags(
  tags: TagEditItem[] | undefined,
): TagEditItem[] | undefined {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) throw new ProjectValidationError('Invalid tags');
  const seen = new Set<string>();
  return tags.map((tag) => {
    const title = tag.title?.trim();
    if (!title) throw new ProjectValidationError('Tag title cannot be empty');
    if (title.length > 100)
      throw new ProjectValidationError('Tag title is too long');
    const identity = title.normalize('NFKC').toLocaleLowerCase();
    if (seen.has(identity)) throw new ProjectValidationError('Duplicate tag');
    seen.add(identity);
    if ('tagUuid' in tag && tag.tagUuid) return { ...tag, title };
    return { title };
  });
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function validateProjectAssetIsPrivate(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function validateContentField(
  value: ContentFieldModelValue | null | undefined,
): ContentFieldModelValue | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return {
    contentUuid: normalizeOptionalText(value.contentUuid),
    data: normalizeContentData(value.data),
    ...(typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? { updatedAt: value.updatedAt }
      : {}),
  };
}

function validateUniqueAssetList<T extends AssetListSaveItem>(
  items: T[],
  message: string,
): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.assetUuid)) {
      throw new ProjectValidationError(message);
    }
    seen.add(item.assetUuid);
  }
  return items;
}

class ProjectValidationError extends Error {}
