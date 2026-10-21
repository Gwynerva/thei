import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { searchActions } from '../../../server/thei/search/actions';
import { freshAiTestDb } from '../../helpers/fresh-ai-db';

/**
 * What the owner's quick search offers to do about the page they are on:
 * the other side of it, its editor or its page, whatever kind of page it is.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const SECTION = 's-11111111-1111-4111-8111-111111111111';
const TAG = 't-11111111-1111-4111-8111-111111111111';

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
  context.insert('project-content-sections', {
    sectionUuid: SECTION,
    projectUuid: PROJECT,
    title: 'Фонарь',
    summary: '',
    humanReadableSlug: 'fonar',
    publicId: 'Fonar1',
    isPrivate: 0,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  });
  context.insert('tags', {
    tagUuid: TAG,
    title: 'Моря',
    normalizedTitle: 'моря',
    slug: 'seas',
    publicId: 'Seas1',
    description: '',
    updatedAt: 1,
  });
});

afterEach(async () => {
  await context.close();
});

/** What is offered, with nothing typed, on the page at `path`. */
async function sideOf(path: string) {
  const actions = await searchActions({ q: '', today: '2026-10-20', path });
  return actions.find(
    (action) => action.type === 'edit' || action.type === 'view',
  );
}

describe('the other side of the page the owner is on', () => {
  it('is a section’s editor, its project’s form opening it', async () => {
    expect(
      await sideOf('/projects/mayak-Mayak1/sections/fonar-Fonar1/'),
    ).toEqual({
      type: 'edit',
      kind: 'project-section',
      title: 'Фонарь',
      href: `/admin/projects/${PROJECT}/edit/?section=Fonar1`,
    });
  });

  it('is a project’s editor, and the project’s page from it', async () => {
    expect(await sideOf('/projects/mayak-Mayak1/')).toMatchObject({
      type: 'edit',
      kind: 'project',
      href: `/admin/projects/${PROJECT}/edit/`,
    });
    expect(await sideOf(`/admin/projects/${PROJECT}/edit/`)).toMatchObject({
      type: 'view',
      kind: 'project',
      href: '/projects/mayak-Mayak1/',
    });
  });

  it('is a tag’s editor, and the tag’s page from it', async () => {
    expect(await sideOf('/tags/seas-Seas1/')).toEqual({
      type: 'edit',
      kind: 'tag',
      title: 'Моря',
      href: `/admin/tags/${TAG}/edit/`,
    });
    expect(await sideOf(`/admin/tags/${TAG}/edit/`)).toEqual({
      type: 'view',
      kind: 'tag',
      title: 'Моря',
      href: '/tags/seas-Seas1/',
    });
  });

  it('is nothing on a page that names no entity', async () => {
    expect(await sideOf('/search/')).toBeUndefined();
    expect(await sideOf('/projects/nobody-Nobody1/')).toBeUndefined();
  });
});
