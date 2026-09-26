import type { RelationEndpoint } from './relation';
import type { TagContainerType } from './tag';

/**
 * How much of an entity's text a recommendation reads. A project with many
 * stages and sections easily runs past a few dozen pages; the beginning of it
 * says enough about what it is, and the rest is cut rather than refused.
 */
export const TAG_RECOMMENDATION_TEXT_MAX_LENGTH = 100_000;

/** What an entity says about itself, as tag recommendations read it. */
export type TagContext = {
  title: string;
  /** Everything else it says, in reading order. */
  text: string;
};

export type TagRecommendationRequest = TagContext & {
  /** The entity being edited, kept out of its own evidence; absent until created. */
  owner?: { type: TagContainerType; id: string };
  selectedTagUuids: string[];
  /** Entities it is related to, including relations not saved yet. */
  related: RelationEndpoint[];
};

export function clampTagContextText(text: string): string {
  return text.length > TAG_RECOMMENDATION_TEXT_MAX_LENGTH
    ? text.slice(0, TAG_RECOMMENDATION_TEXT_MAX_LENGTH)
    : text;
}

/** Joins the parts of an entity's text that are there, in reading order. */
export function joinTagContextText(
  parts: Array<string | null | undefined>,
): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('\n');
}
