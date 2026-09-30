import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import sharp from 'sharp';
import {
  closeDraft,
  commitDraft,
  DRAFT_MAX_RENDERS,
  draftsDirectory,
  expireIdleDrafts,
  openDraft,
  renderDraft,
  resetDraftsForTests,
  sweepDraftDirectories,
  useDraft,
} from '../../../server/thei/assets/drafts';
import { withProcessingSlot } from '../../../server/thei/assets/queue';
import { createAsset } from '../../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../../server/thei/assets/repository/touch';
import { attachAssetUsage } from '../../../server/thei/assets/repository/usages/attach';
import { schema } from '../../../server/thei/db/schema';
import { AssetType } from '../../../shared/asset';
import type { AssetImageTransformRequest } from '../../../shared/asset-upload-settings';

let root = '';
let rawDb: Database.Database;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-drafts-'));
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE assets (
      assetUuid text PRIMARY KEY NOT NULL,
      slug text NOT NULL UNIQUE,
      extension text NOT NULL,
      familyUuid text NOT NULL,
      contentHash text NOT NULL,
      settingsKey text NOT NULL,
      settings text,
      type text NOT NULL,
      size integer NOT NULL,
      touchedAt integer NOT NULL,
      meta text
    );
    CREATE UNIQUE INDEX assets_family_content_settings_idx
      ON assets (familyUuid, contentHash, settingsKey);
    CREATE TABLE "asset-usages" (
      assetUuid text NOT NULL,
      containerType text NOT NULL,
      containerId text NOT NULL,
      role text NOT NULL,
      meta text,
      PRIMARY KEY(assetUuid, containerType, containerId, role)
    );
  `);
  const db = drizzle(rawDb, { schema });
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    projectPath: (...parts: string[]) => join(root, ...parts),
    assets: {
      filePath: (contentHash: string, extension: string) =>
        join(
          root,
          'assets',
          contentHash.slice(0, 2),
          `${contentHash}.${extension}`,
        ),
      create: createAsset,
      findByIdentity: findAssetByIdentity,
      findByUuid: findAssetByUuid,
      findBySlug: findAssetBySlug,
      touch: touchAsset,
      usages: {
        attach: attachAssetUsage,
        findByContainer: async () => [],
      },
    },
  };
});

afterEach(async () => {
  resetDraftsForTests();
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
  await rm(root, { recursive: true, force: true });
});

async function stagedDraft(width = 800, height = 600, id = 'draft-a') {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: '#3a7bd5' },
  })
    .png()
    .toBuffer();
  const directory = join(draftsDirectory(), id);
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'source.png');
  await writeFile(path, bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  return await openDraft({
    id,
    directory,
    source: { path, size: bytes.length, hash, extension: 'png', owned: true },
    type: AssetType.Image,
    familyUuid: `af-${hash}`,
  });
}

/** A job that holds a lane's slot until released. */
function holdSlot(type: AssetType) {
  let release!: () => void;
  const done = new Promise<void>((resolve) => (release = resolve));
  const held = withProcessingSlot(type, () => done);
  return { release, held };
}

const request = (width: number, quality = 80): AssetImageTransformRequest => ({
  type: 'image-transform',
  quality,
  dimensions: { width },
});

const live = () => new AbortController().signal;

describe('editor drafts', () => {
  it('reads the size of a staged source once', async () => {
    const draft = await stagedDraft(800, 600);

    expect(draft).toMatchObject({
      draftId: 'draft-a',
      type: AssetType.Image,
      extension: 'png',
      width: 800,
      height: 600,
    });
  });

  it('renders without storing and answers repeated settings from its cache', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');

    const first = await renderDraft(session, request(400), live());
    const again = await renderDraft(session, request(400), live());

    expect(first).toMatchObject({ width: 400, height: 300, extension: 'avif' });
    expect(first.url).toBe(
      `/api/admin/assets/drafts/draft-a/renders/${first.renderId}`,
    );
    expect(again).toEqual(first);
    expect(rawDb.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({
      n: 0,
    });
  });

  it('keeps only the latest renders', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');
    for (
      let width = 100;
      width <= (DRAFT_MAX_RENDERS + 1) * 10 + 100;
      width += 10
    ) {
      await renderDraft(session, request(width), live());
    }

    const files = (await readdir(session.directory)).filter(
      (name) => !name.startsWith('source'),
    );
    expect(files).toHaveLength(DRAFT_MAX_RENDERS);
    expect(session.renders.size).toBe(DRAFT_MAX_RENDERS);
  });

  it('stores exactly the rendered bytes, without encoding again', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');
    const render = await renderDraft(session, request(400), live());
    const renderPath = join(
      session.directory,
      `${render.renderId}.${render.extension}`,
    );
    const renderedHash = createHash('sha256')
      .update(await readFile(renderPath))
      .digest('hex');

    const stored = await commitDraft(session, request(400), { signal: live() });

    expect(stored.contentHash).toBe(renderedHash);
    expect(stored.settingsKey).toBe(render.settingsKey);
    // Moved into the library, not copied.
    await expect(stat(renderPath)).rejects.toThrow();
  });

  it('keeps reading the original from the library once it is stored', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');

    const original = await commitDraft(
      session,
      { type: 'original' },
      { signal: live() },
    );

    expect(session.source).toMatchObject({
      owned: false,
      hash: original.contentHash,
    });
    const render = await renderDraft(session, request(200), live());
    expect(render.width).toBe(200);
  });

  it('refuses work for a request that is already gone', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');
    const controller = new AbortController();
    controller.abort(new Error('closed'));

    await expect(
      renderDraft(session, request(300), controller.signal),
    ).rejects.toThrow('closed');
  });

  it('drops a render whose requester left before it started, and encodes it afresh when asked again', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');
    // More held jobs than the image lane has slots: a render must wait.
    const holds = [1, 2, 3, 4].map(() => holdSlot(AssetType.Image));
    const controller = new AbortController();
    const waiting = renderDraft(session, request(300), controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.inflight.size).toBe(1);

    controller.abort(new Error('closed'));
    await expect(waiting).rejects.toThrow('closed');
    // Asked again by someone else: a fresh job, not the one that just left.
    const again = renderDraft(session, request(300), live());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.inflight.size).toBe(1);
    for (const hold of holds) hold.release();
    await Promise.all(holds.map((hold) => hold.held));

    expect(await again).toMatchObject({ width: 300 });
    expect(session.inflight.size).toBe(0);
  });

  it('reports where a commit is, and keeps an encode its requester abandoned', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');
    const statuses: string[] = [];
    const controller = new AbortController();
    const commit = commitDraft(session, request(500), {
      signal: controller.signal,
      onStatus: (status) => {
        statuses.push(status.phase);
        // The request closes while the picture is being encoded; sharp
        // finishes anyway.
        if (status.phase === 'processing') controller.abort(new Error('gone'));
      },
    });

    await expect(commit).rejects.toThrow('gone');
    expect(statuses).toEqual(['processing']);
    expect(rawDb.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({
      n: 0,
    });
    // The editor opened on this draft finds the encode ready.
    const render = await renderDraft(session, request(500), live());
    expect(render.width).toBe(500);
    expect(session.busy).toBe(0);

    const stored = await commitDraft(session, request(500), {
      signal: live(),
      onStatus: (status) => statuses.push(status.phase),
    });
    expect(stored.settingsKey).toBe(render.settingsKey);
    expect(statuses).toEqual(['processing', 'processing', 'finishing']);
  });

  it('keeps the directory of a draft closed under a commit until the commit is over', async () => {
    await stagedDraft(1600, 1200);
    const session = useDraft('draft-a');
    let directoryDuring: boolean | undefined;
    const stored = await commitDraft(session, request(1500), {
      signal: live(),
      onStatus: async (status) => {
        if (status.phase !== 'processing') return;
        // The block that pasted the file is deleted while it is encoding.
        await closeDraft('draft-a');
        directoryDuring = (
          await stat(session.directory).catch(() => null)
        )?.isDirectory();
      },
    });

    expect(directoryDuring).toBe(true);
    expect(stored.settingsKey).toContain('w1500');
    expect(() => useDraft('draft-a')).toThrow('Draft has expired');
    await expect(stat(session.directory)).rejects.toThrow();
  });

  it('writes nothing for a render whose draft was closed meanwhile', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');
    const holds = [1, 2, 3, 4].map(() => holdSlot(AssetType.Image));
    const render = renderDraft(session, request(300), live());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await closeDraft('draft-a');
    for (const hold of holds) hold.release();
    await Promise.all(holds.map((hold) => hold.held));

    await expect(render).rejects.toThrow('Draft closed');
    // The directory goes once the abandoned job has let go of the draft.
    for (let waited = 0; waited < 50; waited++) {
      if (!(await stat(session.directory).catch(() => null))) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(session.inflight.size).toBe(0);
    await expect(stat(session.directory)).rejects.toThrow();
  });

  it('never evicts a draft with a commit under way', async () => {
    await stagedDraft(80, 60, 'busy');
    const busy = useDraft('busy');
    busy.busy += 1;
    for (const id of ['b', 'c', 'd', 'e', 'f']) await stagedDraft(80, 60, id);

    // The busy draft outlives newer idle ones though it was opened first.
    expect(() => useDraft('busy')).not.toThrow();
    expect(() => useDraft('b')).toThrow('Draft has expired');
    busy.busy -= 1;
    await expireIdleDrafts(Date.now() + 31 * 60 * 1000);
    expect(() => useDraft('busy')).toThrow('Draft has expired');
  });

  it('forgets idle drafts and their files', async () => {
    await stagedDraft();
    const session = useDraft('draft-a');

    await expireIdleDrafts(Date.now() + 31 * 60 * 1000);

    expect(() => useDraft('draft-a')).toThrow('Draft has expired');
    await expect(stat(session.directory)).rejects.toThrow();
  });

  it('sweeps draft directories no live draft owns', async () => {
    await stagedDraft();
    const stray = join(draftsDirectory(), 'left-by-a-crash');
    await mkdir(stray, { recursive: true });
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(stray, old, old);
    await utimes(join(draftsDirectory(), 'draft-a'), old, old);

    expect(await sweepDraftDirectories()).toBe(1);
    await expect(stat(stray)).rejects.toThrow();
    expect((await stat(join(draftsDirectory(), 'draft-a'))).isDirectory()).toBe(
      true,
    );
  });

  it('closes a draft on request', async () => {
    await stagedDraft();
    await closeDraft('draft-a');

    expect(() => useDraft('draft-a')).toThrow('Draft has expired');
  });
});
