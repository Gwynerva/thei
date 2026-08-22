import { describe, expect, it } from 'vitest';
import { normalizeAdminDiskUsage } from '../../../shared/admin/disk-usage';

describe('admin disk usage', () => {
  it('keeps all sections non-negative and equal to the total', () => {
    const usage = normalizeAdminDiskUsage(1_000, 600, 100);
    expect(usage).toEqual({
      total: 1_000,
      free: 600,
      otherUsed: 300,
      theiUsed: 100,
    });
    expect(usage.free + usage.otherUsed + usage.theiUsed).toBe(usage.total);
  });

  it('clamps invalid and oversized values', () => {
    expect(normalizeAdminDiskUsage(100, 200, 80)).toEqual({
      total: 100,
      free: 100,
      otherUsed: 0,
      theiUsed: 0,
    });
    expect(normalizeAdminDiskUsage(100, 20, 200)).toEqual({
      total: 100,
      free: 20,
      otherUsed: 0,
      theiUsed: 80,
    });
    expect(normalizeAdminDiskUsage(Number.NaN, -1, Infinity)).toEqual({
      total: 0,
      free: 0,
      otherUsed: 0,
      theiUsed: 0,
    });
  });
});
