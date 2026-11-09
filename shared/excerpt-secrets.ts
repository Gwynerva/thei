/**
 * A parent's excerpts in the owner's order as a visitor meets them: the ones
 * they may read, and between them the codenames of the ones they may not,
 * each placed by how many readable ones stand before it.
 */
export type PlacedExcerpt<Readable, Secret> =
  { secret: false; excerpt: Readable } | { secret: true; excerpt: Secret };

export function placeExcerptSecrets<
  Readable,
  Secret extends { before: number },
>(
  readable: readonly Readable[],
  secrets: readonly Secret[],
): PlacedExcerpt<Readable, Secret>[] {
  const placed: PlacedExcerpt<Readable, Secret>[] = [];
  let next = 0;
  const secretsUpTo = (before: number) => {
    while (next < secrets.length && secrets[next]!.before <= before)
      placed.push({ secret: true, excerpt: secrets[next++]! });
  };
  readable.forEach((excerpt, index) => {
    secretsUpTo(index);
    placed.push({ secret: false, excerpt });
  });
  secretsUpTo(Number.POSITIVE_INFINITY);
  return placed;
}
