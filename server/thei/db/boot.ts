import { setTheiDbContext } from './global';
import { loadDbContext } from './utils';

export async function bootTheiDb() {
  const context = await loadDbContext();
  context.rawDb.exec(`
    CREATE TABLE IF NOT EXISTS "external-links" (
      "url" text PRIMARY KEY NOT NULL,
      "title" text,
      "description" text,
      "faviconKey" text NOT NULL,
      "accentHue" integer,
      "touchedAt" integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "project-external-links" (
      "projectUuid" text NOT NULL,
      "url" text NOT NULL,
      "name" text NOT NULL,
      "sortOrder" integer NOT NULL,
      "isPrivate" integer DEFAULT false NOT NULL,
      PRIMARY KEY("projectUuid", "url"),
      FOREIGN KEY ("projectUuid") REFERENCES "projects"("projectUuid")
        ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY ("url") REFERENCES "external-links"("url")
        ON UPDATE no action ON DELETE no action
    );
    CREATE INDEX IF NOT EXISTS "project-external-links-project-idx"
      ON "project-external-links" ("projectUuid", "sortOrder");
  `);
  const externalLinkColumns = context.rawDb
    .prepare('PRAGMA table_info("project-external-links")')
    .all() as Array<{ name: string }>;
  if (!externalLinkColumns.some((column) => column.name === 'isPrivate')) {
    context.rawDb.exec(
      'ALTER TABLE "project-external-links" ADD COLUMN "isPrivate" integer DEFAULT false NOT NULL',
    );
  }
  setTheiDbContext(context);
  THEI_SERVER.console.tag('Boot').log('Database ready!');
}
