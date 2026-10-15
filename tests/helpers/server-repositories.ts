import { findProjectByPublicId } from '../../server/thei/projects/repository/find-by-public-id';
import { findProjectByUuid } from '../../server/thei/projects/repository/find-by-id';
import { findEventByUuid } from '../../server/thei/events/repository/find-by-id';
import { findEventByPublicId } from '../../server/thei/events/repository/find-by-public-id';
import { findDiaryEntryByUuid } from '../../server/thei/diary/repository/find-by-uuid';
import { findDiaryEntryByDate } from '../../server/thei/diary/repository/find-by-date';
import { findPageByUuid } from '../../server/thei/pages/repository/find-by-id';
import { findPageBySlug } from '../../server/thei/pages/repository/find-by-slug';
import { findAssetByUuid } from '../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../server/thei/assets/repository/touch';
import { attachAssetUsage } from '../../server/thei/assets/repository/usages/attach';
import { detachAssetUsage } from '../../server/thei/assets/repository/usages/detach';
import { findAssetsByContainer } from '../../server/thei/assets/repository/usages/find-by-container';
import { findAssetUsage } from '../../server/thei/assets/repository/usages/find-one';
import {
  findOtherAssets,
  findOtherAssetsForContainer,
} from '../../server/thei/assets/repository/usages/find-other';
import { findShowcaseAssets } from '../../server/thei/assets/repository/usages/find-showcase';
import { updateAssetUsage } from '../../server/thei/assets/repository/usages/update';
import { assetFilePath } from '../../server/thei/assets/file-path';
import {
  buildContentFieldValue,
  buildContentPreviewMedia,
  findContentByOwner,
  prepareContentForSave,
} from '../../server/thei/content/repository';

/**
 * The parts of the server's global a test needs to run the admin's own
 * reads and saves — the ones an MCP editor token goes through — without the
 * build's virtual modules that the global itself imports.
 */
export const serverRepositories = {
  projects: {
    findByPublicId: findProjectByPublicId,
    findByUuid: findProjectByUuid,
  },
  events: {
    findByUuid: findEventByUuid,
    findByPublicId: findEventByPublicId,
  },
  diary: {
    findByUuid: findDiaryEntryByUuid,
    findByDate: findDiaryEntryByDate,
  },
  pages: {
    findByUuid: findPageByUuid,
    findBySlug: findPageBySlug,
  },
  content: {
    findByOwner: findContentByOwner,
    buildFieldValue: buildContentFieldValue,
    buildPreviewMedia: buildContentPreviewMedia,
    prepareForSave: prepareContentForSave,
  },
  assets: {
    filePath: assetFilePath,
    findByUuid: findAssetByUuid,
    touch: touchAsset,
    usages: {
      attach: attachAssetUsage,
      detach: detachAssetUsage,
      findByContainer: findAssetsByContainer,
      findOne: findAssetUsage,
      findShowcase: findShowcaseAssets,
      findOther: findOtherAssets,
      findOtherForContainer: findOtherAssetsForContainer,
      update: updateAssetUsage,
    },
  },
};
