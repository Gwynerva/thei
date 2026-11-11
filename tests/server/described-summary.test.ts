import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { CONTENT_OPENING_LENGTH } from '../../shared/content-opening';
import { OWNER, STRANGER } from '../../server/thei/access-links/viewer';
import {
  describedSummaries,
  describedSummary,
} from '../../server/thei/content/described';
import {
  findContentEntity,
  listContentEntities,
} from '../../server/thei/content-entities';
import { loadExcerptParent } from '../../server/thei/excerpts/parents';
import { findExcerpt } from '../../server/thei/excerpts';
import { listProjectSections } from '../../server/thei/projects/content-sections';
import {
  buildPublicProjectSection,
  buildPublicProjectSectionSummary,
} from '../../server/thei/public/entities';
import {
  buildPublicExcerpt,
  buildPublicExcerptCard,
} from '../../server/thei/public/excerpts';
import {
  excerptDocument,
  sectionDocument,
} from '../../server/thei/search/documents';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * A section or an excerpt the owner gave no summary is described by how its
 * text begins, wherever it is described — and only as far as the reader may
 * read the text. On its own page its summary stays the one the owner wrote.
 */
const { Public } = ProjectEventAccessLevel;
let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, serverRepositories);
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-10T12:00:00Z'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

const paragraph = (text: string) => ({ type: 'paragraph', data: { text } });
const edge = (side: 'start' | 'end') => ({
  type: 'privateSectionBoundary',
  data: { sectionId: 'hidden', edge: side },
});
/** An open sentence, a private one, an open one. */
const BODY = [
  paragraph('The stringers went on first.'),
  edge('start'),
  paragraph('What nobody should read.'),
  edge('end'),
  paragraph('Then the varnish.'),
];

function body(
  ownerType: 'project-section' | 'excerpt',
  ownerId: string,
  blocks: unknown[],
) {
  context.insert('content', {
    contentUuid: `content-${ownerId}`,
    ownerType,
    ownerId,
    slot: ownerType === 'excerpt' ? 'excerpt-body' : 'project-section-body',
    data: JSON.stringify({ blocks }),
    createdAt: 1,
    updatedAt: 1,
  });
}

function project() {
  context.insert('projects', {
    projectUuid: 'p',
    publicId: 'p',
    humanReadableSlug: 'p',
    title: 'p title',
    summary: 'p summary',
    access: Public,
    createdAt: 1,
    updatedAt: 1,
  });
}

