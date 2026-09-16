import type { SiteAccessLevel } from '../access-level';
import type { LanguageCode } from '../language';

export interface InstallData {
  languageCode: LanguageCode;
  siteAccessLevel: SiteAccessLevel;
  /** Empty means "derive the address from the request". */
  siteUrl: string;
  displayName: string;
  secretPhrase: string;
  password: string;
}
