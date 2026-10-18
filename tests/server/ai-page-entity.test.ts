import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildEventUrl } from '../../shared/event-url';
import { buildProjectUrl } from '../../shared/project-url';
import { entityAtPath } from '../../server/thei/ai/page-entity';
import { freshAiTestDb } from '../helpers/fresh-ai-db';

/**
 * The entity a public page shows, found by the page's address: the admin
 * bar's ✦ offers a session about it there.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const EVENT = 'e-22222222-2222-4222-8222-222222222222';
const DIARY = 'd-33333333-3333-4333-8333-333333333333';

beforeEach(async () => {
  context = await freshAiTestDb();
  context.insert('projects', {
    projectUuid: PROJECT,
    title: 'Parapet',
    summary: 'A browser remake',
    access: 'public',
    humanReadableSlug: 'parapet',
    publicId: 'Parapet1',
    createdAt: 1,
    updatedAt: 2,
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

describe('the entity of a public page', () => {
  it('is found by the public address of a project, an event and a day', () => {
    expect(entityAtPath(buildProjectUrl('parapet', 'Parapet1'))).toEqual({
      ref: `project:${PROJECT}`,
      title: 'Parapet',
    });
    expect(entityAtPath(buildEventUrl('night', 'Night1'))).toEqual({
      ref: `event:${EVENT}`,
      title: 'Night of lanterns',
    });
    expect(entityAtPath('/diary/2026-10-13/')).toMatchObject({
      ref: 'diary-entry:2026-10-13',
    });
  });

  it('is none where a page shows no entity, or one that is gone', () => {
    expect(entityAtPath('/life/')).toBeUndefined();
    expect(entityAtPath('/events/')).toBeUndefined();
    expect(entityAtPath(buildEventUrl('gone', 'Gone1'))).toBeUndefined();
  });
});
