import { effectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createExternalLinkDraft,
  createExternalLinkStore,
  EXTERNAL_LINK_TYPING_DELAY_MS,
  useExternalLinkTyping,
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

  it('reads after a pause only a finished host, and leaves the text alone', async () => {
    const { fetch, calls } = fetcher();
    const draft = createExternalLinkDraft(createExternalLinkStore(fetch), {
      errorText,
    });
    draft.url = 'https://exa';
    expect(await draft.commit({ typing: true })).toBeUndefined();
    expect(calls).toEqual([]);

    draft.url = 'https://example.com';
    const link = await draft.commit({ typing: true });
    expect(link?.title).toBe('Read 1');
    expect(draft.preview).toEqual(link);
    expect(draft.url).toBe('https://example.com');
    expect(calls).toEqual([{ method: 'POST', url: 'https://example.com/' }]);

    // Done: nothing more to read, and the field shows the stored address.
    expect(await draft.commit()).toEqual(link);
    expect(calls).toHaveLength(1);
    expect(draft.url).toBe('https://example.com/');
  });

  it('joins a read started by a pause when the address is confirmed', async () => {
    const { fetch, calls } = fetcher();
    const draft = createExternalLinkDraft(createExternalLinkStore(fetch), {
      errorText,
    });
    draft.url = 'https://example.com';
    const paused = draft.commit({ typing: true });
    const done = draft.commit();
    const [first, second] = await Promise.all([paused, done]);
    expect(first).toEqual(second);
    expect(calls).toHaveLength(1);
    expect(draft.url).toBe('https://example.com/');
  });

  it('reads an address typed away from and back to anew', async () => {
    const { fetch, calls } = fetcher();
    const draft = createExternalLinkDraft(createExternalLinkStore(fetch), {
      errorText,
    });
    draft.url = 'https://example.com';
    const dropped = draft.commit({ typing: true });
    draft.url = 'https://example.com/a';
    draft.url = 'https://example.com';
    expect(await dropped).toBeUndefined();

    const link = await draft.commit();
    expect(link?.title).toBe('Read 2');
    expect(draft.preview).toEqual(link);
    expect(calls).toHaveLength(2);
  });

  it('does not read an address the page knows while it is typed', async () => {
    const { fetch, calls } = fetcher();
    const store = createExternalLinkStore(fetch);
    store.seed([record('https://known.example/', 'Known')]);
    const draft = createExternalLinkDraft(store, { errorText });
    draft.url = 'https://known.example';
    expect((await draft.commit({ typing: true }))?.title).toBe('Known');
    expect(calls).toEqual([]);
    expect(draft.url).toBe('https://known.example');
  });
});

describe('typing into an address', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function input(inputType = 'insertText', isComposing = false) {
    return Object.assign(new Event('input'), { inputType, isComposing });
  }

  function typed(settle: (options: { typing: boolean }) => unknown) {
    const scope = effectScope();
    const typing = scope.run(() => useExternalLinkTyping(settle))!;
    return { scope, typing };
  }

  it('settles once, a pause after the last keystroke', () => {
    vi.useFakeTimers();
    const settle = vi.fn();
    const { typing } = typed(settle);
    typing.onInput(input());
    vi.advanceTimersByTime(EXTERNAL_LINK_TYPING_DELAY_MS - 1);
    typing.onInput(input());
    vi.advanceTimersByTime(EXTERNAL_LINK_TYPING_DELAY_MS - 1);
    expect(settle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(settle).toHaveBeenCalledExactlyOnceWith({ typing: true });
  });

  it('measures the pause from the keystroke even while a read is under way', () => {
    vi.useFakeTimers();
    const settle = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
    );
    const { typing } = typed(settle);
    typing.onInput(input());
    vi.advanceTimersByTime(EXTERNAL_LINK_TYPING_DELAY_MS);
    expect(settle).toHaveBeenCalledTimes(1);
    typing.onInput(input());
    vi.advanceTimersByTime(EXTERNAL_LINK_TYPING_DELAY_MS);
    expect(settle).toHaveBeenCalledTimes(2);
  });

  it('waits for composed text and settles a paste or a drop at once, as done', () => {
    vi.useFakeTimers();
    const settle = vi.fn();
    const { typing } = typed(settle);
    typing.onInput(input('insertCompositionText', true));
    vi.advanceTimersByTime(EXTERNAL_LINK_TYPING_DELAY_MS * 2);
    expect(settle).not.toHaveBeenCalled();

    typing.onInput(input('insertFromPaste'));
    expect(settle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(settle).toHaveBeenCalledExactlyOnceWith({ typing: false });

    typing.onInput(input('insertFromDrop'));
    vi.advanceTimersByTime(0);
    expect(settle).toHaveBeenLastCalledWith({ typing: false });
  });

  it('forgets a pending pause when cancelled or disposed', () => {
    vi.useFakeTimers();
    const settle = vi.fn();
    const { scope, typing } = typed(settle);
    typing.onInput(input());
    typing.cancel();
    vi.advanceTimersByTime(EXTERNAL_LINK_TYPING_DELAY_MS);
    typing.onInput(input());
    scope.stop();
    vi.advanceTimersByTime(EXTERNAL_LINK_TYPING_DELAY_MS);
    expect(settle).not.toHaveBeenCalled();
  });

  it('swallows a failed settle', async () => {
    vi.useFakeTimers();
    const settle = vi.fn(async () => {
      throw new Error('offline');
    });
    const { typing } = typed(settle);
    typing.onInput(input());
    await vi.advanceTimersByTimeAsync(EXTERNAL_LINK_TYPING_DELAY_MS);
    expect(settle).toHaveBeenCalledTimes(1);
  });
});
