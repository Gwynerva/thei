import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import type { AssetSelectionConstraints } from '#layers/thei/shared/asset-library';
import { commitDraft, useDraft } from '../../../../../thei/assets/drafts';
import { parseSelectionConstraints } from '../../../../../thei/assets/library-query';
import {
  clearAssetUploadProgress,
  setAssetUploadProgress,
} from '../../../../../thei/assets/progress';
import { requestAbortSignal } from '../../../../../thei/assets/request-signal';
import { assertAssetSelection } from '../../../../../thei/assets/selection';
import { parseAssetUploadSettings } from '../../../../../thei/assets/upload-request';

interface CommitDraftRequest extends AssetSelectionConstraints {
  settings?: unknown;
  uploadId?: string;
}

/** Stores a result made from a draft as a variant in the library. */
export default defineEventHandler(
  async (event): Promise<AssetUploadResponse> => {
    const signal = requestAbortSignal(event);
    const session = useDraft(getRouterParam(event, 'draftId'));
    const body = await readBody<CommitDraftRequest>(event);
    const settings = parseAssetUploadSettings(JSON.stringify(body?.settings));
    const constraints = parseSelectionConstraints({ ...body });

    try {
      const result = await commitDraft(session, settings, {
        signal,
        onQueued: () =>
          setAssetUploadProgress(body?.uploadId, { phase: 'queued' }),
        onProgress: (progress) =>
          setAssetUploadProgress(body?.uploadId, {
            phase: 'processing',
            progress,
          }),
      });
      assertAssetSelection(result, constraints);
      return result;
    } finally {
      clearAssetUploadProgress(body?.uploadId);
    }
  },
);
