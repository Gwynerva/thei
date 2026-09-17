import { describe, expect, it } from 'vitest';
import {
  contentIntegrationUrl,
  matchContentIntegration,
  youtubeIntegration,
} from '../../shared/content-integrations';
import {
  ContentValidationError,
  collectContentExternalLinkUrls,
  normalizeContentData,
} from '../../shared/content';
import { extractContentReferenceCandidates } from '../../shared/public-content-reference';

describe('YouTube integration', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', {}],
    [
      'https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=1m30s',
      { start: 90 },
    ],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42', { start: 42 }],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', {}],
    ['https://youtu.be/dQw4w9WgXcQ?t=1h2m3s', { start: 3723 }],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', {}],
    ['https://www.youtube.com/live/dQw4w9WgXcQ?si=abc', {}],
    [
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=7',
      { start: 7 },
    ],
  ])('recognises %s', (url, extra) => {
    expect(youtubeIntegration.pattern.test(url)).toBe(true);
    expect(matchContentIntegration(url)).toEqual({
      provider: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      ...extra,
    });
  });

  it.each([
    'https://www.youtube.com/@channel',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/watch?v=short',
    'https://youtu.be/',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://example.com/?u=https://youtu.be/dQw4w9WgXcQ',
  ])('leaves %s to the external link block', (url) => {
    // The paste pattern and the parser must agree, or a paste would create a
    // block that cannot render.
    expect(youtubeIntegration.pattern.test(url)).toBe(false);
    expect(matchContentIntegration(url)).toBeUndefined();
  });

  it('builds a canonical address with the start offset', () => {
    expect(
      contentIntegrationUrl({
        provider: 'youtube',
        videoId: 'dQw4w9WgXcQ',
        start: 90,
      }),
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');
  });
});

describe('integration blocks in content', () => {
  const block = {
    type: 'integration',
    data: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', extra: 'dropped' },
  };

  it('normalizes known providers and rejects unknown ones', () => {
    expect(normalizeContentData({ blocks: [block] }).blocks).toEqual([
      {
        id: undefined,
        type: 'integration',
        data: { provider: 'youtube', videoId: 'dQw4w9WgXcQ' },
      },
    ]);
    expect(() =>
      normalizeContentData({
        blocks: [{ type: 'integration', data: { provider: 'nope' } }],
      }),
    ).toThrow(ContentValidationError);
  });

  it('lists the video as an external link of the content', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(collectContentExternalLinkUrls({ blocks: [block] })).toEqual([url]);
    expect(
      extractContentReferenceCandidates({ blocks: [block] } as never).links,
    ).toEqual([{ kind: 'external', url }]);
  });
});
