import { describe, expect, it } from 'vitest';
import { formatEntityPlaceName } from '../../shared/entity-place-name';
import { formatAbsolutePublicDate } from '../../shared/public-date-format';

const name = (value: string) =>
  formatEntityPlaceName(
    value,
    (day) => formatAbsolutePublicDate(day, 'en'),
    (text) => `[${text}]`,
  );

describe('a name put together of several', () => {
  it('writes out a diary entry’s day wherever it stands', () => {
    expect(name('2026-04-06')).toBe('April 6, 2026');
    expect(name('2026-04-06 · Morning')).toBe('April 6, 2026 · [Morning]');
    expect(name('2026-04-06 › A heading')).toBe('April 6, 2026 › [A heading]');
    expect(name('The project · 2026-04-06')).toBe(
      '[The project] · April 6, 2026',
    );
  });

  it('formats the owner’s words and leaves a day inside them alone', () => {
    expect(name('Launch')).toBe('[Launch]');
    expect(name('Notes of 2026-04-06')).toBe('[Notes of 2026-04-06]');
  });

  it('reads a title that is nothing but a stored day as that day', () => {
    // The name comes as one string, so an event the owner titled
    // «2026-04-06» cannot be told from a diary entry: it reads as the day.
    expect(name('2026-04-06')).toBe('April 6, 2026');
    expect(name('The project · 2026-04-06 › 2026-04-07')).toBe(
      '[The project] · April 6, 2026 › April 7, 2026',
    );
    // Anything more in the part keeps it the owner's words.
    expect(name('2026-04-06!')).toBe('[2026-04-06!]');
    expect(name(' 2026-04-06')).toBe('[ 2026-04-06]');
  });
});
