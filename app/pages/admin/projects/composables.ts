import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  OtherAssetGetItem,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';
import type { MediaDescriptor } from '#layers/thei/shared/media';

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

export const actionIconMediaKey = Symbol('actionIconMedia') as InjectionKey<
  Ref<MediaDescriptor | undefined>
>;
export const actionIconSizeKey = Symbol('actionIconSize') as InjectionKey<
  Ref<number | undefined>
>;
export const actionBackgroundMediaKey = Symbol(
  'actionBackgroundMedia',
) as InjectionKey<Ref<MediaDescriptor | undefined>>;
export const actionBackgroundSizeKey = Symbol(
  'actionBackgroundSize',
) as InjectionKey<Ref<number | undefined>>;
export const actionFileUrlKey = Symbol('actionFileUrl') as InjectionKey<
  Ref<string | undefined>
>;
export const actionFileMediaKey = Symbol('actionFileMedia') as InjectionKey<
  Ref<MediaDescriptor | undefined>
>;
export const actionFileExtensionKey = Symbol(
  'actionFileExtension',
) as InjectionKey<Ref<string | undefined>>;
export const actionFileSizeKey = Symbol('actionFileSize') as InjectionKey<
  Ref<number | undefined>
>;
export const actionFaviconMediaKey = Symbol(
  'actionFaviconMedia',
) as InjectionKey<Ref<MediaDescriptor | undefined>>;

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
