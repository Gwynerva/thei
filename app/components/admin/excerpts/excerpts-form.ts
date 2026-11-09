import type { InjectionKey } from 'vue';
import type { ProjectContentItemIdentity } from '#layers/thei/shared/api/project';
import type {
  ExcerptItem,
  ExcerptParentType,
} from '#layers/thei/shared/excerpt';
import type { ExcerptParentAddress } from '#layers/thei/shared/excerpt-url';
import { changedOnlyIn } from '#layers/thei/app/composables/saved-form';

/**
 * What the excerpts block needs of the form it is in — a diary entry's, an
 * event's or a project's. Each form provides it; the block and the modal
 * read it, so neither knows which form holds them.
 */
export interface ExcerptsForm {
  parentType: ExcerptParentType;
  /** The parent's uuid, once it exists. */
  parentId: () => string | undefined;
  /** What the parent is called: a diary entry by its day. */
  parentTitle: () => string;
  /** The parent's address as the form holds it, for the link field. */
  address: () => ExcerptParentAddress | undefined;
  /**
   * The parent's address as it was last saved, where its excerpts' pages
   * are: the form's may be one not stored yet — a public ID just rolled.
   */
  savedAddress: () => ExcerptParentAddress | undefined;
  excerpts: () => ExcerptItem[];
  setExcerpts: (items: ExcerptItem[]) => void;
  /** The excerpts as last saved. */
  savedExcerpts: () => ExcerptItem[];
  /**
   * Saves the parent when this excerpt — added or edited in its modal — is
   * all that differs from the last save, the way a section's modal asks
   * its project to save itself.
   */
  saveAfterItemEdit: (item: object, excerptUuid: string | undefined) => void;
  /** What changes each time the parent is saved — its AI panel. */
  saved: () => unknown;
}

export const excerptsFormKey = Symbol('excerptsForm') as InjectionKey<ExcerptsForm>;

/**
 * Whether an excerpt is all that differs from the form's last save, content
 * fields aside: the excerpt is left out of both sides of the comparison,
 * and everything else has to match.
 */
export function changedOnlyInExcerpt(
  current: Record<string, unknown>,
  savedSnapshot: string,
  contentFields: readonly string[],
  item: object,
  excerptUuid: string | undefined,
): boolean {
  const edited = toRaw(item);
  const without = {
    ...current,
    excerpts: ((current.excerpts ?? []) as object[]).filter(
      (entry) => toRaw(entry) !== edited,
    ),
  };
  let saved: Record<string, unknown>;
  try {
    saved = JSON.parse(savedSnapshot) as Record<string, unknown>;
  } catch {
    return false;
  }
  saved.excerpts = ((saved.excerpts ?? []) as Record<string, unknown>[]).filter(
    (entry) => !excerptUuid || entry.excerptUuid !== excerptUuid,
  );
  return changedOnlyIn(without, JSON.stringify(saved), contentFields);
}

/**
 * Takes the identities the server assigned to new excerpts. Until this
 * runs, an excerpt made in this session has no uuid on the client, and the
 * next save would offer its public ID as if nobody owned it yet.
 */
export function applySavedExcerptIds(
  excerpts: ExcerptItem[] | undefined,
  identities: ProjectContentItemIdentity[] | undefined,
) {
  if (!excerpts || !identities) return;
  const uuids = new Map(
    identities.map(({ publicId, itemUuid }) => [publicId, itemUuid]),
  );
  for (const excerpt of excerpts)
    excerpt.excerptUuid = uuids.get(excerpt.publicId) ?? excerpt.excerptUuid;
}
