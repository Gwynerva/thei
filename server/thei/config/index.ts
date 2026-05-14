import type { LanguageCode } from '#layers/thei/shared/language';

export interface TheiConfig {
  languageCode: LanguageCode;
  globalOpenAccess: boolean;
  displayName: string;
  authPath: string;
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
