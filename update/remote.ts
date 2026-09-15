import { exec } from './exec';
import { repositoryUrl } from './environment';
import { compareVersions, isVersion, normalizeVersion } from './semver';

const checkTimeout = 20_000;
const cacheTtl = 5 * 60 * 1000;

interface CachedCheck {
  latestVersion?: string;
  checkedAt: number;
  error?: string;
}

let cache: CachedCheck | undefined;

/**
 * Extracts release tags from `git ls-remote --tags` output.
 *
 * Annotated tags appear twice, once as the tag object and once peeled as
 * `^{}`; anything that is not a plain semver tag is ignored.
 */
export function parseTags(output: string): string[] {
  const found = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const ref = line.split(/\s+/)[1];
    if (!ref?.startsWith('refs/tags/')) continue;

    const tag = ref.slice('refs/tags/'.length).replace(/\^\{\}$/, '');
    if (isVersion(tag)) found.add(tag);
  }

  return [...found].sort(compareVersions);
}

export async function fetchLatestVersion(cwd: string): Promise<string> {
  const { output } = await exec(
    'git',
    ['ls-remote', '--tags', repositoryUrl()],
    {
      cwd,
      timeout: checkTimeout,
      env: {
        // Never let git stop and wait for credentials: this runs inside a
        // request, and a prompt would hang it forever.
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        GCM_INTERACTIVE: 'never',
      },
    },
  );

  const tags = parseTags(output);
  const latest = tags.at(-1);

  if (!latest) {
    throw new Error('The repository has no released versions yet.');
  }

  return latest;
}

export async function checkForUpdate(
  cwd: string,
  options: { force?: boolean } = {},
): Promise<CachedCheck> {
  if (!options.force && cache && Date.now() - cache.checkedAt < cacheTtl) {
    return cache;
  }

  try {
    const latestVersion = await fetchLatestVersion(cwd);
    cache = { latestVersion, checkedAt: Date.now() };
  } catch (error) {
    cache = {
      checkedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return cache;
}

export function getCachedCheck(): CachedCheck | undefined {
  return cache;
}

export function clearCheckCache(): void {
  cache = undefined;
}

export function isNewer(candidate: string, current: string): boolean {
  return (
    isVersion(candidate) &&
    compareVersions(normalizeVersion(candidate), normalizeVersion(current)) > 0
  );
}
