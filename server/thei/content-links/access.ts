import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

export function canResolveContentEntityLink(
  access: ProjectEventAccessLevel,
  isAdmin: boolean,
) {
  return isAdmin || access !== ProjectEventAccessLevel.Private;
}
