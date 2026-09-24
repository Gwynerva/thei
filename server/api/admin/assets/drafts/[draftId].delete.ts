import { closeDraft } from '../../../../thei/assets/drafts';

/** Closes a draft the editor is done with and frees its scratch files. */
export default defineEventHandler(async (event) => {
  const draftId = getRouterParam(event, 'draftId');
  if (draftId) await closeDraft(draftId);
  setResponseStatus(event, 204);
  return null;
});
