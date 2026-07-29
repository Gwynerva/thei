import { describe, expect, it } from 'vitest';
import { rankProjectSearch } from '../../../shared/admin/project-search';

const projects = [
  project('p1', 'Alpha', 'first-project', 'PUBLIC1', 10),
  project('p2', 'Alphabet', 'alpha-slug', 'PUBLIC2', 50),
  project('p3', 'Contains alpha text', 'third', 'ALPHA', 30),
  project('p4', 'Recent', 'recent', 'RECENT', 100),
  project('p5', 'Older', 'older', 'OLDER', 20),
  project('p6', 'Newest', 'newest', 'NEWEST', 200),
];

describe('project search ranking', () => {
  it('returns the five most recently updated projects for an empty query', () => {
    expect(
      rankProjectSearch(projects, '').map((item) => item.projectUuid),
    ).toEqual(['p6', 'p4', 'p2', 'p3', 'p5']);
  });

  it('ranks exact, prefix, and substring matches across all fields', () => {
    expect(
      rankProjectSearch(projects, 'alpha').map((item) => item.projectUuid),
    ).toEqual(['p1', 'p2', 'p3']);
  });

  it('prioritizes title, then public ID, then slug matches', () => {
    const ranked = rankProjectSearch(
      [
        project('title', 'Contains needle', 'other', 'OTHER', 1),
        project('public', 'Other', 'other', 'NEEDLE', 1),
        project('slug', 'Other project', 'needle', 'OTHER2', 1),
      ],
      'needle',
    );
    expect(ranked.map((item) => item.projectUuid)).toEqual([
      'title',
      'public',
      'slug',
    ]);
  });

  it('matches case-insensitively and respects the limit', () => {
    expect(rankProjectSearch(projects, 'PUBLIC', 2)).toHaveLength(2);
  });
});

function project(
  projectUuid: string,
  title: string,
  humanReadableSlug: string,
  publicId: string,
  updatedAt: number,
) {
  return { projectUuid, title, humanReadableSlug, publicId, updatedAt };
}
