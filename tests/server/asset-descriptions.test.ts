import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ASSET_DESCRIPTION_MAX } from '../../shared/asset-description';
import {
  AssetDescriptionConflict,
  AssetDescriptionInvalid,
  readAssetDescription,
  writeAssetDescription,
} from '../../server/thei/assets/descriptions';
import { deleteAssetRow } from '../helpers/delete-asset';
import { deleteStoredAsset } from '../../server/thei/assets/storage';
import { listLibraryAssets } from '../../server/thei/assets/library';
import { buildPublicSearchIndex } from '../../server/thei/public/search-index';
import { createSession } from '../../server/thei/ai/sessions/store';
import { proposeActions } from '../../server/thei/ai/actions/propose';
import {
  applyActions,
  settleActions,
} from '../../server/thei/ai/actions/apply';
import { undoAction, undoState } from '../../server/thei/ai/actions/undo';
import { findAction } from '../../server/thei/ai/actions/rows';
import { actionItems } from '../../server/thei/ai/sessions/view';
import { fileOffers } from '../../server/thei/ai/file-panel';
import { directTools } from '../../server/thei/mcp/registry';
import { FILES_META } from '../../server/thei/mcp/result';
import { takeDownloadTicket } from '../../server/thei/mcp/files';
import { backgroundEvent } from '../../server/thei/ai/runner/background-event';
import { freshAiTestDb } from '../helpers/fresh-ai-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * A file's description — «Описание файла»: one for a family of files, saved over
 * the version it was read at, gone with the last file of the family, found
 * by every search, proposed and taken back as an action, and read by an app
 * with the file's places.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const PICTURE = 'picture.png';

const insert = (table: string, row: Record<string, unknown>) =>
  context.insert(table, row);

beforeEach(async () => {
  context = await freshAiTestDb();
  const picture = join(context.directory, PICTURE);
  await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#cc0000' },
  })
    .png()
    .toFile(picture);
  writeFileSync(join(context.directory, 'notes.txt'), 'Row 7');
  Object.assign(context.server, {
    assets: {
      ...serverRepositories.assets,
      filePath: (_hash: string, extension: string) =>
        join(context.directory, extension === 'png' ? PICTURE : 'notes.txt'),
    },
  });
  insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  insert('projects', {
    projectUuid: PROJECT,
    title: 'Parapet',
    summary: 'A browser remake',
    access: 'public',
    humanReadableSlug: 'parapet',
    publicId: 'Parapet',
    createdAt: 1,
    updatedAt: 2,
  });
  const asset = (
    assetUuid: string,
    familyUuid: string,
    extension: string,
    type: string,
    settingsKey = 'original',
  ) =>
    insert('assets', {
      assetUuid,
      slug: assetUuid.slice(2),
      extension,
      familyUuid,
      contentHash: `hash-${assetUuid}`,
      settingsKey,
      settings: { type: 'original' },
      type,
      size: 900,
      touchedAt: 1,
      meta: type === 'image' ? { width: 40, height: 30 } : null,
    });
  // A picture and a smaller variant of it, and a file of its own.
  asset('a-photo', 'af-photo', 'png', 'image');
  asset('a-photo-small', 'af-photo', 'png', 'image', 'small');
  asset('a-notes', 'af-notes', 'txt', 'other');
});

afterEach(async () => {
  await context.close();
});

