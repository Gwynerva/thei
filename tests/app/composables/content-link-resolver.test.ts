import { describe, expect, it, vi } from 'vitest';
import { createContentLinkResolver } from '../../../app/composables/content-link-resolver';

describe('content link resolver', () => {
  it('deduplicates concurrent and resolved project lookups', async () => {
    const fetch = vi.fn(async () => ({
      kind: 'project',
      state: 'resolved',
      projectUuid: 'project-uuid',
      title: 'Current project title',
      summary: 'Current project summary',
      href: '/projects/current-slug-CURRENT/',
      iconMedia: {
        kind: 'image',
        src: '/project.svg',
        previewSrc: '/project.svg',
      },
    }));
    const resolver = createContentLinkResolver(fetch);
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
        kind: 'external',
        state: 'resolved',
        url: 'https://example.com/',
        href: 'https://example.com/',
        title: 'Recovered',
        iconMedia: {
          kind: 'image',
          src: '/favicon.svg',
          previewSrc: '/favicon.svg',
        },
      });
    const resolver = createContentLinkResolver(fetch);
    const reference = { kind: 'external', url: 'https://example.com' } as const;

    expect(await resolver(reference)).toMatchObject({
      state: 'broken',
      href: 'https://example.com/',
    });
    expect(await resolver(reference)).toMatchObject({
      state: 'resolved',
      href: 'https://example.com/',
      title: 'Recovered',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never exposes an unsafe fallback href', async () => {
    const fetch = vi.fn();
    const resolver = createContentLinkResolver(fetch);

    expect(
      await resolver({ kind: 'external', url: 'javascript:alert(1)' }),
    ).toEqual({
      kind: 'external',
      url: 'javascript:alert(1)',
      state: 'broken',
      reason: 'invalid',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps request-scoped caches isolated', async () => {
    const firstFetch = vi.fn(async () => ({
      kind: 'project' as const,
      projectUuid: 'project-uuid',
      state: 'resolved' as const,
      href: '/first/',
      title: 'First request',
    }));
    const secondFetch = vi.fn(async () => ({
      kind: 'project' as const,
      projectUuid: 'project-uuid',
      state: 'resolved' as const,
      href: '/second/',
      title: 'Second request',
    }));
    const reference = { kind: 'project', projectUuid: 'project-uuid' } as const;

    expect(
      await createContentLinkResolver(firstFetch)(reference),
    ).toMatchObject({ href: '/first/', title: 'First request' });
    expect(
      await createContentLinkResolver(secondFetch)(reference),
    ).toMatchObject({ href: '/second/', title: 'Second request' });
    expect(firstFetch).toHaveBeenCalledTimes(1);
    expect(secondFetch).toHaveBeenCalledTimes(1);
  });

  it('uses a separate endpoint for administrative resolution', async () => {
    const fetch = vi.fn(async () => ({
      kind: 'project' as const,
      projectUuid: 'private-project',
      state: 'resolved' as const,
      href: '/projects/private/',
      title: 'Private project',
    }));
    const resolver = createContentLinkResolver(
      fetch,
      '/api/admin/content-links',
    );

    await resolver({ kind: 'project', projectUuid: 'private-project' });

    expect(fetch).toHaveBeenCalledWith('/api/admin/content-links', {
      query: { kind: 'project', projectUuid: 'private-project' },
    });
  });

  it('resolves pages through the same cache and endpoint contract', async () => {
    const fetch = vi.fn(async () => ({
      kind: 'page' as const,
      pageUuid: 'pg-about',
      state: 'resolved' as const,
      href: '/pages/about/',
      title: 'About',
      summary: 'About this site',
      iconMedia: {
        kind: 'image' as const,
        src: '/page.webp',
        previewSrc: '/page.webp',
      },
    }));
    const resolver = createContentLinkResolver(fetch);
    const reference = { kind: 'page', pageUuid: 'pg-about' } as const;

    expect(await resolver(reference)).toMatchObject({
      kind: 'page',
      href: '/pages/about/',
    });
    expect(await resolver(reference)).toMatchObject({ title: 'About' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/content-links', {
      query: { kind: 'page', pageUuid: 'pg-about' },
    });
  });
});
