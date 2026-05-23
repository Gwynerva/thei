import type { ProjectEditData } from '#layers/thei/shared/admin/project';

export const projectDataInjectionKey = Symbol('projectData') as InjectionKey<
  Ref<ProjectEditData>
>;
