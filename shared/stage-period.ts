export const STAGE_TYPES = ['project-stage', 'event-stage'] as const;

export type StageType = (typeof STAGE_TYPES)[number];
