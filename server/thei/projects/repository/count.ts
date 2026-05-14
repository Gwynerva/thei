export async function countProjects() {
  const { db, schema } = THEI_SERVER.useDb();
  return db.$count(schema.projects);
}
