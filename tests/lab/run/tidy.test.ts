// What a play leaves to be deleted: only what it said it made and what was
// made while it ran — never what the site was seeded with, never the
// owner's own things on the playground, never a tag it did not name.
import { describe, expect, it } from 'vitest';
import type { SiteIndex } from '../types';
import { selectMade, tidy, type TidySite } from './tidy';

const since = 1_000_000;

describe('tidying after a play', () => {
  it('takes what the play named and what was made while it ran', () => {
    const doomed = selectMade({
      created: [
        { kind: 'diary', uuid: 'named-entry' },
        { kind: 'tag', uuid: 'named-tag' },
      ],
      lists: {
        project: [
          { projectUuid: 'owner-project', createdAt: since - 60_000 },
          { projectUuid: 'made-project', createdAt: since + 5 },
        ],
        event: [{ eventUuid: 'made-at-start', createdAt: since }],
        diary: [
          { diaryUuid: 'named-entry', createdAt: since + 10 },
          { diaryUuid: 'no-time', createdAt: undefined },
        ],
      },
      known: new Set(),
      since,
    });
    expect(doomed).toEqual([
      { kind: 'diary', uuid: 'named-entry' },
      { kind: 'tag', uuid: 'named-tag' },
      { kind: 'project', uuid: 'made-project' },
      { kind: 'event', uuid: 'made-at-start' },
    ]);
  });

  it('never takes what the site was seeded with', () => {
    expect(
      selectMade({
        created: [{ kind: 'event', uuid: 'seeded' }],
        lists: { event: [{ eventUuid: 'seeded', createdAt: since + 1 }] },
        known: new Set(['seeded']),
        since,
      }),
    ).toEqual([]);
  });

  it('deletes through the admin and leaves the rest of the site alone', async () => {
    const requests: string[] = [];
    const lists: Record<string, unknown[]> = {
      '/api/admin/projects': [
        { projectUuid: 'mine', createdAt: since - 1 },
        { projectUuid: 'made', createdAt: since + 1 },
      ],
      '/api/admin/events': [],
      '/api/admin/diary': [],
      '/api/admin/pages': [{ pageUuid: 'agents-page', createdAt: 5 }],
    };
    const site = {
      async request(method: string, path: string) {
        requests.push(`${method} ${path}`);
        if (method === 'GET' && path === '/api/admin/tags')
          return {
            status: 200,
            body: [{ tagUuid: 'someone-elses-tag' }],
            text: '',
          };
        if (method === 'GET')
          return {
            status: 200,
            body: { items: lists[path.split('?')[0]!] ?? [] },
            text: '',
          };
        return { status: 204, body: undefined, text: '' };
      },
      ok: (_what: string, answer: unknown) => answer,
    } as unknown as TidySite;
    const index = { entities: {} } as unknown as SiteIndex;
    const result = await tidy(
      site,
      index,
      { forms: [] },
      { created: [], since },
    );
    expect(result.deleted).toEqual(['project made']);
    expect(requests.filter((request) => !request.startsWith('GET'))).toEqual([
      'DELETE /api/admin/projects/made',
    ]);
  });
});
