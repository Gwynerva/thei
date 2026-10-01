import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { freshTestDb } from '../helpers/fresh-db';

vi.mock('../../server/thei/external-links/fetch', () => ({
  collectExternalLink: vi.fn(),
}));

import { collectExternalLink } from '../../server/thei/external-links/fetch';
import {
  ensureExternalLinks,
  findExternalLink,
  findExternalLinks,
  refreshExternalLink,
  runExternalLinkSweep,
  sweepExternalLinks,
  upsertExternalLink,
} from '../../server/thei/external-links/repository';
import {
  externalLinkFaviconDir,
  externalLinkFaviconPath,
  prepareExternalLinkFavicon,
  storeExternalLinkFavicon,
  withExternalLinkFavicons,
} from '../../server/thei/external-links/favicon';
import type { ExternalLink } from '../../shared/external-link';
import {
  applyExternalLinkList,
  getExternalLinkList,
} from '../../server/thei/external-links/lists';

let context: Awaited<ReturnType<typeof freshTestDb>>;
const warn = vi.fn();

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    console: { tag: () => ({ warn, error: warn }) },
  });
  vi.mocked(collectExternalLink).mockReset();
  warn.mockReset();
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

const LONG_AGO = Date.now() - 10 * 60_000;

/** A stand-in for the hash of an icon's bytes: the sweep only compares keys. */
const keyOf = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function storeRow(url: string, touchedAt = LONG_AGO, faviconKey = keyOf(url)) {
  upsertExternalLink({ url, faviconKey, touchedAt });
}

async function storeFile(name: string, ageMs = 10 * 60_000) {
  await mkdir(externalLinkFaviconDir(), { recursive: true });
  const path = join(externalLinkFaviconDir(), name);
  await writeFile(path, 'x');
  const at = new Date(Date.now() - ageMs);
  await utimes(path, at, at);
  return path;
}

const faviconFile = (key: string, ageMs?: number) =>
  storeFile(`${key}.webp`, ageMs);

/** The file a stored link's icon is served from. */
const iconPath = (link: ExternalLink) =>
  externalLinkFaviconPath(
    /([a-f0-9]{64})\.webp$/.exec(link.faviconMedia.src)![1]!,
  );

const iconFiles = async () =>
  (await readdir(externalLinkFaviconDir()).catch(() => [] as string[])).filter(
    (name) => name.endsWith('.webp'),
  );

const ICON = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="#168de2"/></svg>',
);

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

function entity(
  table: 'projects' | 'events',
  id: string,
  externalUrl?: string,
) {
  const columns = {
    title: id,
    summary: '',
    access: 'public',
    humanReadableSlug: id,
    publicId: id,
    createdAt: 1,
    updatedAt: 1,
    action: externalUrl
      ? { enabled: true, target: 'external-link', externalUrl }
      : undefined,
  } as any;
  if (table === 'projects')
    context.db
      .insert(context.schema.projects)
      .values({ projectUuid: id, ...columns })
      .run();
  else
    context.db
      .insert(context.schema.events)
      .values({ eventUuid: id, ...columns })
      .run();
}

