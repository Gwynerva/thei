import { ProjectEventAccessLevel } from '../access-level';
import {
  ContentValidationError,
  normalizeContentData,
  type ContentFieldModelValue,
} from '../content';
import { isOneOf } from '../utils/isOneOf';
import {
  normalizeProjectContentSections,
  ProjectContentSectionError,
  type ProjectContentSectionEditItem,
} from '../project-content-section';
import type { MediaDescriptor } from '../media';
import type { TagEditItem } from '../tag';
import {
  normalizeExternalLinkUrl,
  type ProjectExternalLinkEditItem,
} from '../external-link';

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

export type ProjectRelationType = 'related' | 'influencing' | 'dependent';

export type ProjectRelationNote =
  | { type: 'shared'; text?: string }
  | {
      type: 'split';
      currentProjectText?: string;
      relatedProjectText?: string;
    };

export type ProjectRelationEditItem = {
  projectUuid: string;
  type: ProjectRelationType;
  note?: ProjectRelationNote;
  /** Display fields returned by the admin edit API and ignored when saving. */
  title?: string;
  humanReadableSlug?: string;
  publicId?: string;
  iconMedia?: MediaDescriptor;
};

export type ProjectEditData = {
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
  contentSections?: ProjectContentSectionEditItem[];
  /** Showcase assets in display order. Array index = sort order. */
  showcaseAssets?: ShowcaseAssetEditItem[];
  /** Other files in display order. Array index = sort order. */
  otherAssets?: OtherAssetSaveItem[];
  /** Relations in this project's display order. */
  relations?: ProjectRelationEditItem[];
  /** External links in display order. */
  externalLinks?: ProjectExternalLinkEditItem[];
  tags?: TagEditItem[];
};

export type ValidatedProjectEditData = Omit<ProjectEditData, 'access'> & {
  access: ProjectEventAccessLevel;
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
  new Set(project.showcaseAssets?.map((item) => item.assetUuid) ?? []).forEach(
    add,
  );
  new Set(project.otherAssets?.map((item) => item.assetUuid) ?? []).forEach(
    add,
  );
  return counts;
}

export function validateProjectData(
  data: ProjectEditData,
): string | ValidatedProjectEditData {
  const title = data.title?.trim();
  if (!title) return 'Title cannot be empty';

  const summary = data.summary?.trim();
  if (!summary) return 'Summary cannot be empty';

  const humanReadableSlug = data.humanReadableSlug?.trim() ?? '';
  const publicId = data.publicId?.trim();
  if (!publicId) return 'Public ID cannot be empty';
  if (!/^[A-Za-z0-9]{1,64}$/.test(publicId)) return 'Invalid public ID';

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
    const relations = validateProjectRelations(data.relations);
    const externalLinks = validateProjectExternalLinks(data.externalLinks);
    const tags = validateProjectTags(data.tags);

    return {
      ...data,
      title,
      summary,
      humanReadableSlug,
      publicId,
      access: data.access,
      descriptionContent,
      contentSections,
      showcaseAssets,
      otherAssets,
      relations,
      externalLinks,
      tags,
    };
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.message;
    if (error instanceof ContentValidationError) return error.message;
    if (error instanceof ProjectContentSectionError) return error.message;
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

function validateProjectRelations(
  relations: ProjectRelationEditItem[] | undefined,
): ProjectRelationEditItem[] | undefined {
  if (relations === undefined) return undefined;
  const seen = new Set<string>();
  return relations.map((relation) => {
    const projectUuid = relation.projectUuid?.trim();
    if (!projectUuid)
      throw new ProjectValidationError('Invalid related project');
    if (seen.has(projectUuid))
      throw new ProjectValidationError('Duplicate related project');
    seen.add(projectUuid);
    if (
      relation.type !== 'related' &&
      relation.type !== 'influencing' &&
      relation.type !== 'dependent'
    ) {
      throw new ProjectValidationError('Invalid project relation type');
    }
    return {
      projectUuid,
      type: relation.type,
      note: validateProjectRelationNote(relation.note),
    };
  });
}

function validateProjectRelationNote(
  note: ProjectRelationNote | undefined,
): ProjectRelationNote | undefined {
  if (note === undefined) return undefined;
  if (note.type === 'shared') {
    return { type: 'shared', text: normalizeOptionalText(note.text) };
  }
  if (note.type === 'split') {
    return {
      type: 'split',
      currentProjectText: normalizeOptionalText(note.currentProjectText),
      relatedProjectText: normalizeOptionalText(note.relatedProjectText),
    };
  }
  throw new ProjectValidationError('Invalid project relation note');
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
