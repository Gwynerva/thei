type Enumerator<T> = Record<string, T>;

export function isOneOf<T>(
  value: unknown,
  is: readonly T[] | Enumerator<T>,
): value is T {
  if (Array.isArray(is)) {
    return (is as readonly T[]).includes(value as T);
  }

  return (Object.values(is) as T[]).includes(value as T);
}
