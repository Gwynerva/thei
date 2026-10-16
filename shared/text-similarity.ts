/**
 * How alike two words are by the letters it takes to make one the other:
 * a letter added, dropped, changed — or two neighbours swapped, the commonest
 * typo of all, counted as one.
 */
export function letterSimilarity(before: string, after: string): number {
  const longest = Math.max(before.length, after.length);
  if (!longest) return 1;
  let beforeLast: number[] = [];
  let previous = Array.from({ length: after.length + 1 }, (_, index) => index);
  for (let i = 1; i <= before.length; i++) {
    const current = [i];
    for (let j = 1; j <= after.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (before[i - 1] === after[j - 1] ? 0 : 1),
      );
      if (
        i > 1 &&
        j > 1 &&
        before[i - 1] === after[j - 2] &&
        before[i - 2] === after[j - 1]
      )
        current[j] = Math.min(current[j]!, beforeLast[j - 2]! + 1);
    }
    beforeLast = previous;
    previous = current;
  }
  return 1 - previous[after.length]! / longest;
}
