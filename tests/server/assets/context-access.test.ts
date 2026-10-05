import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import {
  createApp,
  defineEventHandler,
  getCookie,
  getHeader,
  toWebHandler,
} from 'h3';
import { freshTestDb } from '../../helpers/fresh-db';
import { sendContextAsset } from '../../../server/thei/assets/context-access';
import { AssetType } from '../../../shared/asset';
import {
  ProjectEventAccessLevel,
  SiteAccessLevel,
} from '../../../shared/access-level';
import { resolveRequestAdminRole } from '../../../shared/public-view';
import type { ShareGrantOwner } from '../../../shared/share-link';

let context: Awaited<ReturnType<typeof freshTestDb>>;
let contextType:
  | 'project'
  | 'event'
  | 'page'
  | 'profile'
  | 'profile-avatar'
  | 'profile-status'
  | 'project-status'
  | 'project-section' = 'project';
let contextRole: 'content' | 'icon' | 'banner' | 'favicon' = 'content';
let contextGrantOwner: ShareGrantOwner | undefined;
let parentAccess = ProjectEventAccessLevel.Public;
let siteAccess = SiteAccessLevel.Public;
const app = createApp().use(
  defineEventHandler((event) => {
    // What the middleware reads from a share link's cookie, named directly.
    const grant = getHeader(event, 'x-grant');
    event.context.shareGrants = new Map(grant ? [[grant, Infinity]] : []);
    return sendContextAsset(event, {
      ownerType: contextType,
      ownerId: 'parent',
      access: parentAccess,
      grantOwner: contextGrantOwner,
      role: contextRole,
      filename: 'file.webp',
    });
  }),
);
const handle = toWebHandler(app);
const request = (
  role = 'guest',
  headers: Record<string, string> = {},
  preview = false,
) =>
  handle(
    new Request(`http://localhost/file${preview ? '?preview=1' : ''}`, {
      headers: {
        'x-role': role,
        ...(role === 'as-guest' ? { cookie: 'thei-public-view=guest' } : {}),
        ...headers,
      },
    }),
  );

beforeAll(async () => {
  context = await freshTestDb();
  const { db, schema } = context;
  const source = {
    assetUuid: 'asset',
    slug: 'file',
    extension: 'webp',
    familyUuid: 'family',
    contentHash: 'original-hash',
    settingsKey: 'source',
    type: AssetType.Image,
    size: 8,
    touchedAt: 0,
  };
  db.insert(schema.assets)
    .values([
      source,
      {
        ...source,
        assetUuid: 'preview',
        slug: 'preview',
        contentHash: 'preview-hash',
        settingsKey: 'preview',
      },
    ])
    .run();
  // Files are addressed by content hash, so the fixture names them that way.
  await writeFile(join(context.directory, 'original-hash.webp'), 'original');
  await writeFile(join(context.directory, 'preview-hash.webp'), 'preview!');
  Object.assign(context.server, {
    useDb: () => context,
    config: {
      get siteAccessLevel() {
        return siteAccess;
      },
    },
    isAdmin: async (event: any) =>
      resolveRequestAdminRole({
        isAuthenticatedAdmin: getHeader(event, 'x-role') !== 'guest',
        path: '/projects/a/content/file.webp',
        publicViewCookie: getCookie(event, 'thei-public-view'),
      }),
    assets: {
      findBySlug: async (slug: string) =>
        db
          .select()
          .from(schema.assets)
          .where(eq(schema.assets.slug, slug))
          .get(),
      filePath: (contentHash: string, ext: string) =>
        join(context.directory, `${contentHash}.${ext}`),
      usages: {
        findByContainer: async () => [
          {
            asset: db
              .select()
              .from(schema.assets)
              .where(eq(schema.assets.assetUuid, 'preview'))
              .get(),
            role: 'preview',
          },
        ],
        findOne: async (
          assetUuid: string,
          ownerType: string,
          ownerId: string,
          role: string,
        ) =>
          db
            .select()
            .from(schema.assetUsages)
            .where(
              and(
                eq(schema.assetUsages.assetUuid, assetUuid),
                eq(schema.assetUsages.containerType, ownerType as any),
                eq(schema.assetUsages.containerId, ownerId),
                eq(schema.assetUsages.role, role as any),
              ),
            )
            .get(),
      },
    },
  });
});
afterAll(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});
beforeEach(() => {
  contextType = 'project';
  contextRole = 'content';
  contextGrantOwner = undefined;
  parentAccess = ProjectEventAccessLevel.Public;
  siteAccess = SiteAccessLevel.Public;
  const { db, schema } = context;
  db.delete(schema.assetUsages).run();
  db.delete(schema.content).run();
  db.delete(schema.projectContentSections).run();
});

