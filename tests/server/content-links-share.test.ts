import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { resolveContentEntityLink } from '../../server/thei/content-links/resolve';
import {
  OWNER,
  STRANGER,
  type PublicViewer,
} from '../../server/thei/access-links/viewer';
import { freshTestDb } from '../helpers/fresh-db';

let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  const { db, schema } = context;
  Object.assign(context.server, {
    useDb: () => context,
    projects: {
      findByUuid: async (projectUuid: string) =>
        db
          .select()
          .from(schema.projects)
          .where(eq(schema.projects.projectUuid, projectUuid))
          .get(),
    },
    content: {
      findByOwner: async () => undefined,
      buildFieldValue: async () => undefined,
    },
    assets: { usages: { findByContainer: async () => [] } },
  });
  for (const projectUuid of ['A', 'B']) {
    db.insert(schema.projects)
      .values({
        projectUuid,
        publicId: projectUuid,
        humanReadableSlug: projectUuid.toLowerCase(),
        title: `Project ${projectUuid}`,
        summary: '',
        access: ProjectEventAccessLevel.Public,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.projectContentSections)
      .values({
        sectionUuid: `${projectUuid}-section`,
        projectUuid,
        title: `Private section of ${projectUuid}`,
        summary: '',
        humanReadableSlug: 'section',
        publicId: `${projectUuid}Section`,
        isPrivate: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
  }
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

const sectionOf = (projectUuid: string) => ({
  kind: 'entity' as const,
  entityType: 'project-section' as const,
  entityId: `${projectUuid}-section`,
});

describe('content links through a share link', () => {
  const holderOfA: PublicViewer = {
    isAdmin: false,
    grants: new Set(['project:A']),
  };

  it("resolves the shared project's own private section", async () => {
    expect(
      await resolveContentEntityLink(holderOfA, sectionOf('A'), false),
    ).toMatchObject({
      state: 'resolved',
      title: 'Private section of A',
      href: '/projects/a-A/sections/section-ASection/',
    });
  });

  it("keeps another project's private section as a dead link", async () => {
    const other = await resolveContentEntityLink(
      holderOfA,
      sectionOf('B'),
      false,
    );
    expect(other).toEqual({
      ...sectionOf('B'),
      state: 'broken',
      reason: 'not-found',
    });
    expect(JSON.stringify(other)).not.toContain('Private section of B');
  });

  it('answers a stranger and the owner as before', async () => {
    expect(
      await resolveContentEntityLink(STRANGER, sectionOf('A'), false),
    ).toMatchObject({ state: 'broken' });
    expect(
      await resolveContentEntityLink(OWNER, sectionOf('B'), true),
    ).toMatchObject({ state: 'resolved' });
  });
});
