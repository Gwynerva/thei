import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  OtherAssetGetItem,
  ProjectGetResponse,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { ProjectActionEditData } from '#layers/thei/shared/project-action';

export { AssetType };
export type { OtherAssetGetItem, ShowcaseAssetGetItem };

export const projectDataInjectionKey = Symbol('projectData') as InjectionKey<
  Ref<ProjectEditData>
>;

export const savedProjectDataInjectionKey = Symbol(
  'savedProjectData',
) as InjectionKey<Ref<ProjectEditData>>;

export const publicIdErrorKey = Symbol('publicIdError') as InjectionKey<
  Ref<string | undefined>
>;

export const iconMediaKey = Symbol('iconMedia') as InjectionKey<
  Ref<MediaDescriptor | undefined>
>;

export const bannerMediaKey = Symbol('bannerMedia') as InjectionKey<
  Ref<MediaDescriptor | undefined>
>;

export const iconSizeKey = Symbol('iconSize') as InjectionKey<
  Ref<number | undefined>
>;

export const bannerSizeKey = Symbol('bannerSize') as InjectionKey<
  Ref<number | undefined>
>;

export interface ProjectActionMediaState {
  iconMedia: Ref<MediaDescriptor | undefined>;
  iconSize: Ref<number | undefined>;
  backgroundMedia: Ref<MediaDescriptor | undefined>;
  backgroundSize: Ref<number | undefined>;
  fileMedia: Ref<MediaDescriptor | undefined>;
  fileExtension: Ref<string | undefined>;
  fileSize: Ref<number | undefined>;
  faviconMedia: Ref<MediaDescriptor | undefined>;
}

export const projectActionMediaKey = Symbol(
  'projectActionMedia',
) as InjectionKey<ProjectActionMediaState>;

type ProjectActionMediaSource = Pick<
  ProjectGetResponse,
  | 'actionIconMedia'
  | 'actionIconAssetSize'
  | 'actionBackgroundMedia'
  | 'actionBackgroundAssetSize'
  | 'actionFileMedia'
  | 'actionFileExtension'
  | 'actionFileSize'
  | 'actionFaviconMedia'
>;

/**
 * Display media of the action button, shared by the project and event forms.
 * The action itself only stores asset identifiers.
 */
export function provideProjectActionMedia() {
  const state: ProjectActionMediaState = {
    iconMedia: ref(),
    iconSize: ref(),
    backgroundMedia: ref(),
    backgroundSize: ref(),
    fileMedia: ref(),
    fileExtension: ref(),
    fileSize: ref(),
    faviconMedia: ref(),
  };
  provide(projectActionMediaKey, state);

  function applyLoaded(data: ProjectActionMediaSource) {
    state.iconMedia.value = data.actionIconMedia;
    state.iconSize.value = data.actionIconAssetSize;
    state.backgroundMedia.value = data.actionBackgroundMedia;
    state.backgroundSize.value = data.actionBackgroundAssetSize;
    state.fileMedia.value = data.actionFileMedia;
    state.fileExtension.value = data.actionFileExtension;
    state.fileSize.value = data.actionFileSize;
    state.faviconMedia.value = data.actionFaviconMedia;
  }

  /** Forgets media of assets that normalization removed from the saved action. */
  function applySaved(
    previous: ProjectActionEditData | undefined,
    saved: ProjectActionEditData | undefined,
  ) {
    if (saved?.iconAssetUuid !== previous?.iconAssetUuid) {
      state.iconMedia.value = undefined;
      state.iconSize.value = undefined;
    }
    if (saved?.backgroundAssetUuid !== previous?.backgroundAssetUuid) {
      state.backgroundMedia.value = undefined;
      state.backgroundSize.value = undefined;
    }
    if (saved?.fileAssetUuid !== previous?.fileAssetUuid) {
      state.fileMedia.value = undefined;
      state.fileExtension.value = undefined;
      state.fileSize.value = undefined;
    }
    if (saved?.externalUrl !== previous?.externalUrl)
      state.faviconMedia.value = undefined;
  }

  return { applyLoaded, applySaved };
}

export const currentProjectUuidKey = Symbol(
  'currentProjectUuid',
) as InjectionKey<Ref<string | undefined>>;

/** Full showcase items with display media. Kept in sync with projectData.showcaseAssets. */
export const showcaseItemsKey = Symbol('showcaseItems') as InjectionKey<
  Ref<ShowcaseAssetGetItem[]>
>;

/** Full other-file items for display. Kept in sync with projectData.otherAssets. */
export const otherItemsKey = Symbol('otherItems') as InjectionKey<
  Ref<OtherAssetGetItem[]>
>;

/**
 * Lets a nested editor ask the project form to save itself once the content
 * it just wrote back is the only difference from the last save. The form does
 * the comparing: everything outside its content fields has to be untouched.
 */
export const saveAfterContentEditKey = Symbol(
  'saveAfterContentEdit',
) as InjectionKey<() => void>;

/**
 * Lets a stage or section modal ask the project form to save itself once that
 * one item — added or edited — is the only difference from the last save.
 * `item` is the item as the form now holds it; `itemUuid` names its stored
 * counterpart (none while it was never saved).
 *
 * Removing an item never asks: it waits for the project's own Save button, and
 * while it waits, it is a difference that keeps every later edit from saving
 * the project by itself too.
 */
export const saveAfterItemEditKey = Symbol('saveAfterItemEdit') as InjectionKey<
  (
    list: 'stages' | 'contentSections',
    item: object,
    itemUuid: string | undefined,
  ) => void
>;
