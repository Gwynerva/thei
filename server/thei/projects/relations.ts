import { and, eq, or } from 'drizzle-orm';
import type {
  ProjectRelationEditItem,
  ProjectRelationNote,
  ProjectRelationType,
} from '#layers/thei/shared/admin/project';
import type { ProjectRelationGetItem } from '#layers/thei/shared/api/project';
import type {
  StoredProjectRelationNote,
  StoredProjectRelationType,
} from '../db/schema/project-relations';
import { buildAdminAssetUrls } from '../assets/urls';
import { resolveEntityIconMedia } from '../media/generated-icon';

type PreparedProjectRelation = ProjectRelationEditItem & {
  firstProjectUuid: string;
  secondProjectUuid: string;
  storedType: StoredProjectRelationType;
  storedNote?: StoredProjectRelationNote;
};

export async function prepareProjectRelations(
  projectUuid: string,
  relations: ProjectRelationEditItem[] | undefined,
): Promise<PreparedProjectRelation[] | undefined> {
  if (relations === undefined) return undefined;

  for (const relation of relations) {
    if (relation.projectUuid === projectUuid)
      throw new Error('A project cannot be related to itself');
    const target = await THEI_SERVER.projects.findByUuid(relation.projectUuid);
    if (!target) throw new Error('Related project not found');
  }

  return relations.map((relation) => {
    const [firstProjectUuid, secondProjectUuid] = canonicalPair(
      projectUuid,
      relation.projectUuid,
    );
    return {
      ...relation,
      firstProjectUuid,
      secondProjectUuid,
      storedType: toStoredProjectRelationType(
        relation.type,
        projectUuid === firstProjectUuid,
      ),
      storedNote: toStoredProjectRelationNote(
        relation.note,
        projectUuid === firstProjectUuid,
      ),
    };
  });
}

export function applyProjectRelations(
  tx: any,
  schema: any,
  projectUuid: string,
  relations: PreparedProjectRelation[] | undefined,
) {
  if (relations === undefined) return;
  const existing = tx
    .select()
    .from(schema.projectRelations)
    .where(
      or(
        eq(schema.projectRelations.firstProjectUuid, projectUuid),
        eq(schema.projectRelations.secondProjectUuid, projectUuid),
      ),
    )
    .all();
  const nextPairs = new Set(
    relations.map((item) =>
      pairKey(item.firstProjectUuid, item.secondProjectUuid),
    ),
  );

  for (const row of existing) {
    if (!nextPairs.has(pairKey(row.firstProjectUuid, row.secondProjectUuid))) {
      tx.delete(schema.projectRelations)
        .where(
          and(
            eq(schema.projectRelations.firstProjectUuid, row.firstProjectUuid),
            eq(
              schema.projectRelations.secondProjectUuid,
              row.secondProjectUuid,
            ),
          ),
        )
        .run();
    }
  }

  for (let index = 0; index < relations.length; index++) {
    const relation = relations[index]!;
    const currentIsFirst = relation.firstProjectUuid === projectUuid;
    const previous = existing.find(
      (row: any) =>
        row.firstProjectUuid === relation.firstProjectUuid &&
        row.secondProjectUuid === relation.secondProjectUuid,
    );
    const otherProjectUuid = relation.projectUuid;
    const otherSortOrder =
      previous === undefined
        ? nextProjectRelationOrder(tx, schema, otherProjectUuid)
        : currentIsFirst
          ? previous.secondSortOrder
          : previous.firstSortOrder;

    tx.insert(schema.projectRelations)
      .values({
        firstProjectUuid: relation.firstProjectUuid,
        secondProjectUuid: relation.secondProjectUuid,
        type: relation.storedType,
        note: relation.storedNote,
        firstSortOrder: currentIsFirst ? index : otherSortOrder,
        secondSortOrder: currentIsFirst ? otherSortOrder : index,
      })
      .onConflictDoUpdate({
        target: [
          schema.projectRelations.firstProjectUuid,
          schema.projectRelations.secondProjectUuid,
        ],
        set: {
          type: relation.storedType,
          note: relation.storedNote,
          ...(currentIsFirst
            ? { firstSortOrder: index }
            : { secondSortOrder: index }),
        },
      })
      .run();
  }
}

export function deleteProjectRelations(
  tx: any,
  schema: any,
  projectUuid: string,
) {
  tx.delete(schema.projectRelations)
    .where(
      or(
        eq(schema.projectRelations.firstProjectUuid, projectUuid),
        eq(schema.projectRelations.secondProjectUuid, projectUuid),
      ),
    )
    .run();
}

