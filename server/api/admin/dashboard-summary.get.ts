import { sessionModel } from '../../thei/ai/model/settings';
import { aiWaiting } from '../../thei/ai/sessions/view';

export default defineEventHandler(async () => {
  const projectCount = await THEI_SERVER.projects.count();
  const eventCount = await THEI_SERVER.events.count();
  const diaryCount = await THEI_SERVER.diary.count();
  const aiEnabled = THEI_SERVER.config.mcp.enabled;

  return {
    projectCount,
    eventCount,
    diaryCount,
    // Whether anything about AI is shown: with it off, the admin pages ask
    // nothing about it.
    aiEnabled,
    // Whether the site's own model answers: a ✦ that asks it is shown only
    // then.
    aiModelReady: aiEnabled && Boolean(sessionModel()),
    // What waits for the owner in sessions: actions and questions.
    aiWaiting: aiEnabled ? aiWaiting() : 0,
  };
});
