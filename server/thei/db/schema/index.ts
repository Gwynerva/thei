import { assets } from './assets';
import { backups } from './backups';
import {
  profiles,
  profileAvatars,
  profilePinnedPages,
  profileExternalLinks,
} from './profile';
import { statuses } from './statuses';
import { assetUsages } from './asset-usages';
import { content } from './content';
import { contentHistory } from './content-history';
import { contentAnchors } from './content-anchors';
import { events } from './events';
import { diaryEntries } from './diary-entries';
import { projects } from './projects';
import { pages } from './pages';
import { adminSessions } from './admin-sessions';
import { shareLinks, signInLinks } from './access-links';
import { projectContentSections } from './project-content-sections';
import { periods } from './periods';
import { entityRelations } from './entity-relations';
import { tags } from './tags';
import { tagUsages } from './tag-usages';
import { externalLinks } from './external-links';
import { projectExternalLinks } from './project-external-links';
import { eventExternalLinks } from './event-external-links';
import { apiTokens } from './api-tokens';
import { oauthAuthorizations, oauthClients } from './oauth';
import {
  aiActions,
  aiDigests,
  aiMemory,
  aiMessages,
  aiSessionEntities,
  aiSessions,
  aiTemplateBatches,
  aiTemplateCoverage,
  aiTemplates,
  aiTerms,
  aiUsage,
} from './ai';

export const schema = {
  profiles,
  profileAvatars,
  profilePinnedPages,
  profileExternalLinks,
  statuses,
  assets,
  assetUsages,
  backups,
  content,
  contentHistory,
  contentAnchors,
  events,
  diaryEntries,
  projects,
  pages,
  adminSessions,
  signInLinks,
  shareLinks,
  projectContentSections,
  periods,
  entityRelations,
  tags,
  tagUsages,
  externalLinks,
  projectExternalLinks,
  eventExternalLinks,
  apiTokens,
  oauthClients,
  oauthAuthorizations,
  aiUsage,
  aiSessions,
  aiMessages,
  aiActions,
  aiSessionEntities,
  aiMemory,
  aiTerms,
  aiDigests,
  aiTemplates,
  aiTemplateCoverage,
  aiTemplateBatches,
};
