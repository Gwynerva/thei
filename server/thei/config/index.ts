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
  const problems = [
    ...stringFields(raw, ['version', 'languageCode']),
  ];
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
      ? stringFields(
          analytics,
          Object.keys(emptySiteAnalytics),
          'analytics.',
        )
      : ['analytics']),
    ...(raw.backup === undefined
      ? []
      : backup
        ? stringFields(backup, ['tokenHash', 'createdAt'], 'backup.')
        : ['backup']),
  ];
  if (problems.length) throw configShapeError(problems);

  return {
    version: raw.version as string,
    languageCode: raw.languageCode as LanguageCode,
    siteAccessLevel: raw.siteAccessLevel as SiteAccessLevel,
    siteUrl: raw.siteUrl as string,
    analytics: analytics as unknown as SiteAnalyticsSettings,
    secretPhrase: raw.secretPhrase as string,
    password: password as unknown as TheiConfig['password'],
    ...(backup ? { backup: backup as unknown as TheiConfig['backup'] } : {}),
  };
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
