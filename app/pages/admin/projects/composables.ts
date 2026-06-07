import type {
  ProjectEditClientValidation,
  ProjectEditData,
} from '#layers/thei/shared/admin/project';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  OtherAssetGetItem,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';

export { AssetType };
export type { OtherAssetGetItem, ShowcaseAssetGetItem };

export const projectDataInjectionKey = Symbol('projectData') as InjectionKey<
  Ref<ProjectEditData>
>;

export const projectValidationKey = Symbol('projectValidation') as InjectionKey<
  Ref<ProjectEditClientValidation>
>;

export const iconPreviewUrlKey = Symbol('iconPreviewUrl') as InjectionKey<
  Ref<string | undefined>
>;

export const bannerPreviewUrlKey = Symbol('bannerPreviewUrl') as InjectionKey<
  Ref<string | undefined>
>;

export const iconVideoUrlKey = Symbol('iconVideoUrl') as InjectionKey<
  Ref<string | undefined>
>;

export const bannerVideoUrlKey = Symbol('bannerVideoUrl') as InjectionKey<
  Ref<string | undefined>
>;

export const iconSizeKey = Symbol('iconSize') as InjectionKey<
  Ref<number | undefined>
>;

export const bannerSizeKey = Symbol('bannerSize') as InjectionKey<
  Ref<number | undefined>
>;

export const currentProjectUuidKey = Symbol(
  'currentProjectUuid',
) as InjectionKey<Ref<string | undefined>>;

/** Full showcase items (with previewUrl, videoUrl, type) for display. Kept in sync with projectData.showcaseAssets. */
export const showcaseItemsKey = Symbol('showcaseItems') as InjectionKey<
  Ref<ShowcaseAssetGetItem[]>
>;

/** Full other-file items for display. Kept in sync with projectData.otherAssets. */
export const otherItemsKey = Symbol('otherItems') as InjectionKey<
  Ref<OtherAssetGetItem[]>
>;
