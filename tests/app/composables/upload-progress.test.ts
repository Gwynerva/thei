import { describe, expect, it } from 'vitest';
import { advanceUploadStatus } from '../../../app/composables/upload-progress';

describe('the upload status shown next', () => {
  it('never shows a smaller share than the one shown', () => {
    const shown = { phase: 'processing' as const, progress: 0.22 };
    expect(
      advanceUploadStatus(shown, { phase: 'processing', progress: 0.2 }),
    ).toBe(shown);
    expect(
      advanceUploadStatus(shown, { phase: 'processing', progress: 0.3 }),
    ).toEqual({ phase: 'processing', progress: 0.3 });
  });

  it('keeps the share through a step that reports none', () => {
    expect(
      advanceUploadStatus(
        { phase: 'processing', progress: 0.9 },
        { phase: 'processing' },
      ),
    ).toEqual({ phase: 'processing', progress: 0.9 });
  });

  it('follows a change of phase, and a status from nothing', () => {
    expect(
      advanceUploadStatus(
        { phase: 'queued' },
        { phase: 'processing', progress: 0.1 },
      ),
    ).toEqual({ phase: 'processing', progress: 0.1 });
    expect(
      advanceUploadStatus(
        { phase: 'staging', progress: 1 },
        { phase: 'processing' },
      ),
    ).toEqual({ phase: 'processing' });
    expect(advanceUploadStatus(null, { phase: 'queued' })).toEqual({
      phase: 'queued',
    });
    expect(
      advanceUploadStatus({ phase: 'processing', progress: 0.5 }, null),
    ).toBeNull();
  });
});
