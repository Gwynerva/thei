/**
 * The one model the site calls — for sessions and templates — as the owner
 * sets it on «Connection»: nobody, Anthropic, or any service that speaks the
 * chat completions API, a model on the owner's own machine included.
 */
export const AI_PROVIDERS = ['none', 'anthropic', 'openai'] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

/** The model, as `thei.config.json` keeps it. */
export interface AiModelConfig {
  provider: AiProvider;
  /** Kept only on the server: no page ever reads it back. */
  apiKey: string;
  /** For an OpenAI-compatible service: where its API answers. */
  baseUrl: string;
  /** Empty: the one recommended for the provider. */
  model: string;
}

export const DEFAULT_AI_MODEL: AiModelConfig = {
  provider: 'none',
  apiKey: '',
  baseUrl: '',
  model: '',
};

/**
 * Tokens the model may spend a month — a guard against a surprise bill, not
 * the bill itself, which the provider keeps. What a model reads from its
 * cache counts for a tenth: that is about what it costs.
 */
export const DEFAULT_MONTHLY_TOKENS = 10_000_000;

/**
 * The model used when the owner names none. Kept here, not in the owner's
 * config, so a site moves on with the release rather than keep an old name.
 * Another provider's models have no names Thei could know.
 */
export const RECOMMENDED_MODELS: Partial<Record<AiProvider, string>> = {
  anthropic: 'claude-sonnet-5-5',
};

/** The model the settings mean: what is named, else what is recommended. */
export function aiModelName(config: Pick<AiModelConfig, 'provider' | 'model'>) {
  return config.model.trim() || RECOMMENDED_MODELS[config.provider] || '';
}

/**
 * Services an owner may take a model from, in alphabetical order, then the
 * ones that run on the owner's own machine: the way each is spoken to and
 * where its API answers. The config keeps only those two; the page finds
 * the service again by its address, and any other address is the owner's
 * own.
 */
export interface AiService {
  id: string;
  name: string;
  provider: Exclude<AiProvider, 'none'>;
  /** Empty for Anthropic, whose SDK knows its own address. */
  baseUrl: string;
  /** Where its API keys are made; none for a model on the owner's machine. */
  keysUrl?: string;
  /** Runs on the owner's machine: no key needed. */
  local?: boolean;
}

export const AI_SERVICES: AiService[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    provider: 'anthropic',
    baseUrl: '',
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    keysUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    provider: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keysUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'groq',
    name: 'Groq',
    provider: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keysUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    provider: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    keysUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    provider: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keysUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'xai',
    name: 'xAI',
    provider: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    keysUrl: 'https://console.x.ai',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    provider: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    local: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    provider: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    local: true,
  },
];

/** The service a config speaks to, by its address; undefined for the owner's own. */
export function aiServiceOf(
  config: Pick<AiModelConfig, 'provider' | 'baseUrl'>,
): AiService | undefined {
  if (config.provider === 'anthropic')
    return AI_SERVICES.find((service) => service.id === 'anthropic');
  const address = config.baseUrl.trim().replace(/\/+$/, '');
  return AI_SERVICES.find(
    (service) => service.provider === 'openai' && service.baseUrl === address,
  );
}

/** The models a service lists, for the page to choose from. */
export interface AiModelsResponse {
  models: string[];
}

/**
 * Where the model stands, for the owner to see at a glance:
 * - `ready` — sessions and templates are answered;
 * - `off` — AI is off for the site;
 * - `none` — no provider: only apps over MCP work;
 * - `no-key`, `no-address`, `no-model` — the settings lack what it needs;
 * - `budget` — the month's limit is spent.
 */
export type AiModelStateKind =
  'ready' | 'off' | 'none' | 'no-key' | 'no-address' | 'no-model' | 'budget';

/** The model's settings as the owner's page reads them: never the key itself. */
export interface AiModelSettings extends Omit<AiModelConfig, 'apiKey'> {
  keySet: boolean;
  /** The key's last characters, to tell which one is set. */
  keyHint: string;
  monthlyTokens: number;
  /** Tokens spent this month, counted as the limit counts them. */
  usage: { month: number };
  /**
   * What an answer of the model took on average over the last month, in
   * counted tokens, or `null` before any.
   */
  averageTurn: number | null;
  state: AiModelStateKind;
}

/** How one model answered a check of the connection. */
export type AiCheckOutcome =
  'ok' | 'key' | 'model' | 'address' | 'busy' | 'error';

export interface AiCheckResponse {
  outcome: AiCheckOutcome;
  /** What the provider said, when it said something worth showing. */
  detail: string;
}
