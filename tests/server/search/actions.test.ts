import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { searchActions } from '../../../server/thei/search/actions';
import { freshAiTestDb } from '../../helpers/fresh-ai-db';

/**
 * What the owner's quick search offers to do. The admin bar already holds
 * the day's diary and the other side of the page the owner is on, so the
 * search repeats neither.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  context = await freshAiTestDb();
  context.insert('projects', {
    projectUuid: PROJECT,
    title: 'Маяк',
    summary: '',
    access: 'public',
    humanReadableSlug: 'mayak',
    publicId: 'Mayak1',
    createdAt: 1,
    updatedAt: 1,
  });
});

afterEach(async () => {
  await context.close();
});

describe('what the owner is offered', () => {
  it('is only what they saved last, with nothing typed', () => {
    expect(searchActions({ q: '', today: '2026-10-20' })).toEqual([
      {
        type: 'recent',
        kind: 'project',
        title: 'Маяк',
        href: `/admin/projects/${PROJECT}/edit/`,
        updatedAt: 1,
      },
    ]);
  });

  it('leads with the diary of the day a query names', () => {
    expect(searchActions({ q: 'сегодня', today: '2026-10-20' })[0]).toEqual({
      type: 'diary',
      date: '2026-10-20',
      today: true,
      exists: false,
      href: '/admin/diary/new/?date=2026-10-20',
    });
  });
});
