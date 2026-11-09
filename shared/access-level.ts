export enum ProjectEventAccessLevel {
  Public = 'public',
  LinkOnly = 'link-only',
  Private = 'private',
}

export enum SiteAccessLevel {
  Public = 'public',
  Private = 'private',
}

const OPENNESS: Record<ProjectEventAccessLevel, number> = {
  [ProjectEventAccessLevel.Public]: 0,
  [ProjectEventAccessLevel.LinkOnly]: 1,
  [ProjectEventAccessLevel.Private]: 2,
};

/** The least open of some access levels: what is as open as all of them at once. */
export function strictestAccess(
  ...levels: (ProjectEventAccessLevel | undefined)[]
): ProjectEventAccessLevel {
  return levels.reduce<ProjectEventAccessLevel>(
    (strictest, level) =>
      level && OPENNESS[level] > OPENNESS[strictest] ? level : strictest,
    ProjectEventAccessLevel.Public,
  );
}
