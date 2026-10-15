import {
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  DEFAULT_MONTHLY_TOKENS,
  type AiModelConfig,
} from '#layers/thei/shared/ai-model';
import type { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { LanguageCode } from '#layers/thei/shared/language';
import {
  emptySiteAnalytics,
  type SiteAnalyticsSettings,
} from '#layers/thei/shared/analytics';

export interface TheiConfig {
  version: string;
  languageCode: LanguageCode;
  siteAccessLevel: SiteAccessLevel;
  /**
   * Absolute address the site is served from, without a trailing slash.
   *
   * Empty means "derive it from the request", which is right for a single
   * hostname behind a proxy that forwards `Host` and `X-Forwarded-Proto`.
   */
  siteUrl: string;
  /** Analytics and search-console identifiers, each empty when unused. */
  analytics: SiteAnalyticsSettings;
  secretPhrase: string;
  password: {
    hash: string;
    salt: string;
    iterations: number;
    fallback?: string;
  };
  /**
   * Credential the backup client authenticates with, present once one has
   * been generated. Only its SHA-256 is kept: the token itself is shown to
   * the operator once and never read back.
   */
  backup?: {
    tokenHash: string;
    createdAt: string;
  };
  /**
   * Whether AI clients may work with the site over MCP. Off, the endpoint
   * does not exist and tokens open nothing; everything else works as if
   * there were no MCP at all.
   */
  mcp: {
    enabled: boolean;
    /** The owner's own words to every AI client: how they write, what to mind. */
    instructions: string;
    /** The one model the site calls, for sessions and templates. */
    model: AiModelConfig;
    /** What that model may spend a month, in counted tokens. */
    monthlyTokens: number;
  };
}

/**
 * The part of `thei.config.json` the boot reads before the migrations run.
 *
 * Every release has written both fields since the first one, so they can be
 * read whatever shape the rest of the file is in; the whole config is loaded
 * only once the migrations have brought the file to this release's shape.
 */
export interface TheiConfigHead {
  /** Version the content was last brought to. */
  version: string;
  languageCode: string;
}

export let theiConfig: TheiConfig | undefined;
export let theiConfigHead: TheiConfigHead | undefined;

export function setTheiConfig(config: TheiConfig): void {
  theiConfig = config;
  theiConfigHead = {
    version: config.version,
    languageCode: config.languageCode,
  };
}

export function setTheiConfigHead(head: TheiConfigHead): void {
  theiConfigHead = head;
}

export function toTheiConfigHead(raw: Record<string, unknown>): TheiConfigHead {
  const problems = [...stringFields(raw, ['version', 'languageCode'])];
  if (problems.length) throw configShapeError(problems);
  return {
    version: raw.version as string,
    languageCode: raw.languageCode as string,
  };
}

/**
 * The typed config a raw `thei.config.json` stands for.
 *
 * Strict on purpose: migrations bring the file to this release's shape before
 * anything reads it whole, so a missing field is a fault to report, not an
 * older shape to fill in.
 */
export function toTheiConfig(raw: Record<string, unknown>): TheiConfig {
  const password = asRecord(raw.password);
  const analytics = asRecord(raw.analytics);
  const backup = raw.backup === undefined ? undefined : asRecord(raw.backup);
  const mcp = asRecord(raw.mcp);
  const problems = [
    ...stringFields(raw, [
      'version',
      'languageCode',
      'siteAccessLevel',
      'siteUrl',
      'secretPhrase',
    ]),
    ...(password
      ? stringFields(password, ['hash', 'salt'], 'password.').concat(
          typeof password.iterations === 'number'
            ? []
            : ['password.iterations'],
        )
      : ['password']),
    ...(analytics
      ? stringFields(analytics, Object.keys(emptySiteAnalytics), 'analytics.')
      : ['analytics']),
    ...(raw.backup === undefined
      ? []
      : backup
        ? stringFields(backup, ['tokenHash', 'createdAt'], 'backup.')
        : ['backup']),
    ...(typeof mcp?.enabled === 'boolean' ? [] : ['mcp.enabled']),
    ...(typeof mcp?.instructions === 'string' ? [] : ['mcp.instructions']),
  ];
  if (problems.length) throw configShapeError(problems);
  // The settings of the model are nothing the site needs to run: a hand
  // edit gone wrong turns the model off rather than take the site down.
  // Each field falls back on its own, so the next save of any setting
  // writes back what was sound — the API key above all.
  const model = asRecord(mcp?.model);
  const modelIssues = modelProblems(model);
  const tokensSound =
    typeof mcp?.monthlyTokens === 'number' && mcp.monthlyTokens >= 0;
  if (modelIssues.length)
    THEI_SERVER.console?.warn?.(
      `thei.config.json: ${modelIssues.join(', ')} malformed; the model is off until it is saved again.`,
    );
  if (!tokensSound)
    THEI_SERVER.console?.warn?.(
      `thei.config.json: mcp.monthlyTokens malformed; the limit is ${DEFAULT_MONTHLY_TOKENS} until it is saved again.`,
    );
  const modelText = (field: 'apiKey' | 'baseUrl' | 'model') =>
    typeof model?.[field] === 'string'
      ? (model[field] as string)
      : DEFAULT_AI_MODEL[field];

  return {
    version: raw.version as string,
    languageCode: raw.languageCode as LanguageCode,
    siteAccessLevel: raw.siteAccessLevel as SiteAccessLevel,
    siteUrl: raw.siteUrl as string,
    analytics: analytics as unknown as SiteAnalyticsSettings,
    secretPhrase: raw.secretPhrase as string,
    password: password as unknown as TheiConfig['password'],
    ...(backup ? { backup: backup as unknown as TheiConfig['backup'] } : {}),
    mcp: {
      enabled: mcp!.enabled as boolean,
      instructions: mcp!.instructions as string,
      model: {
        provider: modelIssues.length
          ? 'none'
          : (model!.provider as AiModelConfig['provider']),
        apiKey: modelText('apiKey'),
        baseUrl: modelText('baseUrl'),
        model: modelText('model'),
      },
      monthlyTokens: tokensSound
        ? (mcp!.monthlyTokens as number)
        : DEFAULT_MONTHLY_TOKENS,
    },
  };
}

/** What is wrong with the model's settings, field by field. */
function modelProblems(model: Record<string, unknown> | undefined) {
  if (!model) return ['mcp.model'];
  return [
    ...(['apiKey', 'baseUrl', 'model'] as const)
      .filter((field) => typeof model[field] !== 'string')
      .map((field) => `mcp.model.${field}`),
    ...((AI_PROVIDERS as readonly unknown[]).includes(model.provider)
      ? []
      : ['mcp.model.provider']),
  ];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringFields(
  record: Record<string, unknown>,
  fields: string[],
  prefix = '',
): string[] {
  return fields
    .filter((field) => typeof record[field] !== 'string')
    .map((field) => `${prefix}${field}`);
}

function configShapeError(problems: string[]): Error {
  return new Error(
    `thei.config.json is missing or has malformed fields: ${problems.join(', ')}.`,
  );
}
