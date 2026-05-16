import type { SiteAccessLevel } from '../access-level';
import type { LanguageCode } from '../language';

export interface InstallData {
  languageCode: LanguageCode;
  siteAccessLevel: SiteAccessLevel;
  displayName: string;
  secretPhrase: string;
  password: string;
}
