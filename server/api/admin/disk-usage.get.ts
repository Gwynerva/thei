import { lstat, readdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { projectPath } from '#thei/static';
import { normalizeAdminDiskUsage } from '#layers/thei/shared/admin/disk-usage';

const THEI_SIZE_CACHE_MS = 30_000;
let cachedTheiSize: { value: number; expiresAt: number } | undefined;
let pendingTheiSize: Promise<number> | undefined;

async function getDirSize(dirPath: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirSize(full);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        const s = await lstat(full);
        total += s.size;
      } catch {
        // skip unreadable files
      }
    }
  }
  return total;
}

function getTheiSize(): Promise<number> {
  const now = Date.now();
  if (cachedTheiSize && cachedTheiSize.expiresAt > now) {
    return Promise.resolve(cachedTheiSize.value);
  }
  if (pendingTheiSize) return pendingTheiSize;

  pendingTheiSize = getDirSize(THEI_SERVER.contentPath())
    .then((value) => {
      cachedTheiSize = {
        value,
        expiresAt: Date.now() + THEI_SIZE_CACHE_MS,
      };
      return value;
    })
    .finally(() => {
      pendingTheiSize = undefined;
    });

  return pendingTheiSize;
}

export default defineEventHandler(async () => {
  const [fileSystem, theiSize] = await Promise.all([
    statfs(projectPath),
    getTheiSize(),
  ]);

  return normalizeAdminDiskUsage(
    fileSystem.blocks * fileSystem.bsize,
    fileSystem.bavail * fileSystem.bsize,
    theiSize,
  );
});