function use(
  ownerType: 'project' | 'event' | 'page' | 'project-section',
  isPrivate = false,
  ownerId = 'parent',
  notes = false,
) {
  const { db, schema } = context;
  const contentUuid = `${ownerType}:${ownerId}${notes ? ':notes' : ''}`;
  const slot = notes
    ? `${ownerType}-notes`
    : ownerType === 'project'
      ? 'project-description'
      : ownerType === 'event'
        ? 'event-body'
        : ownerType === 'page'
          ? 'page-body'
          : 'project-section-body';
  db.insert(schema.content)
    .values({
      contentUuid,
      ownerType,
      ownerId,
      slot: slot as any,
      data: { blocks: [] },
      createdAt: 0,
      updatedAt: 0,
    })
    .run();
  db.insert(schema.assetUsages)
    .values({
      assetUuid: 'asset',
      containerType: 'content',
      containerId: contentUuid,
      role: 'content',
      meta: { role: 'content', refs: [{ blockId: 'block', isPrivate }] } as any,
    })
    .run();
}

describe('contextual attachment authorization before HTTP caching', () => {
  it.each([
    ['profile', 'banner'],
    ['profile-avatar', 'icon'],
    ['profile-status', 'icon'],
  ] as const)(
    '%s media requires an attached usage',
    async (container, role) => {
      contextType = container;
      contextRole = role;
      const { db, schema } = context;
      db.insert(schema.assetUsages)
        .values({
          assetUuid: 'asset',
          containerType: container,
          containerId: 'parent',
          role,
        })
        .run();
      expect((await request()).status).toBe(200);
      db.delete(schema.assetUsages).run();
      expect((await request()).status).toBe(404);
    },
  );

  it.each(['project', 'event', 'page'] as const)(
    '%s private block denies guests and guest mode, including preview/Range/304',
    async (type) => {
      contextType = type;
      use(type, true);
      for (const role of ['guest', 'as-guest'])
        for (const preview of [false, true]) {
          expect(
            (
              await request(
                role,
                { Range: 'bytes=0-2', 'If-None-Match': '"original-hash"' },
                preview,
              )
            ).status,
          ).toBe(404);
        }
      const admin = await request('admin');
      expect(admin.status).toBe(200);
      expect(admin.headers.get('cache-control')).toBe('private, no-cache');
    },
  );
  it('requires an accessible project section, but permits another public use', async () => {
    const { db, schema } = context;
    db.insert(schema.projectContentSections)
      .values({
        sectionUuid: 'child',
        projectUuid: 'parent',
        title: 'Hidden child',
        humanReadableSlug: 'hidden',
        publicId: 'childid',
        isPrivate: true,
        sortOrder: 0,
        createdAt: 0,
        updatedAt: 0,
      })
      .run();
    use('project-section', false, 'child');
    expect((await request()).status).toBe(404);
    expect((await request('admin')).headers.get('cache-control')).toBe(
      'private, no-cache',
    );
    use('project', false);
    expect((await request()).status).toBe(200);
    expect((await request()).headers.get('cache-control')).toBe(
      'public, max-age=86400, s-maxage=300',
    );
  });
  it('does not authorize a reference from a different project', async () => {
    use('project', false, 'different');
    expect((await request()).status).toBe(404);
  });
  it('revalidates rights, uses variant hashes and supports byte ranges', async () => {
    use('project');
    const original = await request();
    expect(original.headers.get('etag')).toBe('"original-hash"');
    const preview = await request('guest', {}, true);
    expect(preview.headers.get('etag')).toBe('"preview-hash"');
    const range = await request('guest', { Range: 'bytes=1-3' });
    expect(range.status).toBe(206);
    expect(await range.text()).toBe('rig');
    expect(
      (
        await request('guest', {
          'If-None-Match': 'W/"original-hash", "other"',
        })
      ).status,
    ).toBe(304);
    const { db, schema } = context;
    db.update(schema.assetUsages)
      .set({
        meta: {
          role: 'content',
          refs: [{ blockId: 'block', isPrivate: true }],
        } as any,
      })
      .where(
        and(
          eq(schema.assetUsages.assetUuid, 'asset'),
          eq(schema.assetUsages.role, 'content'),
        ),
      )
      .run();
    expect(
      (await request('guest', { 'If-None-Match': '"original-hash"' })).status,
    ).toBe(404);
  });
  it('serves an image as its own preview when it has none, but not a video', async () => {
    use('project');
    const usages = context.server.assets.usages as {
      findByContainer: () => Promise<unknown[]>;
    };
    const withPreview = usages.findByContainer;
    usages.findByContainer = async () => [];
    try {
      const image = await request('guest', {}, true);
      expect(image.status).toBe(200);
      expect(image.headers.get('etag')).toBe('"original-hash"');
      const { db, schema } = context;
      db.update(schema.assets)
        .set({ type: AssetType.Video })
        .where(eq(schema.assets.assetUuid, 'asset'))
        .run();
      expect((await request('guest', {}, true)).status).toBe(404);
      db.update(schema.assets)
        .set({ type: AssetType.Image })
        .where(eq(schema.assets.assetUuid, 'asset'))
        .run();
    } finally {
      usages.findByContainer = withPreview;
    }
  });
  it('uses the effective role for site and parent privacy', async () => {
    use('project');
    for (const scope of ['site', 'parent']) {
      if (scope === 'site') siteAccess = SiteAccessLevel.Private;
      else parentAccess = ProjectEventAccessLevel.Private;
      expect((await request('as-guest')).status).toBe(404);
      expect((await request('admin')).headers.get('cache-control')).toBe(
        'private, no-cache',
      );
    }
  });
});

