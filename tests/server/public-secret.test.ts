import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { isPublicSecret } from '../../shared/api/public';
import {
  buildPublicEvent,
  buildPublicEventSummary,
} from '../../server/thei/public/entities';
import { buildSecretReference } from '../../server/thei/public/secret';
import { freshTestDb } from '../helpers/fresh-db';

let context: Awaited<ReturnType<typeof freshTestDb>>;
let otherFiles: unknown[] = [];

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    projects: {
      findByUuid: async (projectUuid: string) =>
        context.db
          .select()
          .from(context.schema.projects)
          .all()
          .find((project) => project.projectUuid === projectUuid),
    },
    assets: {
      findBySlug: async () => undefined,
      usages: {
        findByContainer: async () => [],
        findOtherForContainer: async () => otherFiles,
      },
    },
    content: { findByOwner: async () => undefined },
  });
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

function insertProject(projectUuid: string, access: ProjectEventAccessLevel) {
  context.db
    .insert(context.schema.projects)
    .values({
      projectUuid,
      publicId: `${projectUuid}-public-id`,
      humanReadableSlug: `${projectUuid}-slug`,
      title: `${projectUuid} title`,
      summary: `${projectUuid} summary`,
      access,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
}

describe('secret references', () => {
  it('keeps a stable codename and icon without exposing anything else', () => {
    const first = buildSecretReference('project', 'p-hidden');
    expect(buildSecretReference('project', 'p-hidden')).toEqual(first);
    expect(Object.keys(first).sort()).toEqual([
      'iconMedia',
      'key',
      'secret',
      'summary',
      'title',
    ]);
    expect(first.title).toMatch(/^Secret project \S+$/);
    expect(THEI_SERVER.language.secretSummaries).toContain(first.summary);
    expect(first.iconMedia.src).toMatch(
      /^\/media\/generated-icons\/secret\/[a-f0-9]{64}\.avif$/,
    );
    expect(JSON.stringify(first)).not.toContain('p-hidden');
    expect(buildSecretReference('event', 'p-hidden').title).toMatch(
      /^Secret event /,
    );
  });

  it('lists related projects a visitor may not open as secrets', async () => {
    insertProject('open', ProjectEventAccessLevel.Public);
    insertProject('hidden', ProjectEventAccessLevel.Private);
    insertProject('unlisted', ProjectEventAccessLevel.LinkOnly);
    context.db
      .insert(context.schema.events)
      .values({
        eventUuid: 'event',
        publicId: 'event',
        humanReadableSlug: 'event',
        title: 'Event',
        summary: '',
        access: ProjectEventAccessLevel.Public,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    context.db
      .insert(context.schema.eventProjectRelations)
      .values(
        ['open', 'hidden', 'unlisted'].map((projectUuid, sortOrder) => ({
          eventUuid: 'event',
          projectUuid,
          sortOrder,
        })),
      )
      .run();
    const event = context.db.select().from(context.schema.events).get()!;

    const visitor = await buildPublicEventSummary(event, false);
    const related = visitor.relatedProjects!;
    expect(related.map((project) => isPublicSecret(project))).toEqual([
      false,
      true,
      true,
    ]);
    for (const project of related.slice(1)) {
      const serialized = JSON.stringify(project);
      expect(serialized).not.toMatch(/hidden (title|summary)|hidden-|unlisted/);
      expect(project).not.toHaveProperty('href');
      // Event relations have no type, so none is shown.
      expect(project).not.toHaveProperty('relationType');
    }

    const admin = await buildPublicEventSummary(event, true);
    expect(admin.relatedProjects!.some(isPublicSecret)).toBe(false);
  });

  it('shows private files as secrets that cannot be opened', async () => {
    const file = (assetUuid: string, isPrivate: boolean) => ({
      asset: {
        assetUuid,
        slug: `${assetUuid}-slug`,
        extension: 'pdf',
        size: 1234,
        meta: {},
      },
      meta: {
        role: 'other-asset',
        order: 0,
        title: `${assetUuid} title`,
        caption: `${assetUuid} caption`,
        isPrivate,
      },
    });
    otherFiles = [file('open-file', false), file('hidden-file', true)];
    context.db
      .insert(context.schema.events)
      .values({
        eventUuid: 'event',
        publicId: 'event',
        humanReadableSlug: 'event',
        title: 'Event',
        summary: '',
        access: ProjectEventAccessLevel.Public,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    const event = context.db.select().from(context.schema.events).get()!;

    const visitor = (await buildPublicEvent(event, false)).references.files
      .manual;
    expect(visitor.map(isPublicSecret)).toEqual([false, true]);
    expect(visitor[1]!.title).toMatch(/^Secret file \S+$/);
    expect(JSON.stringify(visitor[1])).not.toMatch(/hidden-file|pdf|1234/);
    expect(visitor[1]).not.toHaveProperty('href');

    const admin = (await buildPublicEvent(event, true)).references.files.manual;
    expect(admin.some(isPublicSecret)).toBe(false);
  });
});
