import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MONTHLY_TOKENS } from '../../shared/ai-model';
import { emptySiteAnalytics } from '../../shared/analytics';
import { toTheiConfig } from '../../server/thei/config';

/**
 * The model's settings read from a config a hand edit spoilt: the site runs
 * on, the model turns off, and every field that was sound — the API key
 * above all — is read as it was, so the next save of any setting keeps it.
 */
const warn = vi.fn();

beforeEach(() => {
  warn.mockReset();
  Object.assign(globalThis, { THEI_SERVER: { console: { warn } } });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'THEI_SERVER');
});

function raw(mcp: Record<string, unknown>) {
  return {
    version: '0.0.6',
    languageCode: 'en',
    siteAccessLevel: 'public',
    siteUrl: 'http://localhost:3000',
    secretPhrase: 'phrase',
    password: { hash: 'h', salt: 's', iterations: 1 },
    analytics: { ...emptySiteAnalytics },
    mcp: { enabled: true, instructions: '', ...mcp },
  };
}

const MODEL = {
  provider: 'anthropic',
  apiKey: 'sk-test',
  baseUrl: '',
  model: 'claude-sonnet-5-5',
};

describe('the model in thei.config.json', () => {
  it('reads sound settings as they are', () => {
    const config = toTheiConfig(raw({ model: MODEL, monthlyTokens: 5000 }));
    expect(config.mcp.model).toEqual(MODEL);
    expect(config.mcp.monthlyTokens).toBe(5000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the model and its key when only the limit is spoilt', () => {
    const config = toTheiConfig(raw({ model: MODEL, monthlyTokens: 'lots' }));
    expect(config.mcp.model).toEqual(MODEL);
    expect(config.mcp.monthlyTokens).toBe(DEFAULT_MONTHLY_TOKENS);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('turns the model off but keeps its key when a field is spoilt', () => {
    const config = toTheiConfig(
      raw({
        model: { ...MODEL, provider: 'someone', model: 42 },
        monthlyTokens: 5000,
      }),
    );
    expect(config.mcp.model).toEqual({
      provider: 'none',
      apiKey: 'sk-test',
      baseUrl: '',
      model: '',
    });
    expect(config.mcp.monthlyTokens).toBe(5000);
  });

  it('reads a model that is not there at all as none', () => {
    const config = toTheiConfig(raw({ model: null, monthlyTokens: 5000 }));
    expect(config.mcp.model.provider).toBe('none');
    expect(config.mcp.model.apiKey).toBe('');
  });
});