describe('a file’s description', () => {
  it('is one for a family, saved over the version it was read at', () => {
    expect(readAssetDescription('a-photo')).toMatchObject({
      text: '',
      updatedAt: null,
    });
    const saved = writeAssetDescription(
      'a-photo-small',
      '  A red square on a white wall.  ',
      { expectedUpdatedAt: null, now: 1000 },
    );
    // Kept as typed, the space around it set aside, and read by any variant.
    expect(saved).toMatchObject({
      text: 'A red square on a white wall.',
      updatedAt: 1000,
    });
    expect(readAssetDescription('a-photo')).toMatchObject({
      text: 'A red square on a white wall.',
      updatedAt: 1000,
      familyUuid: 'af-photo',
    });
    expect(readAssetDescription('a-notes')?.text).toBe('');

    // A save over a version that is no longer there is refused with the
    // description as it is now.
    let conflict: unknown;
    try {
      writeAssetDescription('a-photo', 'Something else', {
        expectedUpdatedAt: null,
      });
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(AssetDescriptionConflict);
    expect((conflict as AssetDescriptionConflict).current).toEqual({
      text: 'A red square on a white wall.',
      updatedAt: 1000,
    });

    // The same words keep the version; two saves in one millisecond are two.
    expect(
      writeAssetDescription('a-photo', 'A red square on a white wall.', {
        expectedUpdatedAt: 1000,
        now: 1000,
      }).updatedAt,
    ).toBe(1000);
    expect(
      writeAssetDescription('a-photo', 'A red square.', {
        expectedUpdatedAt: 1000,
        now: 1000,
      }).updatedAt,
    ).toBe(1001);

    // Too long is refused; empty takes it away.
    expect(() =>
      writeAssetDescription('a-photo', 'x'.repeat(ASSET_DESCRIPTION_MAX + 1), {
        expectedUpdatedAt: 1001,
      }),
    ).toThrow(AssetDescriptionInvalid);
    writeAssetDescription('a-photo', '', { expectedUpdatedAt: 1001 });
    expect(readAssetDescription('a-photo-small')).toMatchObject({
      text: '',
      updatedAt: null,
    });
    expect(
      context.rawDb
        .prepare('SELECT count(*) AS n FROM "asset-descriptions"')
        .get(),
    ).toEqual({ n: 0 });
  });

  it('goes with the last file of its family', async () => {
    writeAssetDescription('a-photo', 'A red square.', {
      expectedUpdatedAt: null,
    });
    writeAssetDescription('a-notes', 'Where we sat.', {
      expectedUpdatedAt: null,
    });
    const kept = () =>
      (
        context.rawDb
          .prepare('SELECT familyUuid FROM "asset-descriptions" ORDER BY 1')
          .all() as { familyUuid: string }[]
      ).map((row) => row.familyUuid);

    // A variant goes; the original still carries the description.
    deleteAssetRow('a-photo-small');
    expect(kept()).toEqual(['af-notes', 'af-photo']);
    // Cleanup takes the last file of the family, and the description with it.
    expect(await deleteStoredAsset('a-photo', Date.now() + 1)).toBe(true);
    expect(kept()).toEqual(['af-notes']);
    expect(await deleteStoredAsset('a-notes', Date.now() + 1)).toBe(true);
    expect(kept()).toEqual([]);
  });

  it('is searched as typed: what looks like markup in it is words', () => {
    writeAssetDescription('a-notes', 'Seats x<y and y>z, R&amp;D', {
      expectedUpdatedAt: null,
    });
    const found = (q: string) =>
      listLibraryAssets({ q }).items.map((item) => item.asset.assetUuid);
    expect(found('and')).toEqual(['a-notes']);
    expect(found('x<y')).toEqual(['a-notes']);
    expect(found('R&amp;D')).toEqual(['a-notes']);
  });

  it('finds a file in the library, and an entity in the site’s search', () => {
    writeAssetDescription('a-photo', 'Grandmother at the dacha', {
      expectedUpdatedAt: null,
    });
    writeAssetDescription('a-notes', 'Tickets of the night train', {
      expectedUpdatedAt: null,
    });
    // Both variants of the picture are found by the words of its family.
    expect(
      listLibraryAssets({ q: 'grandmother' })
        .items.map((item) => item.asset.assetUuid)
        .sort(),
    ).toEqual(['a-photo', 'a-photo-small']);
    expect(
      listLibraryAssets({ q: 'night train' }).items.map(
        (item) => item.asset.assetUuid,
      ),
    ).toEqual(['a-notes']);

    // The project shows the picture to anyone and keeps the notes private:
    // it is found by what the picture shows, never by the private file.
    insert('asset-usages', {
      assetUuid: 'a-photo',
      containerType: 'project',
      containerId: PROJECT,
      role: 'banner',
    });
    insert('asset-usages', {
      assetUuid: 'a-notes',
      containerType: 'project',
      containerId: PROJECT,
      role: 'other-asset',
      meta: { role: 'other-asset', order: 0, isPrivate: true },
    });
    const project = buildPublicSearchIndex().documents.find(
      (document) => document.uuid === PROJECT,
    )!;
    expect(project.text).toContain('grandmother at the dacha');
    expect(project.text).not.toContain('night train');
  });
});

describe('the describe action', () => {
  function session() {
    return createSession({ origin: 'owner', title: 'Files' });
  }

  it('proposes a description for a family, applies and takes it back', async () => {
    const sessionUuid = session();
    const { results } = await proposeActions({
      sessionUuid,
      actions: [
        {
          kind: 'describe',
          file: 'a-photo-small',
          text: 'A red square.',
          reason: 'What the picture shows.',
        },
      ],
    });
    const actionUuid = (results[0] as { actionUuid: string }).actionUuid;
    expect(actionUuid).toBeTruthy();
    const row = findAction(actionUuid)!;
    expect(row).toMatchObject({
      targetType: 'asset',
      targetId: 'a-photo-small',
      payload: {
        kind: 'describe',
        file: 'a-photo-small',
        family: 'af-photo',
        text: 'A red square.',
      },
      base: { text: '', updatedAt: null },
    });

    // The same words for another variant are the same proposal.
    const again = await proposeActions({
      sessionUuid,
      actions: [
        { kind: 'describe', target: 'asset:a-photo', text: 'A red square.' },
      ],
    });
    expect(again.results[0]).toMatchObject({
      refused: expect.stringContaining('waits for the owner already'),
    });
    // A file that is not in the library is no target.
    const missing = await proposeActions({
      sessionUuid,
      actions: [{ kind: 'describe', file: 'a-gone', text: 'Something.' }],
    });
    expect(missing.results[0]).toMatchObject({
      refused: expect.stringContaining('no file a-gone'),
    });

    // It waits at the description of every file of the family.
    const offers = await fileOffers('a-photo');
    expect(offers.map((offer) => [offer.place, offer.action.kind])).toEqual([
      ['field:description', 'describe'],
    ]);
    expect(offers[0]!.action.target).toMatchObject({
      ref: 'asset:a-photo-small',
      type: 'asset',
    });
    expect(offers[0]!.action.file?.assetUuid).toBe('a-photo-small');

    const outcome = await applyActions({
      actionUuids: [actionUuid],
      by: 'owner',
    });
    expect(outcome.applied).toEqual([
      { actionUuid, entity: 'asset:a-photo-small' },
    ]);
    expect(readAssetDescription('a-photo')?.text).toBe('A red square.');
    expect(await undoState(findAction(actionUuid)!)).toBe('ready');

    await undoAction(actionUuid);
    expect(findAction(actionUuid)!.state).toBe('undone');
    expect(readAssetDescription('a-photo')).toMatchObject({
      text: '',
      updatedAt: null,
    });
  });

  it('says a description again, and leaves one the owner changed since', async () => {
    writeAssetDescription('a-photo', 'A red squre.', {
      expectedUpdatedAt: null,
      now: 10,
    });
    const sessionUuid = session();
    const { results } = await proposeActions({
      sessionUuid,
      actions: [
        { kind: 'describe', file: 'a-photo', text: 'A red square.' },
        // The words it has already are no change.
      ],
    });
    const actionUuid = (results[0] as { actionUuid: string }).actionUuid;
    const [item] = await actionItems([findAction(actionUuid)!]);
    // The card compares the words it replaces with its own.
    expect(item!.base).toEqual({ text: 'A red squre.', updatedAt: 10 });
    const same = await proposeActions({
      sessionUuid,
      actions: [{ kind: 'describe', file: 'a-photo', text: 'A red squre.' }],
    });
    expect(same.results[0]).toMatchObject({
      refused: expect.stringContaining('already its description'),
    });

    // The owner wrote it as the proposal would: it counts as applied.
    writeAssetDescription('a-photo-small', 'A red square.', {
      expectedUpdatedAt: 10,
    });
    await settleActions([findAction(actionUuid)!]);
    expect(findAction(actionUuid)).toMatchObject({
      state: 'applied',
      appliedBy: 'owner',
    });

    // Changed by the owner another way, a proposal goes stale.
    const next = await proposeActions({
      sessionUuid,
      actions: [
        { kind: 'describe', file: 'a-photo', text: 'A red square, close up.' },
      ],
    });
    const nextUuid = (next.results[0] as { actionUuid: string }).actionUuid;
    const current = readAssetDescription('a-photo')!;
    writeAssetDescription('a-photo', 'A square of red paint.', {
      expectedUpdatedAt: current.updatedAt,
    });
    const [stale] = await settleActions([findAction(nextUuid)!]);
    expect(stale!.state).toBe('stale');
  });
});

describe('files over MCP', () => {
  function tools(scopes: ('read' | 'edit')[] = ['read']) {
    const all = directTools({
      event: backgroundEvent(),
      principal: { tokenUuid: 'tk-files', label: 'App', scopes },
    });
    return new Map(all.map((tool) => [tool.name, tool]));
  }
  const text = (result: { content: { type: string; text?: string }[] }) =>
    result.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n');

  it('finds a file by its description and reads it with its places', async () => {
    writeAssetDescription('a-photo', 'Grandmother at the dacha', {
      expectedUpdatedAt: null,
    });
    insert('asset-usages', {
      assetUuid: 'a-photo',
      containerType: 'project',
      containerId: PROJECT,
      role: 'banner',
    });
    const reader = tools();
    const found = text(
      await reader.get('find_files')!.call({ query: 'grandmother' }),
    );
    expect(found).toContain('a-photo');
    expect(found).toContain('Grandmother at the dacha');

    const read = text(await reader.get('read_file')!.call({ file: 'a-photo' }));
    expect(read).toContain('picture, PNG');
    expect(read).toContain('Grandmother at the dacha');
    expect(read).toContain(`project:${PROJECT} — Parapet: banner`);
    // What the description is, and who reads it.
    expect(read).toContain('Public: whoever sees the file reads it');

    const notes = text(
      await reader.get('read_file')!.call({ file: 'a-notes' }),
    );
    expect(notes).toContain('none yet');
    expect(notes).toContain('only the owner reads it');
    expect(notes).toContain('cleanup takes it a day after');

    // Used nowhere, but an applied AI action could put it back on undo.
    context.rawDb
      .prepare(
        "INSERT INTO `ai-actions` (actionUuid, sessionUuid, kind, payload, certainty, state, fingerprint, assetUuids, createdAt) VALUES ('aia-1', 's', 'update', '{}', 'sure', 'applied', 'f', '[\"a-notes\"]', 1)",
      )
      .run();
    const held = text(await reader.get('read_file')!.call({ file: 'a-notes' }));
    expect(held).toContain('an AI action still needs it');
    expect(held).not.toContain('cleanup takes it a day after');
  });

  it('reads a file with what its places say of it', async () => {
    insert('content', {
      contentUuid: 'c-project',
      ownerType: 'project',
      ownerId: PROJECT,
      slot: 'project-description',
      data: {
        blocks: [
          { id: 'h', type: 'header', data: { text: 'Summer', level: 2 } },
          { id: 'p', type: 'paragraph', data: { text: 'We went in June.' } },
          {
            id: 'm',
            type: 'contentMedia',
            data: {
              layout: 'centered',
              caption: 'Grandmother <b>at</b> the dacha',
              asset: { assetUuid: 'a-photo' },
            },
          },
          {
            id: 'g',
            type: 'contentGallery',
            data: {
              title: 'Summer days',
              items: [
                { id: 'gi', asset: { assetUuid: 'a-photo' }, caption: 'Again' },
              ],
            },
          },
        ],
      },
      createdAt: 1,
      updatedAt: 1,
    });
    insert('content', {
      contentUuid: 'c-notes',
      ownerType: 'project',
      ownerId: PROJECT,
      slot: 'project-notes',
      data: {
        blocks: [
          { id: 'n', type: 'paragraph', data: { text: 'Her name is Vera.' } },
          {
            id: 'm2',
            type: 'contentMedia',
            data: { layout: 'centered', asset: { assetUuid: 'a-photo' } },
          },
        ],
      },
      createdAt: 1,
      updatedAt: 1,
    });
    for (const [containerId, refs] of [
      [
        'c-project',
        [
          { blockId: 'm', blockType: 'contentMedia', isPrivate: false },
          { blockId: 'g', blockType: 'contentGallery', isPrivate: false },
        ],
      ],
      [
        'c-notes',
        [{ blockId: 'm2', blockType: 'contentMedia', isPrivate: false }],
      ],
    ] as const)
      insert('asset-usages', {
        assetUuid: 'a-photo',
        containerType: 'content',
        containerId,
        role: 'content',
        meta: { role: 'content', refs, isPrivate: false },
      });
    insert('asset-usages', {
      assetUuid: 'a-photo',
      containerType: 'project',
      containerId: PROJECT,
      role: 'showcase-asset',
      meta: {
        role: 'showcase-asset',
        order: 0,
        caption: 'The old house',
        isPrivate: false,
      },
    });
    insert('asset-usages', {
      assetUuid: 'a-photo',
      containerType: 'project',
      containerId: PROJECT,
      role: 'banner',
    });

    const read = text(
      await tools().get('read_file')!.call({ file: 'a-photo' }),
    );
    expect(read).toContain('## What its places say');
    expect(read).toContain(
      `- project:${PROJECT} — Parapet, its description, under “Summer”: captioned “Grandmother at the dacha”\n  before: “We went in June.”`,
    );
    // A gallery's title is told as a gallery's.
    expect(read).toContain(
      `- project:${PROJECT} — Parapet, its description, under “Summer”: in the gallery “Summer days”, captioned “Again”`,
    );
    // The owner's notes are theirs alone, and say so.
    expect(read).toContain(
      `- project:${PROJECT} — Parapet, its notes [private]: no words of its own\n  before: “Her name is Vera.”`,
    );
    expect(read).toContain(
      `- project:${PROJECT} — Parapet, its showcase: captioned “The old house”`,
    );
    // A banner gives the file no words of its own: it is only a place.
    expect(read).not.toContain('Parapet, its banner');
  });

  it('shows a file to a model, and opens a one-time download for an app', async () => {
    const reader = tools();
    const looked = await reader.get('look_at_file')!.call({ file: 'a-photo' });
    expect(looked.content[1]).toMatchObject({
      type: 'image',
      mimeType: 'image/jpeg',
    });
    // Thei's own model is shown it by id, as its service takes it.
    expect(looked._meta?.[FILES_META]).toEqual(['a-photo']);

    const download = text(
      await reader.get('download_file')!.call({ file: 'a-notes' }),
    );
    const ticket = download.match(/\/api\/mcp\/download\/([\w-]+)/)![1]!;
    expect(takeDownloadTicket(ticket)).toMatchObject({
      tokenUuid: 'tk-files',
      assetUuid: 'a-notes',
    });
    // One download per address.
    expect(takeDownloadTicket(ticket)).toBeUndefined();

    const refused = await reader.get('look_at_file')!.call({ file: 'a-none' });
    expect(refused.isError).toBe(true);
  });

  it('tells a model reading an entity what each of its files is', async () => {
    writeAssetDescription('a-photo', 'Grandmother at the dacha', {
      expectedUpdatedAt: null,
    });
    insert('content', {
      contentUuid: 'c-project',
      ownerType: 'project',
      ownerId: PROJECT,
      slot: 'project-description',
      data: {
        blocks: [
          { id: 'p', type: 'paragraph', data: { text: 'The summer.' } },
          {
            id: 'm',
            type: 'contentMedia',
            data: { layout: 'centered', asset: { assetUuid: 'a-photo' } },
          },
          {
            id: 'f',
            type: 'contentAttachment',
            data: { title: 'Notes', asset: { assetUuid: 'a-notes' } },
          },
        ],
      },
      createdAt: 1,
      updatedAt: 1,
    });
    const read = text(
      await tools()
        .get('read_entity')!
        .call({ ref: `project:${PROJECT}` }),
    );
    expect(read).toContain('## Its files');
    expect(read).toContain('- a-photo — Grandmother at the dacha');
    expect(read).toContain('- a-notes — (no description yet)');
  });

  it('proposes a description, and an editor applies it', async () => {
    const editor = tools(['read', 'edit']);
    const proposed = text(
      await editor.get('propose')!.call({
        actions: [
          { kind: 'describe', file: 'a-notes', text: 'Train tickets.' },
        ],
        apply: true,
      }),
    );
    expect(proposed).toContain('Applied:');
    expect(proposed).toContain('asset:a-notes');
    expect(readAssetDescription('a-notes')?.text).toBe('Train tickets.');
    const kinds = text(
      await editor.get('describe_actions')!.call({ kinds: ['describe'] }),
    );
    expect(kinds).toContain('Target: the file');
    expect(kinds).toContain('Never the text of a document');
  });
});
