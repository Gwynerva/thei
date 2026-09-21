/**
 * Cache policy for files served under a stable URL.
 *
 * The bytes behind a URL never change, but access to them can: an owner may
 * make a file private at any moment, so nothing is `immutable`. A day in a
 * browser means someone who already saw the file keeps seeing it for at most a
 * day; shared caches (proxies, CDNs) must recheck within five minutes, so a
 * file that went private stops reaching new visitors almost at once.
 */
export const PUBLIC_ASSET_CACHE_CONTROL = 'public, max-age=86400, s-maxage=300';

/**
 * A private file served to the signed-in owner: kept by their own browser but
 * rechecked on every use, which an ETag turns into a cheap 304.
 */
export const OWNER_ASSET_CACHE_CONTROL = 'private, no-cache';

/** A private file opened through a temporary share link: never stored. */
export const SHARED_ASSET_CACHE_CONTROL = 'private, no-store';
