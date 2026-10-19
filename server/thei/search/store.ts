import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { SearchAnalyzer } from '#layers/thei/shared/language/search';
import {
  searchIndexTerms,
  searchTokens,
} from '#layers/thei/shared/search/tokens';
import {
  documentFingerprint,
  placeHref,
  type SearchAudience,
  type SearchDocument,
} from './documents';
import { SEARCH_FIELDS, type SearchUnit } from './units';

/**
 * The search index: derived data in a file of its own, `.thei/search.db`.
 *
 * Everything in it is built from `thei.db`, so it stays out of backups, needs
 * no migration, and may be deleted at any time: a file of another format, or
 * one made by another reading of words, is emptied and built again.
 */
const FORMAT = 10;

/** What a term may hold for FTS5 to keep it whole. */
export function ftsTerm(term: string): string {
  return term.replace(/[^\p{L}\p{N}]/gu, '_');
}

export interface StoredCard {
  href: string;
  /**
   * What a stranger's answer names it by: its public id or address, never
   * the id it is stored by.
   */
  publicRef?: string;
  /**
   * The day it is read by when sorted, where its card has no days of its
   * own to show: when it was made, or for a file when its place was.
   */
  dated?: { by: 'added' | 'shown'; day: string };
  parent?: SearchDocument['parent'];
  shownAt?: string;
  editHref?: string;
  period?: SearchDocument['period'];
  summary?: string;
  media?: SearchDocument['media'];
  file?: SearchDocument['file'];
  access?: SearchDocument['access'];
  showcase?: boolean;
  cv?: boolean;
}

/** A file shown at a place of a document: what its own document is built from. */
export interface StoredFilePlace {
  familyUuid: string;
  assetUuid: string;
  title?: string;
  description?: string;
  caption?: string;
  href: string;
  placeTitle: string;
  /** The place alone, without what holds it: a section's own title. */
  placeName: string;
  /** The days of what shows it, which the file is sorted by. */
  sort?: SearchDocument['sort'];
  /** Not found by a stranger before this moment: the place's own day. */
  visibleFrom: number;
  media?: SearchDocument['media'];
}

export class SearchStore {
  readonly db: Database.Database;

