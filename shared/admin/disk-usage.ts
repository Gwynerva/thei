export type AdminDiskUsage = {
  total: number;
  free: number;
  otherUsed: number;
  theiUsed: number;
};

export function normalizeAdminDiskUsage(
  totalBytes: number,
  freeBytes: number,
  theiBytes: number,
): AdminDiskUsage {
  const total = normalizeBytes(totalBytes);
  const free = Math.min(total, normalizeBytes(freeBytes));
  const used = total - free;
  const theiUsed = Math.min(used, normalizeBytes(theiBytes));
  const otherUsed = used - theiUsed;

  return { total, free, otherUsed, theiUsed };
}

function normalizeBytes(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
