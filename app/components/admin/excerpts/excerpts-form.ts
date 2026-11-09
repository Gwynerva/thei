import type { InjectionKey } from 'vue';
import type { ProjectContentItemIdentity } from '#layers/thei/shared/api/project';
import type {
  ExcerptItem,
  ExcerptParentType,
} from '#layers/thei/shared/excerpt';
import type { ExcerptParentAddress } from '#layers/thei/shared/excerpt-url';
import { changedOnlyInPart } from '#layers/thei/app/composables/saved-form';

/**
 * What the excerpts block needs of the form it is in — a diary entry's, an
 * event's or a project's. Each form provides it; the block and the modal
 * read it, so neither knows which form holds them.
 */
export interface ExcerptsForm {
  parentType: ExcerptParentType;
  /** The parent's uuid, once it exists. */
  parentId: () => string | undefined;
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

export const excerptsFormKey = Symbol(
  'excerptsForm',
) as InjectionKey<ExcerptsForm>;

/**
 * Provides the excerpts block with what it needs of the form it is in. The
 * form says where its excerpts and its last save are, and when it may save
 * on its own; the rest is the same for each.
 */
export function provideExcerptsForm(
  form: Pick<
    ExcerptsForm,
    | 'parentType'
    | 'parentId'
    | 'address'
    | 'savedAddress'
    | 'savedExcerpts'
    | 'saved'
  > & {
    /** The form's model, which holds the excerpts. */
    model: () => { excerpts?: ExcerptItem[] };
    /** The form as a save sends it, and as its last save left it. */
    payload: () => object;
    savedSnapshot: () => string;
    /** The fields that hold texts, at any depth. */
    contentFields: () => readonly string[];
    /** Whether the form may save itself now: stored already, nothing in the way. */
    canSaveItself: () => boolean;
    save: () => void;
  },
) {
  provide(excerptsFormKey, {
    parentType: form.parentType,
    parentId: form.parentId,
    address: form.address,
    savedAddress: form.savedAddress,
    excerpts: () => form.model().excerpts ?? [],
    setExcerpts: (items) => {
      form.model().excerpts = items;
    },
    savedExcerpts: form.savedExcerpts,
    saveAfterItemEdit: (item, excerptUuid) => {
      if (!form.canSaveItself()) return;
      if (
        !changedOnlyInPart(
          form.payload(),
          form.savedSnapshot(),
          form.contentFields(),
          { list: 'excerpts', uuid: 'excerptUuid', item, id: excerptUuid },
        )
      )
        return;
      form.save();
    },
    saved: form.saved,
  });
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