  constructor(path: string, analyzer: SearchAnalyzer) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    const format = `${FORMAT}/${analyzer.id}`;
    if (this.readFormat() !== format) this.reset(format);
    this.analyzer = analyzer;
  }

  private readonly analyzer: SearchAnalyzer;

  private readFormat(): string | undefined {
    try {
      return (
        this.db.prepare("SELECT value FROM meta WHERE key = 'format'").get() as
          { value: string } | undefined
      )?.value;
    } catch {
      return undefined;
    }
  }

  private reset(format: string) {
    const columns = SEARCH_FIELDS.join(', ');
    const fts = (name: string) =>
      `CREATE VIRTUAL TABLE ${name} USING fts5(${columns}, content='', contentless_delete=1, tokenize="unicode61 remove_diacritics 0 tokenchars '_'")`;
    this.db.exec(`
      DROP TABLE IF EXISTS meta; DROP TABLE IF EXISTS docs; DROP TABLE IF EXISTS units;
      DROP TABLE IF EXISTS doc_tags; DROP TABLE IF EXISTS doc_years;
      DROP TABLE IF EXISTS file_places;
      DROP TABLE IF EXISTS fts_public; DROP TABLE IF EXISTS fts_owner;
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE docs (
        id INTEGER PRIMARY KEY,
        audience TEXT NOT NULL,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        title TEXT NOT NULL,
        date TEXT,
        sortFrom TEXT,
        sortTo TEXT,
        sortLife INTEGER NOT NULL DEFAULT 0,
        visibleFrom INTEGER NOT NULL,
        showcase INTEGER NOT NULL,
        cv INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        card TEXT NOT NULL
      );
      CREATE UNIQUE INDEX docs_ref ON docs (audience, ref);
      CREATE INDEX docs_kind ON docs (audience, kind, date);
      CREATE TABLE units (doc INTEGER PRIMARY KEY, data BLOB NOT NULL);
      CREATE TABLE doc_tags (doc INTEGER NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (doc, tag)) WITHOUT ROWID;
      CREATE INDEX doc_tags_tag ON doc_tags (tag);
      CREATE TABLE doc_years (doc INTEGER NOT NULL, year INTEGER NOT NULL, PRIMARY KEY (doc, year)) WITHOUT ROWID;
      CREATE INDEX doc_years_year ON doc_years (year);
      CREATE TABLE file_places (audience TEXT NOT NULL, ref TEXT NOT NULL, family TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX file_places_ref ON file_places (audience, ref);
      CREATE INDEX file_places_family ON file_places (audience, family);
      ${fts('fts_public')};
      ${fts('fts_owner')};
    `);
    this.setMeta('format', format);
    // What the old reading held goes back to the disk.
    this.db.exec('VACUUM');
    this.setMeta('generation', '0');
  }

  getMeta(key: string): string | undefined {
    return (
      this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
        { value: string } | undefined
    )?.value;
  }

  setMeta(key: string, value: string) {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  get generation(): number {
    return Number(this.getMeta('generation') ?? 0);
  }

  bumpGeneration() {
    this.setMeta('generation', String(this.generation + 1));
  }

  /** The terms of a document's units, column by column, as FTS5 takes them. */
  private columns(units: SearchUnit[]): string[] {
    const byField = new Map<string, string[]>();
    for (const unit of units) {
      if (unit.placeOnly) continue;
      const list = byField.get(unit.field) ?? [];
      for (const token of searchTokens(unit.text, this.analyzer, 'index'))
        for (const term of searchIndexTerms(unit.text, token))
          list.push(ftsTerm(term));
      byField.set(unit.field, list);
    }
    return SEARCH_FIELDS.map((field) => (byField.get(field) ?? []).join(' '));
  }

  /**
   * Writes a document in place of what was stored for its ref, unless what
   * it shows is the same. Returns whether anything changed.
   */
  write(document: SearchDocument): boolean {
    const fingerprint = documentFingerprint(document);
    const existing = this.db
      .prepare(
        'SELECT id, fingerprint FROM docs WHERE audience = ? AND ref = ?',
      )
      .get(document.audience, document.ref) as
      { id: number; fingerprint: string } | undefined;
    if (existing?.fingerprint === fingerprint) return false;
    const columns = this.columns(document.units);
    const card: StoredCard = {
      href: document.href,
      ...(document.publicRef ? { publicRef: document.publicRef } : {}),
      ...(document.parent ? { parent: document.parent } : {}),
      // A file shows no days of its own; the rest show theirs when they
      // have them.
      ...(document.sort && (document.kind === 'file' || !document.sort.life)
        ? {
            dated: {
              by:
                document.kind === 'file'
                  ? ('shown' as const)
                  : ('added' as const),
              day: document.sort.to,
            },
          }
        : {}),
      ...(document.shownAt ? { shownAt: document.shownAt } : {}),
      ...(document.editHref ? { editHref: document.editHref } : {}),
      ...(document.period ? { period: document.period } : {}),
      ...(document.summary ? { summary: document.summary } : {}),
      ...(document.media ? { media: document.media } : {}),
      ...(document.file ? { file: document.file } : {}),
      ...(document.access ? { access: document.access } : {}),
      ...(document.showcase ? { showcase: true } : {}),
      ...(document.cv ? { cv: true } : {}),
    };
    this.db.transaction(() => {
      if (existing)
        this.removeRow(document.audience, existing.id, document.ref);
      const { lastInsertRowid } = this.db
        .prepare(
          'INSERT INTO docs (audience, kind, ref, title, date, sortFrom, sortTo, sortLife, visibleFrom, showcase, cv, fingerprint, card) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          document.audience,
          document.kind,
          document.ref,
          document.title,
          document.date ?? null,
          document.sort?.from ?? null,
          document.sort?.to ?? null,
          document.sort?.life ? 1 : 0,
          document.visibleFrom,
          document.showcase ? 1 : 0,
          document.cv ? 1 : 0,
          fingerprint,
          JSON.stringify(card),
        );
      const id = Number(lastInsertRowid);
      this.db
        .prepare('INSERT INTO units (doc, data) VALUES (?, ?)')
        .run(id, deflateRawSync(Buffer.from(JSON.stringify(document.units))));
      this.db
        .prepare(
          `INSERT INTO fts_${document.audience} (rowid, ${SEARCH_FIELDS.join(', ')}) VALUES (?, ${SEARCH_FIELDS.map(() => '?').join(', ')})`,
        )
        .run(id, ...columns);
      const tag = this.db.prepare(
        'INSERT OR IGNORE INTO doc_tags (doc, tag) VALUES (?, ?)',
      );
      for (const tagUuid of document.tags) tag.run(id, tagUuid);
      const year = this.db.prepare(
        'INSERT OR IGNORE INTO doc_years (doc, year) VALUES (?, ?)',
      );
      for (const each of lifeYears(document.sort)) year.run(id, each);
      if (document.kind !== 'file') {
        const place = this.db.prepare(
          'INSERT INTO file_places (audience, ref, family, data) VALUES (?, ?, ?, ?)',
        );
        for (const shown of filePlacesOf(document))
          place.run(
            document.audience,
            document.ref,
            shown.familyUuid,
            JSON.stringify(shown),
          );
      }
    })();
    return true;
  }

  private removeRow(audience: SearchAudience, id: number, ref: string) {
    this.db.prepare(`DELETE FROM fts_${audience} WHERE rowid = ?`).run(id);
    this.db.prepare('DELETE FROM units WHERE doc = ?').run(id);
    this.db.prepare('DELETE FROM doc_tags WHERE doc = ?').run(id);
    this.db.prepare('DELETE FROM doc_years WHERE doc = ?').run(id);
    this.db.prepare('DELETE FROM docs WHERE id = ?').run(id);
    this.db
      .prepare('DELETE FROM file_places WHERE audience = ? AND ref = ?')
      .run(audience, ref);
  }

  /** Forgets a document. Returns whether there was one. */
  remove(audience: SearchAudience, ref: string): boolean {
    const existing = this.db
      .prepare('SELECT id FROM docs WHERE audience = ? AND ref = ?')
      .get(audience, ref) as { id: number } | undefined;
    if (!existing) return false;
    this.db.transaction(() => this.removeRow(audience, existing.id, ref))();
    return true;
  }

  /** The places a reader sees the files of these families at. */
  filePlaces(
    audience: SearchAudience,
    families?: Iterable<string>,
  ): Map<string, StoredFilePlace[]> {
    const rows = families
      ? [...new Set(families)].flatMap(
          (family) =>
            this.db
              .prepare(
                'SELECT family, data FROM file_places WHERE audience = ? AND family = ?',
              )
              .all(audience, family) as { family: string; data: string }[],
        )
      : (this.db
          .prepare('SELECT family, data FROM file_places WHERE audience = ?')
          .all(audience) as {
          family: string;
          data: string;
        }[]);
    const byFamily = new Map<string, StoredFilePlace[]>();
    for (const row of rows)
      byFamily.set(row.family, [
        ...(byFamily.get(row.family) ?? []),
        JSON.parse(row.data) as StoredFilePlace,
      ]);
    return byFamily;
  }

  /** The families whose files a document shows, as stored. */
  familiesOf(audience: SearchAudience, ref: string): string[] {
    return (
      this.db
        .prepare(
          'SELECT DISTINCT family FROM file_places WHERE audience = ? AND ref = ?',
        )
        .all(audience, ref) as {
        family: string;
      }[]
    ).map((row) => row.family);
  }

  units(id: number): SearchUnit[] {
    const row = this.db
      .prepare('SELECT data FROM units WHERE doc = ?')
      .get(id) as { data: Buffer } | undefined;
    return row
      ? (JSON.parse(inflateRawSync(row.data).toString()) as SearchUnit[])
      : [];
  }

  refs(audience: SearchAudience, kind?: string): string[] {
    return (
      (kind
        ? this.db
            .prepare('SELECT ref FROM docs WHERE audience = ? AND kind = ?')
            .all(audience, kind)
        : this.db
            .prepare('SELECT ref FROM docs WHERE audience = ?')
            .all(audience)) as { ref: string }[]
    ).map((row) => row.ref);
  }

  close() {
    this.db.close();
  }
}

