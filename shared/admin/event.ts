import { ProjectEventAccessLevel } from '../access-level';
import { normalizeEntityNotes, normalizeEntityReminder } from '../entity-notes';
import {
  ContentValidationError,
  contentPlainText,
  isContentEmpty,
  normalizeContentData,
  type ContentFieldModelValue,
} from '../content';
import { ProjectContentItemError } from '../project-content-item';
import { normalizePeriods, PeriodError } from '../period';
import { normalizeProjectAction } from '../project-action';
import { validateExternalLinkList } from '../external-link';
import { isOneOf } from '../utils/isOneOf';
import {
  normalizeCaptionText,
  normalizeHeadingText,
} from '../terminal-punctuation';
import { optionalContentDraftRef } from '../content-history';
import {
  normalizeHumanReadableSlug,
  normalizePublicId,
  publicIdIsValid,
} from '../public-link';
import type { EventEditData, ValidatedEventEditData } from '../event';
import { RelationValidationError, validateRelations } from '../relation';
import { normalizeTagEditItems } from '../tag';
import { joinTagContextText, type TagContext } from '../tag-recommendation';

/** An event as tag recommendations read it. */
export function eventTagContext(event: EventEditData): TagContext {
  return {
    title: event.title,
    text: joinTagContextText([
      event.summary,
      contentPlainText(event.content?.data),
    ]),
  };
}

export function validateEventData(
  data: EventEditData,
): string | ValidatedEventEditData {
  try {
    const title = normalizeHeadingText(data.title?.trim() ?? '');
    if (!title) return 'Title cannot be empty';
    const summary = data.summary?.trim();
    if (!summary) return 'Summary cannot be empty';
    const humanReadableSlug = normalizeHumanReadableSlug(
      data.humanReadableSlug,
    );
    const publicId = normalizePublicId(data.publicId);
    if (!publicId) return 'Public ID cannot be empty';
    if (!publicIdIsValid(publicId)) return 'Invalid public ID';
    if (!isOneOf(data.access, ProjectEventAccessLevel))
      return 'Invalid access level';

    return {
      ...data,
      title,
      summary,
      humanReadableSlug,
      publicId,
      access: data.access,
      periods: normalizePeriods(data.periods),
      content: validateRequiredContent(data.content),
      bannerAssetUuid:
        typeof data.bannerAssetUuid === 'string' && data.bannerAssetUuid
          ? data.bannerAssetUuid
          : undefined,
      otherAssets: validateFiles(data.otherAssets),
      externalLinks: validateExternalLinks(data.externalLinks),
      tags: validateTags(data.tags),
      relations: validateRelations(data.relations),
      action: normalizeProjectAction(data.action),
      reminder: normalizeEntityReminder(data.reminder),
      notes: normalizeEntityNotes(data.notes),
    };
  } catch (error) {
    if (
      error instanceof ContentValidationError ||
      error instanceof ProjectContentItemError ||
      error instanceof PeriodError ||
      error instanceof RelationValidationError ||
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
    ...optionalContentDraftRef(value.draftRef),
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
    const title = normalizeHeadingText(optionalText(file.title) ?? '');
    if (!title) throw new Error('Event file title cannot be empty');
    if (typeof file.isPrivate !== 'boolean')
      throw new Error('Invalid file privacy');
    return {
      assetUuid,
      title,
      caption:
        normalizeCaptionText(optionalText(file.caption) ?? '') || undefined,
      isPrivate: file.isPrivate,
    };
  });
}

function validateExternalLinks(links: EventEditData['externalLinks']) {
  return validateExternalLinkList(links, (message): never => {
    throw new Error(message);
  });
}

function validateTags(tags: EventEditData['tags']) {
  return normalizeTagEditItems(tags, (message): never => {
    throw new Error(message);
  });
}

function optionalText(value: string | undefined) {
  return value?.trim() || undefined;
}
