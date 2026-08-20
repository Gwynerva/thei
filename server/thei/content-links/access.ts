import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

export function canResolveProjectContentLink(
  access: ProjectEventAccessLevel,
  isAdmin: boolean,
) {
  return isAdmin || access === ProjectEventAccessLevel.Public;
}
