import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getQuery,
  toWebHandler,
} from 'h3';
import { buildEventUrl } from '../../shared/event-url';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '../../shared/project-url';
import { freshAiTestDb } from '../helpers/fresh-ai-db';

/**
 * The entity a public page shows, found by the page's address: the admin
 * bar's ✦ offers a session about it there.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const OTHER = 'p-44444444-4444-4444-8444-444444444444';
const SECTION = 's-55555555-5555-4555-8555-555555555555';
const EVENT = 'e-22222222-2222-4222-8222-222222222222';
const DIARY = 'd-33333333-3333-4333-8333-333333333333';

beforeEach(async () => {
  context = await freshAiTestDb();
  Object.assign(globalThis, { defineEventHandler, createError, getQuery });
  const project = (projectUuid: string, title: string, publicId: string) =>
    context.insert('projects', {
      projectUuid,
      title,
      summary: 'A browser remake',
      access: 'public',
      humanReadableSlug: title.toLowerCase(),
      publicId,
      createdAt: 1,
      updatedAt: 2,
    });
  project(PROJECT, 'Parapet', 'Parapet1');
  project(OTHER, 'Lanterns', 'Lantern1');
  context.insert('project-content-sections', {
    sectionUuid: SECTION,
    projectUuid: PROJECT,
    title: 'The first level',
    humanReadableSlug: 'first',
    publicId: 'Level1',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  });
  context.insert('events', {
    eventUuid: EVENT,
    title: 'Night of lanterns',
    summary: 'A night',
    access: 'public',
    humanReadableSlug: 'night',
    publicId: 'Night1',
    createdAt: 1,
    updatedAt: 2,
  });
  context.insert('diary-entries', {
    diaryUuid: DIARY,
    date: '2026-10-13',
    access: 'public',
    createdAt: 1,
    updatedAt: 2,
  });
});

afterEach(async () => {
  await context.close();
});

/** What the admin bar is told of a page, by its route. */
async function entityAt(path: string) {
  const handler = (await import('../../server/api/admin/ai/entity-at.get'))
    .default;
  const handle = toWebHandler(
    createApp().use(createRouter().get('/entity-at', handler)),
  );
  const response = await handle(
    new Request(`http://localhost/entity-at?path=${encodeURIComponent(path)}`),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { entity: unknown }).entity;
}

describe('the entity of a public page', () => {
  it('is found by the public address of a project, a section, an event and a day', async () => {
    expect(await entityAt(buildProjectUrl('parapet', 'Parapet1'))).toEqual({
      ref: `project:${PROJECT}`,
      title: 'Parapet',
    });
    expect(
      await entityAt(
        buildProjectSectionUrl('parapet', 'Parapet1', 'first', 'Level1'),
      ),
    ).toEqual({ ref: `project-section:${SECTION}`, title: 'The first level' });
    expect(await entityAt(buildEventUrl('night', 'Night1'))).toEqual({
      ref: `event:${EVENT}`,
      title: 'Night of lanterns',
    });
    expect(await entityAt('/diary/2026-10-13/')).toMatchObject({
      ref: 'diary-entry:2026-10-13',
    });
  });

  it('is none where a page shows no entity, or one that is gone', async () => {
    expect(await entityAt('/life/')).toBeNull();
    expect(await entityAt('/events/')).toBeNull();
    expect(await entityAt(buildEventUrl('gone', 'Gone1'))).toBeNull();
  });

  it('is none for a section put under another project, or a broken address', async () => {
    expect(
      await entityAt(
        buildProjectSectionUrl('lanterns', 'Lantern1', 'first', 'Level1'),
      ),
    ).toBeNull();
    expect(await entityAt('/pages/%E0%A4%A/')).toBeNull();
  });
});
