import type { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { LanguageCode } from '#layers/thei/shared/language';

export interface TheiConfig {
  version: string;
  languageCode: LanguageCode;
  siteAccessLevel: SiteAccessLevel;
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
