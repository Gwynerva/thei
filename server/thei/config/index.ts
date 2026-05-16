import type { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { LanguageCode } from '#layers/thei/shared/language';

export interface TheiConfig {
  version: string;
  languageCode: LanguageCode;
  siteAccessLevel: SiteAccessLevel;
  displayName: string;
  secretPhrase: string;
  password: {
    hash: string;
    salt: string;
    iterations: number;
    fallback?: string;
  };
}

export let theiConfig: TheiConfig | undefined;

export function setTheiConfig(config: TheiConfig): void {
  theiConfig = config;
}
