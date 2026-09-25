import type {
  ContentFieldModelValue,
  PublicContentOutputData,
} from './content';
import type { SiteAnalyticsSettings } from './analytics';
import type {
  ExternalLinkListItem,
  ProjectExternalLink,
} from './external-link';
import type { MediaDescriptor } from './media';
import type {
  PublicEntitySummary,
  PublicEntityReference,
  PublicSecretReference,
  PublicTagListItem,
} from './api/public';
import type { SiteAccessLevel } from './access-level';
import type { LanguageCode } from './language';
import type { StatusEditData, StatusHistoryItem } from './status';

export const PROFILE_ID = 'profile';
export interface ProfileFact {
  id: string;
  name: string;
  value: string;
}
export interface ProfileHistoryItemBase {
  id: string;
  createdAt: number;
}
export interface ProfileAvatarHistoryItem extends ProfileHistoryItemBase {
  assetUuid?: string;
  media?: MediaDescriptor;
}
export interface ProfileHistoryPage<T extends ProfileHistoryItemBase> {
  items: T[];
  total: number;
  nextCursor?: string;
}
export interface ProfileEditData extends StatusEditData {
  displayName: string;
  slogan: string;
  nickname: string;
  birthDate: string;
  avatarAssetUuid: string | null;
  avatarChangeId: string;
  bannerAssetUuid: string | null;
  faviconAssetUuid: string | null;
  aboutContent: ContentFieldModelValue | null;
  facts: ProfileFact[];
  pinnedPageUuids: string[];
  externalLinks: ExternalLinkListItem[];
  deletedAvatarIds: string[];
}
export interface ProfilePageLink {
  pageUuid: string;
  title: string;
  href: string;
  media?: MediaDescriptor;
}
export interface AdminProfileResponse {
  data: ProfileEditData;
  avatarMedia: MediaDescriptor;
  bannerMedia?: MediaDescriptor;
  faviconMedia?: MediaDescriptor;
  currentAvatar?: ProfileAvatarHistoryItem;
  avatars: ProfileHistoryPage<ProfileAvatarHistoryItem>;
  statuses: ProfileHistoryPage<StatusHistoryItem>;
  pinnedPages: ProfilePageLink[];
}
export interface PublicProfileResponse {
  displayName: string;
  slogan: string;
  /** The slogan and the visitor-visible "About me" text, snippet-sized. */
  seoDescription: string;
  nickname: string;
  birthDate: string;
  facts: ProfileFact[];
  avatarMedia: MediaDescriptor;
  bannerMedia?: MediaDescriptor;
  faviconMedia?: MediaDescriptor;
  avatarCount: number;
  currentStatus?: StatusHistoryItem;
  statusCount: number;
  aboutContent?: PublicContentOutputData;
  pinnedPages: ProfilePageLink[];
  externalLinks: ProjectExternalLink[];
  showcaseProjects: PublicEntityReference[];
  projects: {
    count: number;
    items: (PublicEntitySummary | PublicSecretReference)[];
  };
  events: {
    count: number;
    items: (PublicEntitySummary | PublicSecretReference)[];
  };
  tags: PublicTagListItem[];
}
/** What the head needs to link the site icon. */
export interface SiteFaviconInfo {
  /** Changes with the icon's bytes, so caches pick up a replacement. */
  version: string;
  iconExtension: 'svg' | 'png';
}

export interface SiteSettingsData {
  languageCode: LanguageCode;
  siteAccessLevel: SiteAccessLevel;
  /** Empty means "derive the address from the request". */
  siteUrl: string;
  analytics: SiteAnalyticsSettings;
  secretPhrase: string;
  password: string;
}
export function profileAge(
  birthDate: string,
  now = new Date(),
): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return undefined;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (
    Number.isNaN(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== birthDate ||
    birth > now
  )
    return undefined;
  return (
    now.getUTCFullYear() -
    birth.getUTCFullYear() -
    (now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate())
      ? 1
      : 0)
  );
}
