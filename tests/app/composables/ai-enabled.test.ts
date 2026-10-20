import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref, type Ref } from 'vue';
import {
  setAiEnabled,
  useAiEnabled,
  useAiModelReady,
  useAiWaiting,
} from '../../../app/composables/ai-enabled';

/**
 * What the admin knows of AI, from the admin bar's summary: turned off on
 * the page, nothing of it is offered any more — a text's ✦ included, though
 * the summary said its model answers — and turned on, the summary is read
 * again for what it could not say while AI was off.
 */
type Summary = {
  aiEnabled: boolean;
  aiModelReady: boolean;
  aiWaiting: number;
};

let summary: Ref<Summary | null>;
const refreshed: string[] = [];

beforeEach(() => {
  summary = ref({ aiEnabled: true, aiModelReady: true, aiWaiting: 3 });
  refreshed.length = 0;
  vi.stubGlobal('computed', computed);
  vi.stubGlobal('useNuxtData', (key: string) => {
    expect(key).toBe('admin-bar');
    return { data: summary };
  });
  vi.stubGlobal('refreshNuxtData', async (key: string) => {
    refreshed.push(key);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('what the admin knows of AI', () => {
  it('offers the model while AI is on and it answers', () => {
    expect(useAiEnabled().value).toBe(true);
    expect(useAiModelReady().value).toBe(true);
    expect(useAiWaiting().value).toBe(3);
  });

  it('offers nothing once AI is turned off on the page', () => {
    const ready = useAiModelReady();
    const waiting = useAiWaiting();
    setAiEnabled(false);
    expect(useAiEnabled().value).toBe(false);
    expect(ready.value).toBe(false);
    expect(waiting.value).toBe(0);
    // Nothing is asked about it either.
    expect(refreshed).toEqual([]);
  });

  it('reads the summary again once AI is turned on', () => {
    summary.value = { aiEnabled: false, aiModelReady: false, aiWaiting: 0 };
    setAiEnabled(true);
    expect(useAiEnabled().value).toBe(true);
    expect(refreshed).toEqual(['admin-bar']);
  });

  it('knows nothing before the summary comes', () => {
    summary.value = null;
    expect(useAiEnabled().value).toBe(false);
    expect(useAiModelReady().value).toBe(false);
    expect(useAiWaiting().value).toBe(0);
    setAiEnabled(true);
    expect(refreshed).toEqual([]);
  });
});
