import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actionsById } from '../../server/thei/ai/sessions/view';
import { createSession } from '../../server/thei/ai/sessions/store';
import { proposeActions } from '../../server/thei/ai/actions/propose';
import { freshAiTestDb } from '../helpers/fresh-ai-db';

/**
 * An update is kept as its form keeps the fields it changes — `externalLinks`,
 * `humanReadableSlug` — and its card names them as a change does: each
 * item says by which name, and names the other ends of the relations it
 * lays, for the card to say them by.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  context = await freshAiTestDb();
  const { insert } = context;
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
  insert('diary-entries', {
    diaryUuid: 'd-1',
    date: '2026-10-13',
    access: 'public',
    createdAt: 1,
    updatedAt: 4,
  });
});

afterEach(async () => {
  await context.close();
});

describe('an update’s card', () => {
  it('names the fields its form keeps by the names a change gives them', async () => {
    const sessionUuid = createSession({ origin: 'owner', title: 'Test' });
    const { results } = await proposeActions({
      sessionUuid,
      actions: [
        {
          kind: 'update',
          target: `project:${PROJECT}`,
          changes: {
            slug: 'parapet-remake',
            links: [{ url: 'https://example.com/', note: 'Home' }],
            relations: [{ ref: 'diary-entry:2026-10-13', kind: 'related' }],
          },
        },
      ],
    });
    const result = results[0]!;
    if ('refused' in result) throw new Error(result.refused);
    const [item] = await actionsById([result.actionUuid]);
    expect(item!.fieldNames).toEqual({
      humanReadableSlug: 'slug',
      externalLinks: 'links',
      relations: 'relations',
    });
    // The relation's other end, for the card to name.
    expect(Object.values(item!.refs)).toEqual([
      expect.objectContaining({ type: 'diary-entry', id: 'd-1' }),
    ]);
  });
});
