import { describe, expect, it } from 'vitest';
import {
  extendedShareLinkExpiry,
  isShareLinkDuration,
  isShareLinkEntityType,
  SHARE_LINK_DURATION_KEYS,
  SHARE_LINK_MAX_MS,
  shareLinkRemainingShare,
  shareLinkUrgency,
  splitShareLinkRemaining,
} from '../../shared/share-link';

const HOUR = 60 * 60 * 1000;
const now = 1_000_000_000;

describe('share link durations', () => {
  it('are offered shortest first, a day at most', () => {
    expect(SHARE_LINK_DURATION_KEYS).toEqual(['30m', '1h', '6h', '24h']);
    expect(SHARE_LINK_MAX_MS).toBe(24 * HOUR);
  });

  it('accept only their own keys and entity kinds', () => {
    expect(isShareLinkDuration('6h')).toBe(true);
    expect(isShareLinkDuration('toString')).toBe(false);
    expect(isShareLinkEntityType('diary-entry')).toBe(true);
    expect(isShareLinkEntityType('project-stage')).toBe(false);
  });
});

describe('extending a share link', () => {
  it('adds to what is left instead of starting over', () => {
    // Twenty hours left, one more: the link must never get shorter.
    expect(extendedShareLinkExpiry(now + 20 * HOUR, '1h', now)).toBe(
      now + 21 * HOUR,
    );
  });

  it('never opens a link further than a day ahead', () => {
    // Every duration is offered; whatever would pass a day stops there.
    expect(extendedShareLinkExpiry(now + 20 * HOUR, '24h', now)).toBe(
      now + SHARE_LINK_MAX_MS,
    );
    expect(extendedShareLinkExpiry(now + 20 * HOUR, '6h', now)).toBe(
      now + SHARE_LINK_MAX_MS,
    );
  });
});

describe('time left on a share link', () => {
  it('rounds to whole minutes, never down to nothing', () => {
    expect(splitShareLinkRemaining(5 * HOUR + 12 * 60_000)).toEqual({
      hours: 5,
      minutes: 12,
    });
    // A fresh hour-long link, read a moment before the clock ticks.
    expect(splitShareLinkRemaining(HOUR + 900)).toEqual({
      hours: 1,
      minutes: 0,
    });
    expect(splitShareLinkRemaining(1)).toEqual({ hours: 0, minutes: 1 });
    expect(splitShareLinkRemaining(-5)).toEqual({ hours: 0, minutes: 0 });
  });

  it('measures what is left against the current term', () => {
    const link = { createdAt: now, extendedAt: null, expiresAt: now + HOUR };
    expect(shareLinkRemainingShare(link, now)).toBe(1);
    expect(shareLinkRemainingShare(link, now + HOUR / 4)).toBe(0.75);
    expect(shareLinkRemainingShare(link, now + 2 * HOUR)).toBe(0);
    // Extending starts a new term, so the ring fills up again.
    const extended = {
      ...link,
      extendedAt: now + HOUR / 2,
      expiresAt: now + 2 * HOUR,
    };
    expect(shareLinkRemainingShare(extended, now + HOUR / 2)).toBe(1);
  });

  it('turns to a warning below 40% and to an alarm below 20%', () => {
    expect(shareLinkUrgency(0.41)).toBe('calm');
    expect(shareLinkUrgency(0.4)).toBe('calm');
    expect(shareLinkUrgency(0.39)).toBe('soon');
    expect(shareLinkUrgency(0.2)).toBe('soon');
    expect(shareLinkUrgency(0.19)).toBe('closing');
  });
});
