export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers, empty for a stable release. */
  prerelease: (string | number)[];
}

const versionPattern =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z.-]+))?(?:\+[0-9a-z.-]+)?$/i;

/**
 * Parses a semver string. Returns `undefined` for anything that is not a
 * plain `major.minor.patch` version, so callers can simply skip tags that are
 * not releases.
 */
export function parseVersion(value: string): ParsedVersion | undefined {
  const match = versionPattern.exec(value.trim());
  if (!match) return undefined;

  const prerelease = match[4]
    ? match[4]
        .split('.')
        .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : [];

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

/** Strips a leading `v` and any build metadata. */
export function normalizeVersion(value: string): string {
  const parsed = parseVersion(value);
  if (!parsed) return value.trim();

  const core = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  return parsed.prerelease.length
    ? `${core}-${parsed.prerelease.join('.')}`
    : core;
}

export function isVersion(value: string): boolean {
  return parseVersion(value) !== undefined;
}

function comparePrerelease(
  a: (string | number)[],
  b: (string | number)[],
): number {
  // A stable release always outranks a prerelease of the same core version.
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;

  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const left = a[index];
    const right = b[index];

    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;

    const leftIsNumber = typeof left === 'number';
    const rightIsNumber = typeof right === 'number';

    if (leftIsNumber && rightIsNumber) return left < right ? -1 : 1;
    if (leftIsNumber) return -1;
    if (rightIsNumber) return 1;

    return String(left) < String(right) ? -1 : 1;
  }

  return 0;
}

/**
 * Returns a negative number when `a` is older than `b`, zero when they are the
 * same release, and a positive number when `a` is newer. Unparseable versions
 * sort before every real version.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);

  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;

  return comparePrerelease(left.prerelease, right.prerelease);
}

/** Returns the newest of the given versions, ignoring unparseable ones. */
export function newestVersion(versions: string[]): string | undefined {
  let newest: string | undefined;

  for (const version of versions) {
    if (!isVersion(version)) continue;
    if (!newest || compareVersions(version, newest) > 0) newest = version;
  }

  return newest;
}
