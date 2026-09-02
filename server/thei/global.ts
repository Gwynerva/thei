import { getCookie, type H3Event } from 'h3';
import { sn } from 'unslash';
import { version } from '#thei/static-public';
import { projectPath, theiPath } from '#thei/static';
import { bootResult as _bootResult } from './boot/result';
import { makeLogger, tag } from './logger';
import { currentLanguage, getCurrentLanguagePhrases } from './language';
import { theiConfig } from './config/index';
import { getTheiDbContext } from './db/global';
import { countProjects } from './projects/repository/count';
import { findProjectByPublicId } from './projects/repository/find-by-public-id';
import { findProjectByUuid } from './projects/repository/find-by-id';
import { createProject } from './projects/repository/create';
import { updateProject } from './projects/repository/update';
import { deleteProject } from './projects/repository/delete';
import { listProjects } from './projects/repository/list';
import { countEvents } from './events/repository/count';
import { findEventByUuid } from './events/repository/find-by-id';
import { findEventByPublicId } from './events/repository/find-by-public-id';
import { listEvents } from './events/repository/list';
import { countPages } from './pages/repository/count';
import { findPageByUuid } from './pages/repository/find-by-id';
import { findPageBySlug } from './pages/repository/find-by-slug';
import { listPages } from './pages/repository/list';
import { getPublicAdminSessions } from './admin-session/repository/public';
import { getCurrentAdminSession } from './admin-session';
import { createAsset } from './assets/repository/create';
import { updateAsset } from './assets/repository/update';
import { touchAsset } from './assets/repository/touch';
import { findAssetByIdentity } from './assets/repository/find-by-identity';
import { findAssetsByFamilyUuid } from './assets/repository/find-by-family';
import { countAssetPlacements } from './assets/repository/usage-count';
import { findAssetBySlug } from './assets/repository/find-by-slug';
import { findAssetByUuid } from './assets/repository/find-by-uuid';
import { findOrphanedAssets } from './assets/repository/find-orphaned';
import { attachAssetUsage } from './assets/repository/usages/attach';
import { detachAssetUsage } from './assets/repository/usages/detach';
import { findAssetsByContainer } from './assets/repository/usages/find-by-container';
import { findAssetUsage } from './assets/repository/usages/find-one';
import { findAssetsByContainerTypeAndRole } from './assets/repository/usages/find-by-container-type-and-role';
import { findShowcaseAssets } from './assets/repository/usages/find-showcase';
import { findOtherAssets } from './assets/repository/usages/find-other';
import { findOtherAssetsForContainer } from './assets/repository/usages/find-other';
import { updateAssetUsage } from './assets/repository/usages/update';
import { deleteAsset } from './assets/repository/delete';
import { assetFilePath } from './assets/file-path';
import {
  buildContentFieldValue,
  findContentByOwner,
  prepareContentForSave,
} from './content/repository';
import {
  publicViewCookieName,
  resolveRequestAdminRole,
} from '../../shared/public-view';

export const THEI_SERVER = {
  version,
  theiPath(...parts: string[]) {
    return sn(theiPath, ...parts);
  },
  projectPath(...parts: string[]) {
    return sn(projectPath, ...parts);
  },
  contentPath(...parts: string[]) {
    return sn(projectPath, 'content', ...parts);
  },
  get language() {
    return currentLanguage!;
  },
  get config() {
    return theiConfig!;
  },
  useDb() {
    return getTheiDbContext();
  },
  get phrase() {
    return getCurrentLanguagePhrases();
  },
  async getAdmin(event: H3Event) {
    return await getCurrentAdminSession(event);
  },
  async isAuthenticatedAdmin(event: H3Event) {
    if (typeof event.context.isAuthenticatedAdmin === 'boolean') {
      return event.context.isAuthenticatedAdmin;
    }
    const session = await getCurrentAdminSession(event);
    return Boolean(session);
  },
  async isAdmin(event: H3Event) {
    if (typeof event.context.isAdmin === 'boolean') {
      return event.context.isAdmin;
    }
    const isAuthenticatedAdmin = await this.isAuthenticatedAdmin(event);
    const path = (event.node.req.url || '/').split('?')[0] || '/';
    return resolveRequestAdminRole({
      isAuthenticatedAdmin,
      path,
      publicViewCookie: getCookie(event, publicViewCookieName),
    });
  },
  console: {
    ...makeLogger(),
    tag,
  },
  projects: {
    count: countProjects,
    findByPublicId: findProjectByPublicId,
    findByUuid: findProjectByUuid,
    create: createProject,
    update: updateProject,
    delete: deleteProject,
    list: listProjects,
  },
  events: {
    count: countEvents,
    findByUuid: findEventByUuid,
    findByPublicId: findEventByPublicId,
    list: listEvents,
  },
  pages: {
    count: countPages,
    findByUuid: findPageByUuid,
    findBySlug: findPageBySlug,
    list: listPages,
  },
  adminSessions: {
    getPublic: getPublicAdminSessions,
  },
  content: {
    findByOwner: findContentByOwner,
    buildFieldValue: buildContentFieldValue,
    prepareForSave: prepareContentForSave,
  },
  assets: {
    filePath: assetFilePath,
    create: createAsset,
    update: updateAsset,
    findByUuid: findAssetByUuid,
    findByIdentity: findAssetByIdentity,
    findByFamilyUuid: findAssetsByFamilyUuid,
    countPlacements: countAssetPlacements,
    findBySlug: findAssetBySlug,
    touch: touchAsset,
    findOrphaned: findOrphanedAssets,
    delete: deleteAsset,
    usages: {
      attach: attachAssetUsage,
      detach: detachAssetUsage,
      findByContainer: findAssetsByContainer,
      findOne: findAssetUsage,
      findByContainerTypeAndRole: findAssetsByContainerTypeAndRole,
      findShowcase: findShowcaseAssets,
      findOther: findOtherAssets,
      findOtherForContainer: findOtherAssetsForContainer,
      update: updateAssetUsage,
    },
  },
};
