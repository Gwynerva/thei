import type { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { LanguageCode } from '#layers/thei/shared/language';
import {
  emptySiteAnalytics,
  normalizeSiteAnalytics,
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
  /**
   * Analytics and search-console identifiers.
   *
   * Absent in the file means "nothing configured", so an instance installed
   * before analytics existed needs no migration.
   */
  analytics: SiteAnalyticsSettings;
  secretPhrase: string;
  password: {
    hash: string;
    salt: string;
    iterations: number;
    fallback?: string;
  };
  /**
   * Credential the backup client authenticates with.
   *
   * Optional and written lazily on first generation, so an instance installed
   * before backups existed keeps a valid config without a migration.
   */
  backup?: {
    token: string;
    createdAt: string;
  };
}

export let theiConfig: TheiConfig | undefined;

export function setTheiConfig(config: TheiConfig): void {
  theiConfig = config;
}

/**
 * The typed config a raw `thei.config.json` stands for.
 *
 * The file is whatever an older version of Thei last wrote, so every field
 * added since has to be filled in here rather than assumed. This is the only
 * place that knows how to read the file, and both boot paths go through it:
 * the ordinary one and the one that re-reads the file after a migration.
 */
export function toTheiConfig(raw: Record<string, unknown>): TheiConfig {
  const config = raw as unknown as TheiConfig;
  return {
    ...config,
    // Absent in the file means the same as empty: derive the address from the
    // request.
    siteUrl: config.siteUrl ?? '',
    analytics: normalizeSiteAnalytics(config.analytics) ?? emptySiteAnalytics,
  };
}
