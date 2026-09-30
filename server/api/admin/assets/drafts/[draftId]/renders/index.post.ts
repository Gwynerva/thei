import type { AssetDraftRender } from '#layers/thei/shared/api/asset-draft';
import { renderDraft, useDraft } from '../../../../../../thei/assets/drafts';
import { requestAbortSignal } from '../../../../../../thei/assets/request-signal';
import { parseAssetUploadSettings } from '../../../../../../thei/assets/upload-request';

/**
 * Encodes an image from a draft with the given settings, without storing it.
 *
 * The editor asks for this after every settled change, so the admin sees the
 * real size and the real artifacts of the exact file "Use" would store. It
 * says which renders it still wants by keeping their requests open: closing
 * one is the cancellation.
 */
export default defineEventHandler(async (event): Promise<AssetDraftRender> => {
  const signal = requestAbortSignal(event);
  const session = useDraft(getRouterParam(event, 'draftId'));
  const body = await readBody<{ settings?: unknown }>(event);
  const settings = parseAssetUploadSettings(JSON.stringify(body?.settings));
  return await renderDraft(session, settings, signal);
});
