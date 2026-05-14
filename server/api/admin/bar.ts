export default defineEventHandler(async () => {
  const projectCount = await THEI_SERVER.projects.count();
  const eventCount = await THEI_SERVER.events.count();

  return {
    projectCount,
    eventCount,
  };
});
