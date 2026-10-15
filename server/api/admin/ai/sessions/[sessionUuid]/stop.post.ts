import { requireAiOn } from '../../../../../thei/ai-on';
import { stopTurn } from '../../../../../thei/ai/runner/queue';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/** Stops the model mid-answer: what it wrote stays, with a note. */
export default defineEventHandler((event) => {
  requireAiOn();
  markReadOnlyRequest(event);
  return { stopped: stopTurn(getRouterParam(event, 'sessionUuid') ?? '') };
});
