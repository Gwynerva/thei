export type PublicCanonicalOptions = {
  page?: number;
  tab?: string;
};

/** Build canonical public URLs while omitting default query parameters. */
export function buildPublicCanonical(
  path: string,
  options: PublicCanonicalOptions = {},
) {
  const query = new URLSearchParams();
  if (options.tab && options.tab !== 'projects') query.set('tab', options.tab);
  if (Number.isSafeInteger(options.page) && options.page! > 1)
    query.set('page', String(options.page));
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}
