import { describe, it, expect } from 'vitest';
import enModule, { plural } from '../../../../shared/language/list/en';

const { normalize } = enModule;

describe('normalize', () => {
  it('replaces ... with ellipsis', () => {
    expect(normalize!('Wait...')).toBe('Wait\u2026');
  });

  it('replaces -- with em dash', () => {
    expect(normalize!('one -- two')).toBe('one \u2014 two');
  });

  it('converts straight double quotes to curly', () => {
    expect(normalize!('"hello"')).toBe('\u201Chello\u201D');
  });

  it('converts apostrophes in contractions to smart apostrophe', () => {
    expect(normalize!("don't")).toBe('don\u2019t');
  });
});

describe('plural', () => {
  it('1 → one form', () =>
    expect(plural(1, 'project', 'projects')).toBe('1 project'));
  it('2 → few form', () =>
    expect(plural(2, 'project', 'projects')).toBe('2 projects'));
  it('0 → few form', () =>
    expect(plural(0, 'project', 'projects')).toBe('0 projects'));
  it('includeNumber=false omits count', () =>
    expect(plural(1, 'project', 'projects', false)).toBe('project'));
});
