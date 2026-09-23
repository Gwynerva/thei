import { describe, expect, it, vi } from 'vitest';
import { createContentLinkResolver } from '../../../app/composables/content-link-resolver';

describe('content link resolver', () => {
  it('deduplicates concurrent and resolved project lookups', async () => {
    const fetch = vi.fn(async () => ({
      kind: 'entity',
      entityType: 'project',
      entityId: 'project-uuid',
      state: 'resolved',
      title: 'Current project title',
      summary: 'Current project summary',
      href: '/projects/current-slug-CURRENT/',
      media: {
        kind: 'image',
        src: '/project.svg',
        previewSrc: '/project.svg',
      },
    }));
    const resolver = createContentLinkResolver(fetch);
    const reference = {
      kind: 'entity',
      entityType: 'project',
      entityId: 'project-uuid',
    } as const;

    const [first, second] = await Promise.all([
      resolver(reference),
      resolver(reference),
    ]);
    const third = await resolver(reference);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(third).toMatchObject({
      state: 'resolved',
      kind: 'entity',
      entityType: 'project',
      entityId: 'project-uuid',
      href: '/projects/current-slug-CURRENT/',
      summary: 'Current project summary',
    });
  });

  it('asks again once cleared, so a deleted target shows as broken', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'entity',
        entityType: 'project',
        entityId: 'project-uuid',
        state: 'resolved',
        href: '/projects/gone-GONE/',
        title: 'Gone',
        summary: '',
      })
      .mockResolvedValueOnce({
        kind: 'entity',
        entityType: 'project',
        entityId: 'project-uuid',
        state: 'broken',
        reason: 'not-found',
      });
    const resolver = createContentLinkResolver(fetch);
    const reference = {
      kind: 'entity',
      entityType: 'project',
      entityId: 'project-uuid',
    } as const;

    expect(await resolver(reference)).toMatchObject({ state: 'resolved' });
    expect(await resolver(reference)).toMatchObject({ state: 'resolved' });
    resolver.clear();
    expect(await resolver(reference)).toMatchObject({
      state: 'broken',
      reason: 'not-found',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
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
      kind: 'entity' as const,
      entityType: 'project' as const,
      entityId: 'project-uuid',
      state: 'resolved' as const,
      href: '/first/',
      title: 'First request',
    }));
    const secondFetch = vi.fn(async () => ({
      kind: 'entity' as const,
      entityType: 'project' as const,
      entityId: 'project-uuid',
      state: 'resolved' as const,
      href: '/second/',
      title: 'Second request',
    }));
    const reference = {
      kind: 'entity',
      entityType: 'project',
      entityId: 'project-uuid',
    } as const;

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
      kind: 'entity' as const,
      entityType: 'project' as const,
      entityId: 'private-project',
      state: 'resolved' as const,
      href: '/projects/private/',
      title: 'Private project',
    }));
    const resolver = createContentLinkResolver(
      fetch,
      '/api/admin/content-links',
    );

    await resolver({
      kind: 'entity',
      entityType: 'project',
      entityId: 'private-project',
    });

    expect(fetch).toHaveBeenCalledWith('/api/admin/content-links', {
      query: {
        kind: 'entity',
        entityType: 'project',
        entityId: 'private-project',
      },
    });
  });

  it('resolves every kind of entity through one cache and endpoint contract', async () => {
    const fetch = vi.fn(async () => ({
      kind: 'entity' as const,
      entityType: 'diary-entry' as const,
      entityId: 'diary-uuid',
      state: 'resolved' as const,
      href: '/diary/2024-05-12/',
      title: '2024-05-12',
      date: '2024-05-12',
      summary: 'Rain all day',
    }));
    const resolver = createContentLinkResolver(fetch);
    const reference = {
      kind: 'entity',
      entityType: 'diary-entry',
      entityId: 'diary-uuid',
    } as const;

    expect(await resolver(reference)).toMatchObject({
      entityType: 'diary-entry',
      href: '/diary/2024-05-12/',
    });
    expect(await resolver(reference)).toMatchObject({ date: '2024-05-12' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/content-links', {
      query: {
        kind: 'entity',
        entityType: 'diary-entry',
        entityId: 'diary-uuid',
      },
    });
  });
});
