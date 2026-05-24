import type {
  ProjectEditClientValidation,
  ProjectEditData,
} from '#layers/thei/shared/admin/project';

export const projectDataInjectionKey = Symbol('projectData') as InjectionKey<
  Ref<ProjectEditData>
>;

export const projectValidationKey = Symbol('projectValidation') as InjectionKey<
  Ref<ProjectEditClientValidation>
>;

export const iconPreviewUrlKey = Symbol('iconPreviewUrl') as InjectionKey<
  Ref<string | undefined>
>;

export const currentProjectUuidKey = Symbol(
  'currentProjectUuid',
) as InjectionKey<Ref<string | undefined>>;