describe('share links and contextual attachments', () => {
  const holding = (grant: string, headers: Record<string, string> = {}) =>
    request('guest', { 'x-grant': grant, ...headers });

  it('opens a private page and its private blocks to its own link only', async () => {
    contextType = 'page';
    parentAccess = ProjectEventAccessLevel.Private;
    use('page', true);
    expect((await request()).status).toBe(404);
    const shared = await holding('page:parent');
    expect(shared.status).toBe(200);
    // Opened by a link that expires: nothing may keep a copy.
    expect(shared.headers.get('cache-control')).toBe('private, no-store');
    // Grants are keyed by kind as well as by id.
    expect((await holding('project:parent')).status).toBe(404);
    expect((await holding('page:other')).status).toBe(404);
  });

  it("opens a project's private section files with the project's link", async () => {
    const { db, schema } = context;
    db.insert(schema.projectContentSections)
      .values({
        sectionUuid: 'child',
        projectUuid: 'parent',
        title: 'Hidden section',
        humanReadableSlug: 'hidden',
        publicId: 'childid',
        isPrivate: true,
        sortOrder: 0,
        createdAt: 0,
        updatedAt: 0,
      })
      .run();
    use('project-section', false, 'child');
    expect((await request()).status).toBe(404);
    expect((await holding('project:parent')).status).toBe(200);
    expect((await holding('project:other')).status).toBe(404);
  });

  it("opens a project's status icon through the project named by the route", async () => {
    contextType = 'project-status';
    contextRole = 'icon';
    parentAccess = ProjectEventAccessLevel.Private;
    contextGrantOwner = { entityType: 'project', entityId: 'P' };
    context.db
      .insert(context.schema.assetUsages)
      .values({
        assetUuid: 'asset',
        containerType: 'project-status',
        containerId: 'parent',
        role: 'icon',
      })
      .run();
    expect((await request()).status).toBe(404);
    expect((await holding('project:P')).status).toBe(200);
    expect((await holding('project:Q')).status).toBe(404);
  });

  it('opens a banner placed on a section, as open as the section is', async () => {
    contextType = 'project-section';
    contextRole = 'banner';
    contextGrantOwner = { entityType: 'project', entityId: 'P' };
    // The route names a private section's access as private.
    parentAccess = ProjectEventAccessLevel.Private;
    expect((await request('admin')).status).toBe(404);
    context.db
      .insert(context.schema.assetUsages)
      .values({
        assetUuid: 'asset',
        containerType: 'project-section',
        containerId: 'parent',
        role: 'banner',
      })
      .run();
    expect((await request()).status).toBe(404);
    expect((await holding('project:P')).status).toBe(200);
    expect((await holding('project:Q')).status).toBe(404);
    expect((await request('admin')).status).toBe(200);
    // A section open to all has a banner open to all.
    parentAccess = ProjectEventAccessLevel.Public;
    expect((await request()).status).toBe(200);
  });

  it("keeps a file placed only in the owner's notes to the owner", async () => {
    use('project', false, 'parent', true);
    expect((await request()).status).toBe(404);
    expect((await holding('project:parent')).status).toBe(404);
    expect((await request('admin')).status).toBe(200);
    // The same file used in the page itself is as open as that use.
    use('project');
    expect((await request()).status).toBe(200);
  });
});
