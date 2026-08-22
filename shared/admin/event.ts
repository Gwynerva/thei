import { ProjectEventAccessLevel } from '../access-level';
import {
  ContentValidationError,
  isContentEmpty,
  normalizeContentData,
  type ContentFieldModelValue,
} from '../content';
import {
  normalizeStagePeriods,
  ProjectContentItemError,
} from '../project-content-item';
import { normalizeProjectAction } from '../project-action';
import { normalizeExternalLinkUrl } from '../external-link';
import { isOneOf } from '../utils/isOneOf';
import type {
  EventEditData,
  EventProjectRelationEditItem,
  ValidatedEventEditData,
} from '../event';

export function validateEventData(
  data: EventEditData,
): string | ValidatedEventEditData {
  try {
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

    return {
      ...data,
      title,
      summary,
      humanReadableSlug,
      publicId,
      access: data.access,
      periods: normalizeStagePeriods(data.periods),
      content: validateRequiredContent(data.content),
      otherAssets: validateFiles(data.otherAssets),
      externalLinks: validateExternalLinks(data.externalLinks),
      relations: validateRelations(data.relations),
      tags: validateTags(data.tags),
      action: normalizeProjectAction(data.action),
    };
  } catch (error) {
    if (
      error instanceof ContentValidationError ||
      error instanceof ProjectContentItemError ||
      error instanceof Error
    )
      return error.message;
    throw error;
  }
}

function validateRequiredContent(
  value: ContentFieldModelValue | null | undefined,
) {
  if (!value) throw new Error('Event content is required');
  const data = normalizeContentData(value.data);
  if (isContentEmpty(data)) throw new Error('Event content is required');
  return {
    contentUuid: optionalText(value.contentUuid),
    data,
    ...(typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? { updatedAt: value.updatedAt }
      : {}),
  };
}

function validateFiles(files: EventEditData['otherAssets']) {
  if (files === undefined) return undefined;
  if (!Array.isArray(files)) throw new Error('Invalid event files');
  const seen = new Set<string>();
  return files.map((file) => {
    const assetUuid = optionalText(file.assetUuid);
    if (!assetUuid) throw new Error('Invalid event file');
    if (seen.has(assetUuid)) throw new Error('Duplicate event file');
    seen.add(assetUuid);
    const title = optionalText(file.title);
    if (!title) throw new Error('Event file title cannot be empty');
    if (typeof file.isPrivate !== 'boolean')
      throw new Error('Invalid file privacy');
    return {
      assetUuid,
      title,
      caption: optionalText(file.caption),
      isPrivate: file.isPrivate,
    };
  });
}

function validateExternalLinks(links: EventEditData['externalLinks']) {
  if (links === undefined) return undefined;
  if (!Array.isArray(links)) throw new Error('Invalid external links');
  const seen = new Set<string>();
  return links.map((link) => {
    const url = normalizeExternalLinkUrl(link.url);
    if (seen.has(url)) throw new Error('Duplicate external link');
    seen.add(url);
    const name = optionalText(link.name);
    if (!name) throw new Error('External link name cannot be empty');
    if (typeof link.isPrivate !== 'boolean')
      throw new Error('Invalid external link privacy');
    return { ...link, url, name, isPrivate: link.isPrivate };
  });
}

function validateRelations(
  relations: EventProjectRelationEditItem[] | undefined,
) {
  if (relations === undefined) return undefined;
  if (!Array.isArray(relations)) throw new Error('Invalid related projects');
  const seen = new Set<string>();
  return relations.map((relation) => {
    const projectUuid = optionalText(relation.projectUuid);
    if (!projectUuid) throw new Error('Invalid related project');
    if (seen.has(projectUuid)) throw new Error('Duplicate related project');
    seen.add(projectUuid);
    return { projectUuid, note: optionalText(relation.note) };
  });
}

function validateTags(tags: EventEditData['tags']) {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) throw new Error('Invalid tags');
  const seen = new Set<string>();
  return tags.map((tag) => {
    const title = optionalText(tag.title);
    if (!title) throw new Error('Tag title cannot be empty');
    const key = title.normalize('NFKC').toLocaleLowerCase();
    if (seen.has(key)) throw new Error('Duplicate tag');
    seen.add(key);
    return tag.tagUuid ? { ...tag, title } : { title };
  });
}

function optionalText(value: string | undefined) {
  return value?.trim() || undefined;
}
