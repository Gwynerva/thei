import {
  findDraftRender,
  useDraft,
} from '../../../../../../thei/assets/drafts';
import { sendAssetFile } from '../../../../../../thei/assets/send-file';

/**
 * The bytes of a dry run, for the editor's comparison view.
 *
 * Never cached: the same address names a different encode as soon as the
 * draft is gone and another one takes its place.
 */
export default defineEventHandler(async (event) => {
  const session = useDraft(getRouterParam(event, 'draftId'));
  const render = findDraftRender(
    session,
    getRouterParam(event, 'renderId') ?? '',
  );
  if (!render) {
    throw createError({ statusCode: 404, message: 'Render not found' });
  }
  return await sendAssetFile(event, render.path, render.extension, {
    cacheControl: 'no-store',
  });
});
