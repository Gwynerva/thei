import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, stat, utimes, writeFile } from 'node:fs/promises';
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
  externalLinkKey,
} from '../../server/thei/external-links/favicon';
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

function storeRow(url: string, touchedAt = LONG_AGO) {
  upsertExternalLink({ url, faviconKey: externalLinkKey(url), touchedAt });
}

async function storeFile(name: string, ageMs = 10 * 60_000) {
  await mkdir(externalLinkFaviconDir(), { recursive: true });
  const path = join(externalLinkFaviconDir(), name);
  await writeFile(path, 'x');
  const at = new Date(Date.now() - ageMs);
  await utimes(path, at, at);
  return path;
}

const faviconFile = (url: string, ageMs?: number) =>
  storeFile(`${externalLinkKey(url)}.webp`, ageMs);

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
      await faviconFile(url);
    }
    entity('projects', 'p1', urls.projectAction);
    entity('events', 'e1', urls.eventAction);
    const { db, schema } = context;
    db.transaction((tx) => {
      applyExternalLinkList(tx, schema, { type: 'project', id: 'p1' }, [
        { url: urls.projectList, name: 'A', isPrivate: false },
      ]);
      applyExternalLinkList(tx, schema, { type: 'event', id: 'e1' }, [
        { url: urls.eventList, name: 'B', isPrivate: true },
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
    expect(
      await exists(externalLinkFaviconPath(externalLinkKey(urls.orphan))),
    ).toBe(false);
    expect(
      await exists(externalLinkFaviconPath(externalLinkKey(urls.eventList))),
    ).toBe(true);
    expect(
      await exists(externalLinkFaviconPath(externalLinkKey(urls.freshOrphan))),
    ).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('removes stray files, but neither fresh ones nor anything it does not own', async () => {
    const stray = await faviconFile('https://gone.example/');
    const fresh = await faviconFile('https://new.example/', 0);
    const temporary = await storeFile(`${externalLinkKey('x')}.webp.123.tmp`);
    const foreign = await storeFile('readme.txt');

    await sweepExternalLinks();

    expect(await exists(stray)).toBe(false);
    expect(await exists(fresh)).toBe(true);
    expect(await exists(temporary)).toBe(true);
    expect(await exists(foreign)).toBe(true);
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
    expect(await exists(externalLinkFaviconPath(externalLinkKey(url)))).toBe(
      true,
    );

    // Ensuring never reads a site that already has a record.
    await ensureExternalLinks([url, 'https://other.example/']);
    expect(collectExternalLink).toHaveBeenCalledTimes(2);
    expect(vi.mocked(collectExternalLink).mock.calls[1]?.[0]).toBe(
      'https://other.example/',
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
        { url: 'https://two.example/', name: 'Second', isPrivate: true },
        { url: 'https://one.example/', name: 'First', isPrivate: false },
      ]);
    });
    const all = getExternalLinkList({ type: 'project', id: 'p2' });
    expect(all.map((link) => link.name)).toEqual(['Second', 'First']);
    expect(all[0]).toMatchObject({
      url: 'https://two.example/',
      isPrivate: true,
      status: 'complete',
    });
    expect(all[0]?.faviconMedia.src).toContain(
      '/media/external-link-favicons/',
    );
    expect(
      getExternalLinkList(
        { type: 'project', id: 'p2' },
        { includePrivate: false },
      ).map((link) => link.name),
    ).toEqual(['First']);
    expect(getExternalLinkList({ type: 'profile' })).toEqual([]);
  });
});