function section(uuid: string, summary: string, blocks?: unknown[]) {
  context.db
    .insert(context.schema.projectContentSections)
    .values({
      sectionUuid: uuid,
      projectUuid: 'p',
      title: `${uuid} title`,
      summary,
      humanReadableSlug: uuid,
      publicId: uuid,
      isPrivate: false,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  if (blocks) body('project-section', uuid, blocks);
}

function excerpt(uuid: string, summary: string, blocks?: unknown[]) {
  context.insert('excerpts', {
    excerptUuid: uuid,
    parentType: 'project',
    parentId: 'p',
    title: `${uuid} title`,
    summary,
    humanReadableSlug: uuid,
    publicId: uuid,
    isPrivate: 0,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  });
  if (blocks) body('excerpt', uuid, blocks);
}

const sectionOf = (uuid: string) =>
  listProjectSections('p').find((item) => item.sectionUuid === uuid)!;

describe('what describes a section or an excerpt', () => {
  it('is its summary where it has one, and the text is not read', async () => {
    project();
    section('s', 'Written by hand', BODY);
    const read = vi.spyOn(context.server.content, 'findByOwner');
    expect(
      await describedSummary('project-section', 's', 'Written by hand', false),
    ).toBe('Written by hand');
    expect(read).not.toHaveBeenCalled();
  });

  it('is how its text begins otherwise, as far as the reader may read it', async () => {
    project();
    section('s', '', BODY);
    const stranger = await describedSummary('project-section', 's', '', false);
    expect(stranger).toMatch(
      /^The stringers went on first\. \[.+\] Then the varnish\.$/,
    );
    expect(stranger).not.toContain('nobody should read');
    expect(await describedSummary('project-section', 's', '', true)).toBe(
      'The stringers went on first. What nobody should read. Then the varnish.',
    );
  });

  it('is cut at a word, and nothing where there is no text', async () => {
    project();
    excerpt('long', '', [paragraph('It took days. '.repeat(60))]);
    excerpt('empty', '');
    const long = await describedSummary('excerpt', 'long', '', false);
    expect(long.length).toBeLessThanOrEqual(CONTENT_OPENING_LENGTH + 1);
    expect(long.endsWith('…')).toBe(true);
    expect(await describedSummary('excerpt', 'long', '', false, 20)).toBe(
      'It took days. It…',
    );
    expect(await describedSummary('excerpt', 'empty', '', false)).toBe('');
  });

  it('is nothing where the reader may read no word of the text', async () => {
    project();
    const hidden = [
      edge('start'),
      paragraph('What nobody should read.'),
      edge('end'),
    ];
    excerpt('hidden', '', hidden);
    // Not the mark of a private part alone: that describes nothing.
    expect(await describedSummary('excerpt', 'hidden', '', false)).toBe('');
    expect(await describedSummary('excerpt', 'hidden', '', true)).toBe(
      'What nobody should read.',
    );
    expect(
      describedSummaries('excerpt', [{ id: 'hidden', summary: '' }], false).get(
        'hidden',
      ),
    ).toBe('');
  });

  it('describes many of a kind the same way', () => {
    project();
    excerpt('a', 'A by hand', BODY);
    excerpt('b', '', BODY);
    excerpt('c', '');
    const described = describedSummaries(
      'excerpt',
      [
        { id: 'a', summary: 'A by hand' },
        { id: 'b', summary: '' },
        { id: 'c', summary: '' },
      ],
      true,
    );
    expect([...described]).toEqual([
      ['a', 'A by hand'],
      [
        'b',
        'The stringers went on first. What nobody should read. Then the varnish.',
      ],
      ['c', ''],
    ]);
  });
});

describe('a section without a summary', () => {
  beforeEach(() => {
    project();
    section('s', '', BODY);
  });

  it('is described on its card by its text, and keeps no summary on its page', async () => {
    const row = (await context.server.projects.findByUuid('p'))!;
    const card = await buildPublicProjectSectionSummary(row, sectionOf('s'));
    expect(card.summary).toMatch(/^The stringers went on first\. \[/);
    expect(card.summary).not.toContain('nobody should read');
    const own = await buildPublicProjectSectionSummary(
      row,
      sectionOf('s'),
      true,
    );
    expect(own.summary).toContain('What nobody should read.');
    const page = await buildPublicProjectSection(row, sectionOf('s'), STRANGER);
    expect(page.summary).toBe('');
  });

  it('is described the same in a link to it and in the picker', async () => {
    const reference = { entityType: 'project-section', entityId: 's' } as const;
    const stranger = await findContentEntity(reference, STRANGER);
    expect(stranger?.summary).toMatch(/^The stringers went on first\. \[/);
    expect(stranger?.summary).not.toContain('nobody should read');
    expect((await findContentEntity(reference, OWNER))?.summary).toContain(
      'What nobody should read.',
    );
    const listed = await listContentEntities(new Set(['project-section']));
    expect(listed[0]?.summary).toContain('What nobody should read.');
  });

  it('is described in a find by its text, found in the text alone', async () => {
    const found = (await sectionDocument('s', 'public'))!;
    expect(found.summary).toMatch(/^The stringers went on first\. \[/);
    expect(found.summary).not.toContain('nobody should read');
    expect(found.units.some((unit) => unit.where === 'summary')).toBe(false);
    expect((await sectionDocument('s', 'owner'))!.summary).toContain(
      'What nobody should read.',
    );
  });
});

describe('an excerpt without a summary', () => {
  beforeEach(() => {
    project();
    excerpt('x', '', BODY);
  });

  it('is described on its card by its text, and keeps no summary shown whole', async () => {
    const record = findExcerpt('x')!;
    const parent = (await loadExcerptParent('project', 'p'))!;
    const card = await buildPublicExcerptCard(record, parent, STRANGER);
    expect(card.summary).toMatch(/^The stringers went on first\. \[/);
    expect(card.summary).not.toContain('nobody should read');
    expect(
      (await buildPublicExcerptCard(record, parent, OWNER)).summary,
    ).toContain('What nobody should read.');
    expect((await buildPublicExcerpt(record, parent, STRANGER)).summary).toBe(
      '',
    );
  });

  it('is described the same in a link to it, in the picker and in a find', async () => {
    const reference = { entityType: 'excerpt', entityId: 'x' } as const;
    const stranger = await findContentEntity(reference, STRANGER);
    expect(stranger?.summary).toMatch(/^The stringers went on first\. \[/);
    expect(stranger?.summary).not.toContain('nobody should read');
    const listed = await listContentEntities(new Set(['excerpt']));
    expect(listed[0]?.summary).toContain('What nobody should read.');
    const found = (await excerptDocument('x', 'public'))!;
    expect(found.summary).toMatch(/^The stringers went on first\. \[/);
    expect(found.summary).not.toContain('nobody should read');
    expect(found.units.some((unit) => unit.where === 'summary')).toBe(false);
  });
});
