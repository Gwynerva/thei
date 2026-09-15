import {
  lstat,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Repoints symlinks that still refer to the directory a build was produced in.
 *
 * Nitro writes absolute symlinks into `server/node_modules` when a traced
 * dependency exists in several versions, so a build made in a staging
 * directory points at that staging directory forever. Moving the build without
 * fixing them leaves the server unable to resolve those packages.
 *
 * Returns the number of links repointed.
 */
export async function retargetSymlinks(
  root: string,
  from: string,
  to: string,
): Promise<number> {
  const fromPosix = toPosix(from);
  const toPosix_ = toPosix(to);
  let changed = 0;

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        const target = toPosix(await readlink(path));
        if (!target.startsWith(fromPosix)) continue;

        const next = toPosix_ + target.slice(fromPosix.length);

        // Windows needs to be told what kind of link to make, and a junction
        // is the only directory link it allows without elevation — which is
        // what Nitro itself uses. POSIX ignores the type. The old link has to
        // go before the new one can take its place.
        let type: 'junction' | 'file' = 'junction';
        try {
          type = (await lstat(next)).isDirectory() ? 'junction' : 'file';
        } catch {
          // Keep 'junction': every link Nitro writes points at a package dir.
        }

        await unlink(path);
        await symlink(next, path, type);
        changed++;
        continue;
      }

      if (entry.isDirectory()) await walk(path);
    }
  }

  await walk(root);
  return changed;
}

export interface SwapResult {
  retargeted: number;
}

/**
 * Puts a staged build in place, keeping the one it replaces as `.output.prev`
 * so it can be rolled back to.
 */
export async function swapOutput(
  projectPath: string,
  stagingDir: string,
): Promise<SwapResult> {
  const current = join(projectPath, '.output');
  const previous = join(projectPath, '.output.prev');

  await rm(previous, { recursive: true, force: true });

  try {
    await rename(current, previous);
  } catch (error) {
    // A first build, or a half-finished previous swap: nothing to keep.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await rename(stagingDir, current);

  const retargeted = await retargetSymlinks(current, stagingDir, current);

  return { retargeted };
}
