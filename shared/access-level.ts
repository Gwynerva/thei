export enum AccessLevel {
  Public = 'public',
  LinkOnly = 'link-only',
  Private = 'private',
}

export enum AssetAccessLevel {
  Public = 'public',
  // Assets can't be LinkOnly, because the link is the asset itself, so it would be the same as public.
  Private = 'private',
}

export enum SiteAccessLevel {
  Public = 'public',
  Private = 'private',
}
