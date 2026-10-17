import { readFileSync } from 'node:fs';
import { DEFAULT_AI_MODEL, type AiModelConfig } from '../../shared/ai-model';
import {
  setTheiConfig,
  theiConfig,
  type TheiConfig,
} from '../../server/thei/config/index';
import type { FakeModel } from './fake-model';
import { freshTestDb } from './fresh-db';
import { serverRepositories } from './server-repositories';

/** The engine's version, which the site's MCP server gives as its own. */
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

function silent() {
  return { log() {}, warn() {}, error() {} };
}

/** A console that says nothing, tagged or not. */
export const quietConsole = { ...silent(), tag: silent };

/**
 * The settings of a site at `https://example.test` with AI on, its model
 * the default one, no service yet, until `mcp` says otherwise.
 */
export function aiOnConfig(mcp: Partial<TheiConfig['mcp']> = {}) {
  return {
    version,
    siteUrl: 'https://example.test',
    languageCode: 'en',
    mcp: {
      enabled: true,
      instructions: '',
      model: { ...DEFAULT_AI_MODEL },
      monthlyTokens: 10_000_000,
      ...mcp,
    },
  };
}

/**
 * The model settings that send the site's turns to `model`, in the wire
 * format of `provider`. Anthropic's client finds a service of its own only
 * by `ANTHROPIC_BASE_URL`, which this sets and the test clears after.
 */
export function fakeModelSettings(
  model: FakeModel,
  provider: 'openai' | 'anthropic' = 'openai',
): AiModelConfig {
  if (provider === 'anthropic') process.env.ANTHROPIC_BASE_URL = model.url;
  return {
    provider,
    apiKey: provider === 'anthropic' ? 'sk-test' : '',
    baseUrl: provider === 'openai' ? model.url : '',
    model: 'fake-small',
  };
}

/**
 * A fresh database behind the server's global as the AI's code reads it:
 * AI on (`aiOnConfig`), the admin's own reads and saves, which an editor's
 * changes go through, a quiet console, and the site at the root of its host.
 * `server` adds to the global or replaces a part of it.
 */
export async function freshAiTestDb(server: Record<string, unknown> = {}) {
  const context = await freshTestDb();
  Object.assign(context.server, {
    version,
    config: aiOnConfig(),
    console: quietConsole,
    ...serverRepositories,
    ...server,
  });
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ app: { baseURL: '/' } }),
  });
  return context;
}

/**
 * Makes `config` the settings as the site itself holds them, so whatever a
 * test saves to them is read back at once.
 */
export function holdSiteConfig(
  server: object,
  config: ReturnType<typeof aiOnConfig>,
) {
  setTheiConfig(config as TheiConfig);
  Object.defineProperty(server, 'config', {
    configurable: true,
    get: () => theiConfig,
  });
}