describe('the sweep', () => {
  it('keeps every link something still points at and forgets the rest', async () => {
    const urls = {
      projectList: 'https://a.example/',
      eventList: 'https://b.example/',
      profileList: 'https://c.example/',
      projectAction: 'https://d.example/',
      eventAction: 'https://e.example/',
      contentBlock: 'https://f.example/',
      contentInline: 'https://g.example/',
      orphan: 'https://h.example/',
      freshOrphan: 'https://i.example/',
    };
    for (const url of Object.values(urls)) {
      storeRow(url, url === urls.freshOrphan ? Date.now() : LONG_AGO);
      await faviconFile(keyOf(url));
    }
    entity('projects', 'p1', urls.projectAction);
    entity('events', 'e1', urls.eventAction);
    const { db, schema } = context;
    db.transaction((tx) => {
      applyExternalLinkList(tx, schema, { type: 'project', id: 'p1' }, [
        { url: urls.projectList, note: 'A', isPrivate: false },
      ]);
      applyExternalLinkList(tx, schema, { type: 'event', id: 'e1' }, [
        { url: urls.eventList, note: '', isPrivate: true },
      ]);
      applyExternalLinkList(tx, schema, { type: 'profile' }, [
        { url: urls.profileList, name: 'C', isPrivate: false },
      ]);
    });
    db.insert(schema.content)
      .values({
        contentUuid: 'c1',
        ownerType: 'page',
        ownerId: 'page-1',
        slot: 'page-body',
        data: {
          blocks: [
            { type: 'externalLink', data: { url: urls.contentBlock } },
            {
              type: 'paragraph',
              data: {
                text: `See <a href="${urls.contentInline}" data-content-link="external">this</a>`,
              },
            },
          ],
        },
        createdAt: 1,
        updatedAt: 1,
      } as any)
      .run();

    await sweepExternalLinks();

    const remaining = await findExternalLinks(Object.values(urls));
    expect([...remaining.keys()].sort()).toEqual(
      Object.values(urls)
        .filter((url) => url !== urls.orphan)
        .sort(),
    );
    expect(await exists(externalLinkFaviconPath(keyOf(urls.orphan)))).toBe(
      false,
    );
    expect(await exists(externalLinkFaviconPath(keyOf(urls.eventList)))).toBe(
      true,
    );
    expect(await exists(externalLinkFaviconPath(keyOf(urls.freshOrphan)))).toBe(
      true,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('removes stray files, but neither fresh ones nor anything it does not own', async () => {
    const stray = await faviconFile(keyOf('https://gone.example/'));
    const fresh = await faviconFile(keyOf('https://new.example/'), 0);
    // An icon a crash left half written, and one being written right now.
    const abandoned = await storeFile(`${keyOf('x')}.webp.123.456.tmp`);
    const writing = await storeFile(`${keyOf('y')}.webp.123.789.tmp`, 0);
    const foreign = await storeFile('readme.txt');

    await sweepExternalLinks();

    expect(await exists(stray)).toBe(false);
    expect(await exists(fresh)).toBe(true);
    expect(await exists(abandoned)).toBe(false);
    expect(await exists(writing)).toBe(true);
    expect(await exists(foreign)).toBe(true);
  });

  it('keeps an icon file while any link still shows it', async () => {
    const shared = keyOf('one icon for two links');
    const path = await faviconFile(shared);
    storeRow('https://kept.example/a', LONG_AGO, shared);
    storeRow('https://gone.example/b', LONG_AGO, shared);
    context.db.transaction((tx) => {
      applyExternalLinkList(tx, context.schema, { type: 'profile' }, [
        { url: 'https://kept.example/a', name: 'A', isPrivate: false },
      ]);
    });

    await sweepExternalLinks();
    expect(await findExternalLink('https://gone.example/b')).toBeUndefined();
    expect(await exists(path)).toBe(true);

    context.db.transaction((tx) => {
      applyExternalLinkList(tx, context.schema, { type: 'profile' }, []);
    });
    await sweepExternalLinks();
    expect(await findExternalLink('https://kept.example/a')).toBeUndefined();
    expect(await exists(path)).toBe(false);
  });

  it('never takes a file between a store and the row that claims it', async () => {
    // The icon is already on disk, old and claimed by no row, so storing it
    // again writes nothing and leaves the file as the sweep would find it.
    const { faviconKey } = await storeExternalLinkFavicon(
      await prepareExternalLinkFavicon(ICON),
    );
    const path = externalLinkFaviconPath(faviconKey);
    const old = new Date(LONG_AGO);
    await utimes(path, old, old);

    let release!: () => void;
    let reachedPause!: () => void;
    const paused = new Promise<void>((resolve) => (release = resolve));
    const betweenFileAndRow = new Promise<void>(
      (resolve) => (reachedPause = resolve),
    );
    const storing = withExternalLinkFavicons(async () => {
      const stored = await storeExternalLinkFavicon(
        await prepareExternalLinkFavicon(ICON),
      );
      reachedPause();
      await paused;
      upsertExternalLink({
        url: 'https://site.example/',
        faviconKey: stored.faviconKey,
        touchedAt: Date.now(),
      });
    });
    await betweenFileAndRow;
    const sweeping = sweepExternalLinks();
    // Time enough for a sweep that did not wait to have finished.
    await Promise.race([
      sweeping,
      new Promise((resolve) => setTimeout(resolve, 200)),
    ]);
    release();
    await Promise.all([storing, sweeping]);

    expect(await findExternalLink('https://site.example/')).toBeDefined();
    expect(await exists(path)).toBe(true);
  });

  it('tolerates malformed content and never throws', async () => {
    storeRow('https://kept.example/');
    context.db
      .insert(context.schema.content)
      .values({
        contentUuid: 'broken',
        ownerType: 'page',
        ownerId: 'page-2',
        slot: 'page-body',
        data: { blocks: 'not a list' },
        createdAt: 1,
        updatedAt: 1,
      } as any)
      .run();
    await expect(runExternalLinkSweep()).resolves.toBeUndefined();

    Object.assign(context.server, {
      useDb: () => {
        throw new Error('database is closed');
      },
    });
    await expect(runExternalLinkSweep()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe('reading and storing', () => {
  it('reads a site once for concurrent callers and stores what it said', async () => {
    const url = 'https://site.example/page';
    vi.mocked(collectExternalLink).mockImplementation(async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        url: String(value),
        title: 'Read once',
        description: 'The description',
        status: 'archived',
      };
    });

    const [first, , second] = await Promise.all([
      refreshExternalLink(url),
      ensureExternalLinks([url]),
      refreshExternalLink(url),
    ]);
    expect(collectExternalLink).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(await findExternalLink(url)).toMatchObject({
      url,
      title: 'Read once',
      description: 'The description',
      status: 'archived',
    });
    expect(await exists(iconPath(first))).toBe(true);

    // Ensuring never reads a site that already has a record.
    await ensureExternalLinks([url, 'https://other.example/']);
    expect(collectExternalLink).toHaveBeenCalledTimes(2);
    expect(vi.mocked(collectExternalLink).mock.calls[1]?.[0]).toBe(
      'https://other.example/',
    );
  });

  it('stores one file for every link with the same icon', async () => {
    vi.mocked(collectExternalLink).mockImplementation(async (value) => ({
      url: String(value),
      status: 'complete',
      favicon: String(value).includes('store.example') ? ICON : undefined,
    }));

    const first = await refreshExternalLink('https://store.example/app/1/');
    const second = await refreshExternalLink('https://store.example/app/2/');
    expect(second.faviconMedia.src).toBe(first.faviconMedia.src);
    // Refreshed with the same bytes, the address stays, and so does the
    // copy a browser already has.
    const again = await refreshExternalLink('https://store.example/app/1/');
    expect(again.faviconMedia.src).toBe(first.faviconMedia.src);
    expect(again.faviconMedia.src).not.toContain('?');

    // Links without an icon of their own share the neutral tile.
    const bare = await refreshExternalLink('https://bare.example/');
    const other = await refreshExternalLink('https://other-bare.example/');
    expect(other.faviconMedia.src).toBe(bare.faviconMedia.src);
    expect(bare.faviconMedia.src).not.toBe(first.faviconMedia.src);

    expect((await iconFiles()).sort()).toEqual(
      [iconPath(first), iconPath(bare)]
        .map((path) => path.split(/[\\/]/).pop()!)
        .sort(),
    );
  });

  it('records a failure to read without failing the caller', async () => {
    vi.mocked(collectExternalLink).mockRejectedValue(new Error('boom'));
    await expect(
      ensureExternalLinks(['https://down.example/']),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(await findExternalLink('https://down.example/')).toBeUndefined();
  });

  it('lists an owner’s links in order, with their details and privacy', async () => {
    storeRow('https://one.example/');
    storeRow('https://two.example/');
    entity('projects', 'p2');
    context.db.transaction((tx) => {
      applyExternalLinkList(tx, context.schema, { type: 'project', id: 'p2' }, [
        { url: 'https://two.example/', note: 'Second', isPrivate: true },
        { url: 'https://one.example/', note: '', isPrivate: false },
      ]);
    });
    const all = getExternalLinkList({ type: 'project', id: 'p2' });
    expect(all.map((link) => link.url)).toEqual([
      'https://two.example/',
      'https://one.example/',
    ]);
    expect(all[0]).toMatchObject({
      url: 'https://two.example/',
      note: 'Second',
      isPrivate: true,
      status: 'complete',
    });
    expect(all[0]).not.toHaveProperty('name');
    expect(all[0]?.faviconMedia.src).toContain(
      '/media/external-link-favicons/',
    );
    expect(
      getExternalLinkList(
        { type: 'project', id: 'p2' },
        { includePrivate: false },
      ).map((link) => link.url),
    ).toEqual(['https://one.example/']);
    expect(getExternalLinkList({ type: 'profile' })).toEqual([]);
  });

  it('names the profile’s links, and keeps a note an older panel did not send', async () => {
    storeRow('https://one.example/');
    storeRow('https://two.example/');
    entity('projects', 'p3');
    context.db.transaction((tx) => {
      applyExternalLinkList(tx, context.schema, { type: 'profile' }, [
        {
          url: 'https://one.example/',
          name: 'GitHub',
          note: 'Code',
          isPrivate: false,
        },
      ]);
      applyExternalLinkList(tx, context.schema, { type: 'project', id: 'p3' }, [
        { url: 'https://one.example/', note: 'Why', isPrivate: false },
        { url: 'https://two.example/', note: 'Kept', isPrivate: false },
      ]);
    });
    context.db.transaction((tx) => {
      applyExternalLinkList(tx, context.schema, { type: 'project', id: 'p3' }, [
        { url: 'https://two.example/', isPrivate: true },
        { url: 'https://one.example/', note: '', isPrivate: false },
      ]);
    });
    expect(
      getExternalLinkList({ type: 'profile' }).map(({ name, note }) => ({
        name,
        note,
      })),
    ).toEqual([{ name: 'GitHub', note: 'Code' }]);
    expect(
      getExternalLinkList({ type: 'project', id: 'p3' }).map(
        ({ url, note, isPrivate }) => ({ url, note, isPrivate }),
      ),
    ).toEqual([
      { url: 'https://two.example/', note: 'Kept', isPrivate: true },
      { url: 'https://one.example/', note: '', isPrivate: false },
    ]);
  });
});
