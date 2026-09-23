export default defineEventHandler(async () => {
  const projectCount = await THEI_SERVER.projects.count();
  const eventCount = await THEI_SERVER.events.count();
  const diaryCount = await THEI_SERVER.diary.count();

  return {
    projectCount,
    eventCount,
    diaryCount,
  };
});
