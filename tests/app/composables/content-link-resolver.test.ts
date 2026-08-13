import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminContentLinkResolver } from '../../../app/composables/content-link-resolver';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin content link resolver', () => {
  it('deduplicates concurrent and resolved project lookups', async () => {
    const fetch = vi.fn(async () => [
      {
        projectUuid: 'project-uuid',
        title: 'Current project title',
        summary: 'Current project summary',
        humanReadableSlug: 'current-slug',
        publicId: 'CURRENT',
        iconMedia: {
          kind: 'image',
          src: '/project.svg',
          previewSrc: '/project.svg',
        },
        tags: [],
      },
    ]);
    vi.stubGlobal('$fetch', fetch);
    const resolver = createAdminContentLinkResolver();
    const reference = { kind: 'project', projectUuid: 'project-uuid' } as const;

    const [first, second] = await Promise.all([
      resolver(reference),
      resolver(reference),
    ]);
    const third = await resolver(reference);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(third).toMatchObject({
      state: 'resolved',
      kind: 'project',
      projectUuid: 'project-uuid',
      href: '/projects/current-slug-CURRENT/',
      summary: 'Current project summary',
    });
  });

  it('does not cache failures so a broken link can recover', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        url: 'https://example.com/',
        title: 'Recovered',
        faviconMedia: {
          kind: 'image',
          src: '/favicon.svg',
          previewSrc: '/favicon.svg',
        },
        touchedAt: 1,
      });
    vi.stubGlobal('$fetch', fetch);
    const resolver = createAdminContentLinkResolver();
    const reference = { kind: 'external', url: 'https://example.com' } as const;

    expect(await resolver(reference)).toMatchObject({ state: 'broken' });
    expect(await resolver(reference)).toMatchObject({
      state: 'resolved',
      href: 'https://example.com/',
      title: 'Recovered',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
