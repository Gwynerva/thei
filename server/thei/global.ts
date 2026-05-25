import { H3Event } from 'h3';
import { sn } from 'unslash';
import { version } from '#thei/static-public';
import { projectPath, theiPath } from '#thei/static';
import { bootResult as _bootResult } from './boot/result';
import { makeLogger, tag } from './logger';
import { currentLanguage, getCurrentLanguagePhrases } from './language';
import { theiConfig } from './config/index';
import { getTheiDbContext } from './db/global';
import { countProjects } from './projects/repository/count';
import { findProjectBySlug } from './projects/repository/find-by-slug';
import { findProjectByUuid } from './projects/repository/find-by-id';
import { createProject } from './projects/repository/create';
import { updateProject } from './projects/repository/update';
import { deleteProject } from './projects/repository/delete';
import { listProjects } from './projects/repository/list';
import { countEvents } from './events/repository/count';
import { getPublicAdminSessions } from './admin-session/repository/public';
import { getCurrentAdminSession } from './admin-session';
import { createAsset } from './assets/repository/create';
import { touchAsset } from './assets/repository/touch';
import { findAssetByHash } from './assets/repository/find-by-hash';
import { findAssetBySlug } from './assets/repository/find-by-slug';
import { findAssetByUuid } from './assets/repository/find-by-uuid';
import { findOrphanedAssets } from './assets/repository/find-orphaned';
import { attachAssetUsage } from './assets/repository/usages/attach';
import { detachAssetUsage } from './assets/repository/usages/detach';
import { findAssetsByContainer } from './assets/repository/usages/find-by-container';
import { findAssetUsage } from './assets/repository/usages/find-one';
import { findAssetsByContainerTypeAndRole } from './assets/repository/usages/find-by-container-type-and-role';
import { deleteAsset } from './assets/repository/delete';
import { processAsset } from './assets/process';
import { assetFilePath } from './assets/file-path';

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
  async isAdmin(event: H3Event) {
    const session = await getCurrentAdminSession(event);
    return Boolean(session);
  },
  console: {
    ...makeLogger(),
    tag,
  },
  projects: {
    count: countProjects,
    findBySlug: findProjectBySlug,
    findByUuid: findProjectByUuid,
    create: createProject,
    update: updateProject,
    delete: deleteProject,
    list: listProjects,
  },
  events: {
    count: countEvents,
  },
  adminSessions: {
    getPublic: getPublicAdminSessions,
  },
  assets: {
    filePath: assetFilePath,
    create: createAsset,
    findByUuid: findAssetByUuid,
    findByHash: findAssetByHash,
    findBySlug: findAssetBySlug,
    touch: touchAsset,
    findOrphaned: findOrphanedAssets,
    delete: deleteAsset,
    process: processAsset,
    usages: {
      attach: attachAssetUsage,
      detach: detachAssetUsage,
      findByContainer: findAssetsByContainer,
      findOne: findAssetUsage,
      findByContainerTypeAndRole: findAssetsByContainerTypeAndRole,
    },
  },
};
