import { describe, expect, it } from 'vitest';
import {
  internalUrlPastePattern,
  parseInternalUrl,
} from '../../shared/internal-url';

const site = { origins: ['https://example.com'], base: '/' };
const subfolder = {
  origins: ['https://example.com', 'http://localhost:3000'],
  base: '/archive/',
};

describe('parseInternalUrl', () => {
  it('recognises all seven kinds of entity address', () => {
    expect(
      parseInternalUrl('https://example.com/projects/studio-Pr0j/', site),
    ).toEqual({ entityType: 'project', publicId: 'Pr0j' });
    expect(
      parseInternalUrl(
        'https://example.com/projects/studio-Pr0j/stages/launch-St4g/',
        site,
      ),
    ).toEqual({
      entityType: 'project-stage',
      projectPublicId: 'Pr0j',
      publicId: 'St4g',
    });
    expect(
      parseInternalUrl(
        'https://example.com/projects/studio-Pr0j/sections/notes-S3c/',
        site,
      ),
    ).toEqual({
      entityType: 'project-section',
      projectPublicId: 'Pr0j',
      publicId: 'S3c',
    });
    expect(
      parseInternalUrl('https://example.com/events/open-day-Ev3nt/', site),
    ).toEqual({ entityType: 'event', publicId: 'Ev3nt' });
    expect(parseInternalUrl('https://example.com/pages/about/', site)).toEqual({
      entityType: 'page',
      slug: 'about',
    });
    expect(
      parseInternalUrl('https://example.com/diary/2024-05-12/', site),
    ).toEqual({ entityType: 'diary-entry', date: '2024-05-12' });
    expect(
      parseInternalUrl('https://example.com/tags/sea-kayaking-0a1b2c/', site),
    ).toEqual({ entityType: 'tag', publicId: '0a1b2c' });
    expect(parseInternalUrl('/tags/0a1b2c/', site)).toEqual({
      entityType: 'tag',
      publicId: '0a1b2c',
    });
  });

  it('tolerates a query, a hash, a missing slash and the Markdown mirror', () => {
    expect(
      parseInternalUrl('https://example.com/events/Ev3nt?utm=1#top', site),
    ).toEqual({ entityType: 'event', publicId: 'Ev3nt' });
    expect(
      parseInternalUrl('https://example.com/projects/Pr0j/index.md', site),
    ).toEqual({ entityType: 'project', publicId: 'Pr0j' });
  });

  it('accepts a site path, with or without the base', () => {
    expect(parseInternalUrl('/diary/2024-05-12/', site)).toEqual({
      entityType: 'diary-entry',
      date: '2024-05-12',
    });
    expect(parseInternalUrl('/archive/events/Ev3nt/', subfolder)).toEqual({
      entityType: 'event',
      publicId: 'Ev3nt',
    });
  });

  it('strips the base of a site served from a subfolder', () => {
    expect(
      parseInternalUrl('https://example.com/archive/pages/about/', subfolder),
    ).toEqual({ entityType: 'page', slug: 'about' });
    expect(
      parseInternalUrl('http://localhost:3000/archive/pages/about/', subfolder),
    ).toEqual({ entityType: 'page', slug: 'about' });
  });

  it('leaves other sites and other pages alone', () => {
    expect(
      parseInternalUrl('https://elsewhere.org/projects/studio-Pr0j/', site),
    ).toBeUndefined();
    expect(
      parseInternalUrl('https://example.com/projects/Pr0j/timeline/', site),
    ).toBeUndefined();
    expect(
      parseInternalUrl('https://example.com/events/Ev3nt/content/a.png', site),
    ).toBeUndefined();
    expect(
      parseInternalUrl('https://example.com/diary/2024-02-30/', site),
    ).toBeUndefined();
    expect(parseInternalUrl('https://example.com/life/', site)).toBeUndefined();
    expect(parseInternalUrl('//example.com/pages/x/', site)).toBeUndefined();
    expect(parseInternalUrl('not a url', site)).toBeUndefined();
  });
});

describe('internalUrlPastePattern', () => {
  it('claims addresses of entity sections on the site origins only', () => {
    const pattern = internalUrlPastePattern(subfolder);
    expect(
      pattern.test('https://example.com/archive/projects/studio-Pr0j/'),
    ).toBe(true);
    expect(
      pattern.test('http://localhost:3000/archive/diary/2024-05-12/'),
    ).toBe(true);
    expect(pattern.test('https://example.com/projects/studio-Pr0j/')).toBe(
      false,
    );
    expect(pattern.test('https://elsewhere.org/archive/pages/x/')).toBe(false);
    expect(pattern.test('https://example.com/archive/tags/sea-0a1b2c/')).toBe(
      true,
    );
    expect(pattern.test('https://example.com/archive/life/')).toBe(false);
  });
});
