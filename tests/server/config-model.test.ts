import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MONTHLY_TOKENS } from '../../shared/ai-model';
import { emptySiteAnalytics } from '../../shared/analytics';
import { toTheiConfig } from '../../server/thei/config';
import {
  draftModelConfig,
  savedModelConfig,
} from '../../server/thei/ai/model/admin';

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

describe('the key of the model', () => {
  const OPENAI = {
    provider: 'openai' as const,
    apiKey: 'sk-openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-x',
  };
  const saved = (model: typeof OPENAI | typeof MODEL) =>
    Object.assign(globalThis.THEI_SERVER, {
      config: { mcp: { model } },
    });

  it('goes with the page’s settings to its own service alone', () => {
    saved(OPENAI);
    expect(
      draftModelConfig({ provider: 'openai', baseUrl: OPENAI.baseUrl }).apiKey,
    ).toBe('sk-openai');
    expect(
      draftModelConfig({
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1/',
      }).apiKey,
    ).toBe('sk-openai');
    // Another service chosen on the page is asked with no key …
    expect(
      draftModelConfig({
        provider: 'openai',
        baseUrl: 'https://openrouter.ai/api/v1',
      }).apiKey,
    ).toBe('');
    expect(
      draftModelConfig({ provider: 'anthropic', baseUrl: '' }).apiKey,
    ).toBe('');
    // … unless one is typed for it.
    expect(
      draftModelConfig({
        provider: 'anthropic',
        baseUrl: '',
        apiKey: 'sk-ant-new',
      }).apiKey,
    ).toBe('sk-ant-new');
  });

  it('is dropped when the settings move to another service', () => {
    expect(savedModelConfig(OPENAI, { model: 'gpt-y' }).apiKey).toBe(
      'sk-openai',
    );
    expect(
      savedModelConfig(OPENAI, { baseUrl: 'https://api.x.ai/v1' }).apiKey,
    ).toBe('');
    expect(
      savedModelConfig(OPENAI, { provider: 'anthropic', baseUrl: '' }).apiKey,
    ).toBe('');
    expect(
      savedModelConfig(OPENAI, { baseUrl: 'https://api.x.ai/v1', apiKey: 'k' })
        .apiKey,
    ).toBe('k');
    // Turned off and on again at the same service, the key stays.
    const off = savedModelConfig(OPENAI, { provider: 'none' });
    expect(off.apiKey).toBe('sk-openai');
    expect(savedModelConfig(off, { provider: 'openai' }).apiKey).toBe(
      'sk-openai',
    );
    expect(
      savedModelConfig(off, { provider: 'anthropic', baseUrl: '' }).apiKey,
    ).toBe('');
  });
});
