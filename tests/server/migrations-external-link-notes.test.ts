import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import externalLinkNotes from '../../update/migrations/0.0.3-external-link-notes';

let rawDb: Database.Database | undefined;
afterEach(() => rawDb?.close());

/** The link tables as 0.0.2 left them, foreign keys on as at boot. */
function legacyDb() {
  rawDb = new Database(':memory:');
  rawDb.pragma('foreign_keys = ON');
  rawDb.exec(`
    CREATE TABLE projects (projectUuid text PRIMARY KEY NOT NULL);
    CREATE TABLE events (eventUuid text PRIMARY KEY NOT NULL);
    CREATE TABLE "external-links" (
      url text PRIMARY KEY NOT NULL,
      title text,
      description text,
      faviconKey text NOT NULL,
      accent text,
      status text DEFAULT 'complete' NOT NULL,
      touchedAt integer NOT NULL
    );
    CREATE TABLE "project-external-links" (
      projectUuid text NOT NULL,
      url text NOT NULL,
      name text NOT NULL,
      sortOrder integer NOT NULL,
      isPrivate integer DEFAULT false NOT NULL,
      PRIMARY KEY(projectUuid, url),
      FOREIGN KEY (projectUuid) REFERENCES projects(projectUuid) ON DELETE cascade,
      FOREIGN KEY (url) REFERENCES "external-links"(url)
    );
    CREATE INDEX "project-external-links-project-idx"
      ON "project-external-links" (projectUuid, sortOrder);
    CREATE TABLE "event-external-links" (
      eventUuid text NOT NULL,
      url text NOT NULL,
      name text NOT NULL,
      sortOrder integer NOT NULL,
      isPrivate integer DEFAULT false NOT NULL,
      PRIMARY KEY(eventUuid, url),
      FOREIGN KEY (eventUuid) REFERENCES events(eventUuid) ON DELETE cascade,
      FOREIGN KEY (url) REFERENCES "external-links"(url)
    );
    CREATE TABLE "profile-external-links" (
      url text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      isPrivate integer DEFAULT false NOT NULL,
      sortOrder integer NOT NULL
    );
    INSERT INTO projects VALUES ('p-1');
    INSERT INTO events VALUES ('e-1');
  `);
  return rawDb;
}

function site(db: Database.Database, url: string, title: string | null) {
  db.prepare(
    'INSERT INTO "external-links" (url, title, faviconKey, touchedAt) VALUES (?, ?, ?, 0)',
  ).run(url, title, 'key');
}

function listed(
  db: Database.Database,
  table: string,
  owner: string,
  url: string,
  name: string,
  sortOrder = 0,
) {
  db.prepare(`INSERT INTO "${table}" VALUES (?, ?, ?, ?, false)`).run(
    owner,
    url,
    name,
    sortOrder,
  );
}

describe('external link notes migration', () => {
  it("keeps a name of the owner's own as the note and drops one the form filled in", () => {
    const db = legacyDb();
    site(db, 'https://own.example/', 'Own Example');
    site(db, 'https://titled.example/', 'The  Site   Title');
    site(db, 'https://www.host.example/', null);
    site(db, 'https://blank.example/', 'Blank');
    listed(
      db,
      'project-external-links',
      'p-1',
      'https://own.example/',
      ' Why this matters ',
    );
    listed(
      db,
      'project-external-links',
      'p-1',
      'https://titled.example/',
      'The Site Title',
      1,
    );
    listed(
      db,
      'project-external-links',
      'p-1',
      'https://www.host.example/',
      'Host.Example',
      2,
    );
    listed(
      db,
      'event-external-links',
      'e-1',
      'https://blank.example/',
      'Program of the day',
    );
    db.prepare(
      'INSERT INTO "profile-external-links" VALUES (?, ?, false, 0)',
    ).run('https://own.example/', 'GitHub');

    externalLinkNotes.up({ rawDb: db } as never);

    expect(
      db
        .prepare(
          'SELECT url, note FROM "project-external-links" ORDER BY sortOrder',
        )
        .all(),
    ).toEqual([
      { url: 'https://own.example/', note: 'Why this matters' },
      { url: 'https://titled.example/', note: '' },
      { url: 'https://www.host.example/', note: '' },
    ]);
    expect(
      db.prepare('SELECT url, note FROM "event-external-links"').all(),
    ).toEqual([{ url: 'https://blank.example/', note: 'Program of the day' }]);
    expect(
      db.prepare('SELECT url, name, note FROM "profile-external-links"').all(),
    ).toEqual([{ url: 'https://own.example/', name: 'GitHub', note: '' }]);
  });

  it('drops the name column of projects and events only', () => {
    const db = legacyDb();
    externalLinkNotes.up({ rawDb: db } as never);
    const columns = (table: string) =>
      (db.pragma(`table_info("${table}")`) as { name: string }[]).map(
        (column) => column.name,
      );
    expect(columns('project-external-links')).not.toContain('name');
    expect(columns('event-external-links')).not.toContain('name');
    expect(columns('profile-external-links')).toEqual([
      'url',
      'name',
      'isPrivate',
      'sortOrder',
      'note',
    ]);
  });
});
