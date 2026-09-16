import type { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { LanguageCode } from '#layers/thei/shared/language';

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
