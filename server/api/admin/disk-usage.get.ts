import { stat, readdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { projectPath } from '#thei/static';

async function getDirSize(
  dirPath: string,
  skipNodeModules = false,
): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (skipNodeModules && entry.name === 'node_modules') continue;
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirSize(full, skipNodeModules);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        const s = await stat(full);
        total += s.size;
      } catch {
        // skip unreadable files
      }
    }
  }
  return total;
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return 0;
  }
}

async function getAvailableBytes(path: string): Promise<number> {
  try {
    const s = await statfs(path);
    return s.bavail * s.bsize;
  } catch {
    return 0;
  }
}

export default defineEventHandler(async () => {
  const [available, installSize, theiTempSize, databaseSize, assetsSize] =
    await Promise.all([
      getAvailableBytes(projectPath),
      getDirSize(projectPath, true),
      getDirSize(join(projectPath, '.thei')),
      getFileSize(THEI_SERVER.contentPath('thei.db')),
      getDirSize(THEI_SERVER.contentPath('assets')),
    ]);

  return { available, installSize, theiTempSize, databaseSize, assetsSize };
});
