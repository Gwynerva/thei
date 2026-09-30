/**
 * Where a page's Open Graph card lives, as a site-relative path: the base a
 * site may be served from is added on the way out, like every other path.
 */
export type OgImageKind =
  | 'site'
  | 'service'
  | 'project'
  | 'stage'
  | 'section'
  | 'event'
  | 'page'
  | 'diary'
  | 'tag';

export interface OgImageTarget {
  kind: OgImageKind;
  id: string;
}

export function buildOgImagePath(target: OgImageTarget): string {
  return target.kind === 'site'
    ? '/og/site.png'
    : `/og/${target.kind}/${encodeURIComponent(target.id)}.png`;
}

/** Where a page asks what its card is: its address and its description. */
export function buildOgInfoPath(target: OgImageTarget): string {
  return `/api/og/${target.kind}/${encodeURIComponent(target.id)}`;
}

/** A card as a page puts it in its head. */
export interface OgImageInfo {
  /** Site-relative, with the card's version so previewers fetch a new one. */
  url: string;
  alt: string;
}