/**
 * The years the days of a life cover, which the years facet counts and a
 * year filters by: a stretch over several years is in each of them.
 */
function lifeYears(sort: SearchDocument['sort']): number[] {
  if (!sort?.life) return [];
  const from = Number(sort.from.slice(0, 4));
  const to = Math.min(Number(sort.to.slice(0, 4)), from + 100);
  return Array.from(
    { length: Math.max(0, to - from) + 1 },
    (_, at) => from + at,
  );
}

/** The files a document shows, each at its place, for the file's own document. */
function filePlacesOf(document: SearchDocument): StoredFilePlace[] {
  const byFamily = new Map<string, StoredFilePlace>();
  for (const unit of document.units) {
    const file = unit.place?.file;
    if (!file || (unit.where !== 'file' && unit.where !== 'caption')) continue;
    const key = `${file.familyUuid}:${unit.place?.block ?? ''}:${unit.place?.section?.id ?? ''}`;
    const entry = byFamily.get(key) ?? {
      familyUuid: file.familyUuid,
      assetUuid: file.assetUuid,
      ...(file.title ? { title: file.title } : {}),
      href: placeHref(document, unit.place!),
      placeTitle: unit.place?.section
        ? `${document.title} · ${unit.place.section.title}`
        : document.parent
          ? `${document.parent.title} · ${document.title}`
          : document.title,
      placeName: unit.place?.section?.title ?? document.title,
      ...(document.sort ? { sort: document.sort } : {}),
      visibleFrom: document.visibleFrom,
    };
    // The preview of any of its words at the place: a title may come without.
    if (!entry.media && unit.media) entry.media = unit.media;
    if (unit.where === 'file') entry.description = unit.text;
    else
      entry.caption = entry.caption
        ? `${entry.caption} ${unit.text}`
        : unit.text;
    byFamily.set(key, entry);
  }
  return [...byFamily.values()];
}
