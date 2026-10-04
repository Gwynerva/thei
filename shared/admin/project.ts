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
import { optionalContentDraftRef } from '../content-history';
import {
  normalizeProjectSections,
  ProjectContentItemError,
  type ProjectSectionItem,
} from '../project-content-item';
import type { MediaDescriptor } from '../media';
import { PeriodError } from '../period';
import { normalizeTagEditItems, type TagEditItem } from '../tag';
import { joinTagContextText, type TagContext } from '../tag-recommendation';
import {
  normalizeProjectAction,
  projectActionAssetUuids,
  type ProjectActionEditData,
} from '../project-action';
import {
  validateExternalLinkList,
  type ExternalLinkListInput,
  type ExternalLinkListItem,
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
  /** The project's sections in their order; absent leaves them as they are. */
  sections?: ProjectSectionItem[];
  /** Showcase assets in display order. Array index = sort order. */
  showcaseAssets?: ShowcaseAssetEditItem[];
  /** Other files in display order. Array index = sort order. */
  otherAssets?: OtherAssetSaveItem[];
  /** Relations in this project's display order. */
  relations?: RelationEditItem[];
  /** External links in display order. */
  externalLinks?: ExternalLinkListItem[];
  tags?: TagEditItem[];
  action?: ProjectActionEditData;
  reminder?: string;
  notes?: ContentFieldModelValue | null;
};

export type ValidatedProjectEditData = Omit<
  ProjectEditData,
  'access' | 'action' | 'externalLinks'
> & {
  access: ProjectEventAccessLevel;
  action: ProjectActionEditData;
  externalLinks?: ExternalLinkListInput[];
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
  for (const section of project.sections ?? []) addContent(section.content);
  return counts;
}

/** A project as tag recommendations read it: its own text and its parts'. */
export function projectTagContext(project: ProjectEditData): TagContext {
  return {
    title: project.title,
    text: joinTagContextText([
      project.summary,
      contentPlainText(project.descriptionContent?.data),
      ...(project.sections ?? []).flatMap((section) => [
        section.title,
        section.summary,
        contentPlainText(section.content?.data),
      ]),
    ]),
  };
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
    const sections = normalizeProjectSections(data.sections);
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
      sections,
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
    if (
      error instanceof ProjectContentItemError ||
      error instanceof PeriodError
    )
      return error.message;
    if (error instanceof RelationValidationError) return error.message;
    throw error;
  }
}

function validateProjectExternalLinks(
  links: ExternalLinkListItem[] | undefined,
) {
  return validateExternalLinkList(links, (message): never => {
    throw new ProjectValidationError(message);
  });
}

function validateProjectTags(
  tags: TagEditItem[] | undefined,
): TagEditItem[] | undefined {
  return normalizeTagEditItems(tags, (message): never => {
    throw new ProjectValidationError(message);
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
    ...optionalContentDraftRef(value.draftRef),
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
