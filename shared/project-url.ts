import { publicIdIsValid } from './public-link';

export function buildProjectUrl(
  humanReadable: string,
  publicId: string,
): string {
  const pathPart = humanReadable ? `${humanReadable}-${publicId}` : publicId;
  return `/projects/${pathPart}/`;
}

/** Extracts the ID portion while deliberately ignoring the readable prefix. */
export function publicIdFromProjectUrlPart(value: string): string {
  return value.slice(value.lastIndexOf('-') + 1);
}

export function isPublicId(value: string): boolean {
  return publicIdIsValid(value);
}

export type ProjectChildKind = 'stages' | 'sections';

export function buildProjectChildUrl(
  projectHumanReadable: string,
  projectPublicId: string,
  kind: ProjectChildKind,
  childHumanReadable: string,
  childPublicId: string,
) {
  const childPart = childHumanReadable
    ? `${childHumanReadable}-${childPublicId}`
    : childPublicId;
  return `${buildProjectUrl(projectHumanReadable, projectPublicId)}${kind}/${childPart}/`;
}

export function publicIdFromProjectChildUrlPart(value: string): string {
  return value.slice(value.lastIndexOf('-') + 1);
}