export async function getProjectRelations(
  projectUuid: string,
): Promise<ProjectRelationGetItem[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.projectRelations)
    .where(
      or(
        eq(schema.projectRelations.firstProjectUuid, projectUuid),
        eq(schema.projectRelations.secondProjectUuid, projectUuid),
      ),
    )
    .all()
    .sort(
      (a, b) => relationOrder(a, projectUuid) - relationOrder(b, projectUuid),
    );

  return await Promise.all(
    rows.map(async (row) => {
      const currentIsFirst = row.firstProjectUuid === projectUuid;
      const relatedProjectUuid = currentIsFirst
        ? row.secondProjectUuid
        : row.firstProjectUuid;
      const project = await THEI_SERVER.projects.findByUuid(relatedProjectUuid);
      if (!project) throw new Error('Related project not found');
      const iconUsage = (
        await THEI_SERVER.assets.usages.findByContainer(
          'project',
          relatedProjectUuid,
        )
      ).find((usage) => usage.role === 'icon');
      const iconMedia = resolveEntityIconMedia(
        'project',
        relatedProjectUuid,
        iconUsage
          ? (await buildAdminAssetUrls(iconUsage.asset)).media!
          : undefined,
      );

      return {
        projectUuid: relatedProjectUuid,
        title: project.title,
        humanReadableSlug: project.humanReadableSlug,
        publicId: project.publicId,
        type: fromStoredProjectRelationType(row.type, currentIsFirst),
        note: fromStoredProjectRelationNote(
          row.note ?? undefined,
          currentIsFirst,
        ),
        iconMedia,
      };
    }),
  );
}

function canonicalPair(a: string, b: string): [string, string] {
  return a.localeCompare(b) < 0 ? [a, b] : [b, a];
}

function pairKey(first: string, second: string) {
  return `${first}\0${second}`;
}

export function toStoredProjectRelationType(
  type: ProjectRelationType,
  currentIsFirst: boolean,
): StoredProjectRelationType {
  if (type === 'related') return 'related';
  const currentInfluencesOther = type === 'dependent';
  return currentInfluencesOther === currentIsFirst
    ? 'first-influences-second'
    : 'second-influences-first';
}

export function fromStoredProjectRelationType(
  type: StoredProjectRelationType,
  currentIsFirst: boolean,
): ProjectRelationType {
  if (type === 'related') return 'related';
  const firstInfluencesSecond = type === 'first-influences-second';
  const currentInfluencesOther = firstInfluencesSecond === currentIsFirst;
  return currentInfluencesOther ? 'dependent' : 'influencing';
}

export function toStoredProjectRelationNote(
  note: ProjectRelationNote | undefined,
  currentIsFirst: boolean,
): StoredProjectRelationNote | undefined {
  if (!note || note.type === 'shared') return note;
  return {
    type: 'split',
    firstProjectText: currentIsFirst
      ? note.currentProjectText
      : note.relatedProjectText,
    secondProjectText: currentIsFirst
      ? note.relatedProjectText
      : note.currentProjectText,
  };
}

export function fromStoredProjectRelationNote(
  note: StoredProjectRelationNote | undefined,
  currentIsFirst: boolean,
): ProjectRelationNote | undefined {
  if (!note || note.type === 'shared') return note;
  return {
    type: 'split',
    currentProjectText: currentIsFirst
      ? note.firstProjectText
      : note.secondProjectText,
    relatedProjectText: currentIsFirst
      ? note.secondProjectText
      : note.firstProjectText,
  };
}

function relationOrder(row: any, projectUuid: string) {
  return row.firstProjectUuid === projectUuid
    ? row.firstSortOrder
    : row.secondSortOrder;
}

function nextProjectRelationOrder(tx: any, schema: any, projectUuid: string) {
  const rows = tx
    .select({
      firstProjectUuid: schema.projectRelations.firstProjectUuid,
      firstSortOrder: schema.projectRelations.firstSortOrder,
      secondSortOrder: schema.projectRelations.secondSortOrder,
    })
    .from(schema.projectRelations)
    .where(
      or(
        eq(schema.projectRelations.firstProjectUuid, projectUuid),
        eq(schema.projectRelations.secondProjectUuid, projectUuid),
      ),
    )
    .all();
  return (
    rows.reduce(
      (max: number, row: any) =>
        Math.max(
          max,
          row.firstProjectUuid === projectUuid
            ? row.firstSortOrder
            : row.secondSortOrder,
        ),
      -1,
    ) + 1
  );
}
