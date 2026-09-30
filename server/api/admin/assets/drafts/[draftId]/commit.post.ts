import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import type { AssetSelectionConstraints } from '#layers/thei/shared/asset-library';
import { isLongCommit } from '#layers/thei/shared/asset-upload-settings';
import { commitDraft, useDraft } from '../../../../../thei/assets/drafts';
import {
  isUploadJobRunning,
  startUploadJob,
} from '../../../../../thei/assets/jobs';
import { parseSelectionConstraints } from '../../../../../thei/assets/library-query';
import {
  clearAssetUploadProgress,
  uploadStatusReporter,
} from '../../../../../thei/assets/progress';
import { requestAbortSignal } from '../../../../../thei/assets/request-signal';
import { assertAssetSelection } from '../../../../../thei/assets/selection';
import { parseAssetUploadSettings } from '../../../../../thei/assets/upload-request';

interface CommitDraftRequest extends AssetSelectionConstraints {
  settings?: unknown;
  uploadId?: string;
}

/** A commit that runs as a job answers with the id to poll and cancel by. */
export interface CommitDraftAccepted {
  uploadId: string;
}

/**
 * Stores a result made from a draft as a variant in the library.
 *
 * A quick result — a picture, usually a render the editor already judged —
 * is stored within the request. A video encode or a zip runs as a job under
 * the client's `uploadId` and is answered with `202` at once: it is followed
 * at `GET /api/admin/uploads/:id` and stopped with `DELETE` there, and no
 * connection has to stay open for the minutes it takes.
 */
export default defineEventHandler(
  async (event): Promise<AssetUploadResponse | CommitDraftAccepted> => {
    const session = useDraft(getRouterParam(event, 'draftId'));
    const body = await readBody<CommitDraftRequest>(event);
    const settings = parseAssetUploadSettings(JSON.stringify(body?.settings));
    const constraints = parseSelectionConstraints({ ...body });
    const uploadId = body?.uploadId;

    if (uploadId && isLongCommit(settings)) {
      // One long result at a time per draft: a second request while it
      // runs is a repeat, not another variant.
      if (session.job && isUploadJobRunning(session.job)) {
        throw createError({
          statusCode: 409,
          message: 'This draft is already being stored',
        });
      }
      session.job = uploadId;
      startUploadJob(uploadId, async (signal, report) => {
        const result = await commitDraft(session, settings, {
          signal,
          onStatus: report,
        });
        assertAssetSelection(result, constraints);
        return result;
      });
      setResponseStatus(event, 202);
      return { uploadId };
    }

    const signal = requestAbortSignal(event);
    try {
      const result = await commitDraft(session, settings, {
        signal,
        onStatus: uploadStatusReporter(uploadId),
      });
      assertAssetSelection(result, constraints);
      return result;
    } finally {
      clearAssetUploadProgress(uploadId);
    }
  },
);
