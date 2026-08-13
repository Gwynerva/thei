import { describe, expect, it } from 'vitest';
import {
  preserveContentMediaPlayback,
  restoredContentMediaTime,
} from '../../shared/content-media-playback';

describe('content media playback restoration', () => {
  it('preserves time and the explicit user play/pause intent', () => {
    expect(
      preserveContentMediaPlayback(
        { currentTime: 1, wantsPlayback: true },
        { currentTime: 12.5, paused: true },
      ),
    ).toEqual({ currentTime: 12.5, wantsPlayback: false });
    expect(
      preserveContentMediaPlayback(
        { currentTime: 1, wantsPlayback: false },
        { currentTime: 3, paused: false },
      ),
    ).toEqual({ currentTime: 3, wantsPlayback: true });
  });

  it('does not treat a lifecycle pause as user intent and clamps restored time', () => {
    expect(
      preserveContentMediaPlayback(
        { currentTime: 1, wantsPlayback: true },
        { currentTime: 4, paused: true },
        true,
      ),
    ).toEqual({ currentTime: 4, wantsPlayback: true });
    expect(restoredContentMediaTime(12, 10)).toBeCloseTo(9.99);
    expect(restoredContentMediaTime(5, Number.NaN)).toBe(5);
  });
});
