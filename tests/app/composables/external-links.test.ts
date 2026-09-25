import { describe, expect, it, vi } from 'vitest';
import {
  createExternalLinkDraft,
  createExternalLinkStore,
  type ExternalLinkFetcher,
} from '../../../app/composables/external-links';
import type { ExternalLink } from '../../../shared/external-link';

function record(url: string, title = 'Title'): ExternalLink {
  return {
    url,
    title,
    faviconMedia: { kind: 'image', src: '/x.webp', previewSrc: '/x.webp' },
    status: 'complete',
    touchedAt: 1,
  };
}

function fetcher() {
  const calls: Array<{ method: string; url: string }> = [];
  const fetch = vi.fn(async (_endpoint, options) => {
    const url = (options.body?.url as string) ?? options.query?.url ?? '';
    calls.push({ method: options.method ?? 'GET', url });
    await new Promise((resolve) => setTimeout(resolve, 1));
    return record(url, `Read ${calls.length}`);
  }) as unknown as ExternalLinkFetcher & { mock: { calls: unknown[] } };
  return { fetch, calls };
}

describe('the link store', () => {
  it('remembers what the page came with and asks about an address once', async () => {
    const { fetch, calls } = fetcher();
    const store = createExternalLinkStore(fetch);
    store.seed([
      record('https://known.example/'),
      { url: 'https://bare.example/' },
      undefined,
    ]);
    expect(store.get('https://known.example/')?.title).toBe('Title');
    expect(store.get('https://bare.example/')).toBeUndefined();

    expect(await store.lookup('https://known.example/')).toMatchObject({
      title: 'Title',
    });
    expect(calls).toEqual([]);

    const [first, second] = await Promise.all([
      store.lookup('https://new.example/'),
      store.lookup('https://new.example/'),
    ]);
    expect(first).toBe(second);
    expect(calls).toEqual([{ method: 'GET', url: 'https://new.example/' }]);
    expect(store.get('https://new.example/')).toBe(first);

    await store.refresh('https://known.example/');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ method: 'POST', url: 'https://known.example/' });
    expect(store.get('https://known.example/')?.title).toBe('Read 2');
  });

  it('requests nothing where it cannot, as during server rendering', async () => {
    const { fetch, calls } = fetcher();
    const store = createExternalLinkStore(fetch, { canRequest: false });
    expect(await store.lookup('https://new.example/')).toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe('a link draft', () => {
  const errorText = () => 'Could not';

  it('reads nothing while typing and once when the address is done', async () => {
    const { fetch, calls } = fetcher();
    const draft = createExternalLinkDraft(createExternalLinkStore(fetch), {
      errorText,
    });
    for (const text of ['h', 'https://', 'https://exa', 'https://example.com'])
      draft.url = text;
    expect(calls).toEqual([]);
    expect(draft.preview).toBeUndefined();

    const link = await draft.commit();
    expect(link?.title).toBe('Read 1');
    expect(draft.preview).toEqual(link);
    expect(draft.url).toBe('https://example.com/');
    expect(draft.loading).toBe(false);
    expect(calls).toEqual([{ method: 'POST', url: 'https://example.com/' }]);

    // Done again with the same address: nothing more to read.
    expect(await draft.commit()).toEqual(link);
    expect(calls).toHaveLength(1);

    // Asked to, it reads again.
    await draft.refresh();
    expect(calls).toHaveLength(2);
    expect(draft.preview?.title).toBe('Read 2');
  });

  it('shows why an address is unusable and clears it with the text', () => {
    const { fetch, calls } = fetcher();
    const draft = createExternalLinkDraft(createExternalLinkStore(fetch), {
      errorText,
    });
    draft.url = 'ftp://example.com/';
    expect(draft.error).toBe('External link must use HTTP or HTTPS');
    draft.url = '';
    expect(draft.error).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('opens an existing link from the store, or looks it up once', async () => {
    const { fetch, calls } = fetcher();
    const store = createExternalLinkStore(fetch);
    store.seed([record('https://known.example/', 'Known')]);
    const draft = createExternalLinkDraft(store, { errorText });

    await draft.open('https://known.example/');
    expect(draft.preview?.title).toBe('Known');
    expect(calls).toEqual([]);
    // Confirming an untouched address reads nothing either.
    await draft.commit();
    expect(calls).toEqual([]);

    await draft.open('https://other.example/');
    expect(calls).toEqual([{ method: 'GET', url: 'https://other.example/' }]);
    expect(draft.preview?.url).toBe('https://other.example/');
  });

  it('drops an answer that arrives for an address no longer in the field', async () => {
    const { fetch, calls } = fetcher();
    const draft = createExternalLinkDraft(createExternalLinkStore(fetch), {
      errorText,
    });
    draft.url = 'https://first.example/';
    const pending = draft.commit();
    draft.url = 'https://second.example/';
    expect(await pending).toBeUndefined();
    expect(draft.preview).toBeUndefined();
    expect(draft.loading).toBe(false);
    expect(calls).toEqual([{ method: 'POST', url: 'https://first.example/' }]);
  });

  it('reports a failed request in the caller’s words', async () => {
    const fetch = vi.fn(async () => {
      throw Object.assign(new Error('nope'), {
        data: { statusMessage: 'Bad address' },
      });
    }) as unknown as ExternalLinkFetcher;
    const draft = createExternalLinkDraft(createExternalLinkStore(fetch), {
      errorText,
    });
    draft.url = 'https://example.com/';
    expect(await draft.commit()).toBeUndefined();
    expect(draft.error).toBe('Bad address');
    expect(draft.loading).toBe(false);
  });
});
