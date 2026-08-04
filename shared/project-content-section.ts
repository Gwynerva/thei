import {
  normalizeContentData,
  isContentEmpty,
  type ContentFieldModelValue,
} from './content';
import {
  normalizeProjectStructuredItemId,
  type ProjectStructuredItemBase,
} from './project-structured-item';

export type ProjectContentSectionEditItem = Omit<
  ProjectStructuredItemBase,
  'content'
> & {
  sectionUuid?: string;
  content: ContentFieldModelValue;
};

export type ProjectContentSectionValue = ProjectContentSectionEditItem & {
  sectionUuid: string;
};

export function normalizeProjectContentSections(
  value: unknown,
): ProjectContentSectionEditItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new ProjectContentSectionError('Invalid content sections');
  return value.map((item) => {
    if (!item || typeof item !== 'object')
      throw new ProjectContentSectionError('Invalid content section');
    const source = item as Record<string, unknown>;
    const title = typeof source.title === 'string' ? source.title.trim() : '';
    if (!title)
      throw new ProjectContentSectionError(
        'Content section title cannot be empty',
      );
    if (typeof source.isPrivate !== 'boolean')
      throw new ProjectContentSectionError('Invalid content section privacy');
    if (!source.content || typeof source.content !== 'object')
      throw new ProjectContentSectionError('Content section cannot be empty');
    const contentSource = source.content as Record<string, unknown>;
    const data = normalizeContentData(contentSource.data);
    if (isContentEmpty(data))
      throw new ProjectContentSectionError('Content section cannot be empty');
    return {
      sectionUuid: normalizeProjectStructuredItemId(source.sectionUuid),
      title,
      summary: typeof source.summary === 'string' ? source.summary.trim() : '',
      isPrivate: source.isPrivate,
      content: {
        contentUuid: normalizeProjectStructuredItemId(
          contentSource.contentUuid,
        ),
        data,
      },
    };
  });
}

export class ProjectContentSectionError extends Error {}
