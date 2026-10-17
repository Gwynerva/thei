import { desc } from 'drizzle-orm';
import { AI_OWNER_MEMORY_MAX } from '#layers/thei/shared/ai';
import type {
  AiMemoryEntityGroup,
  AiMemoryIndex,
} from '#layers/thei/shared/ai-memory';
import { normalizeTermText } from '#layers/thei/shared/text-terms';
import type { AiEntityRef, AiEntityType } from '#layers/thei/shared/ai';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { entityFaces, type EntityKind } from '../../entity-kinds';
import { relationIconMedia } from '../../relations';
import { fileRef } from '../actions/target';
import { libraryFile } from '../sessions/files';
import { listTerms, termItems } from '../terms';
import { factsSize, memoryItem, type MemoryRow } from './store';

/** Entities the Memory tab shows at a time. */
const GROUPS_PER_PAGE = 10;

/** The kinds a relation chip draws a picture for. */
const PICTURED = new Set(['project', 'event', 'diary-entry']);

/**
 * The Memory tab: «about you», the dictionary, what is kept about whole
 * kinds, and about entities — each entity with its records, a pair's under
 * both its ends, the latest first. A search keeps what its words are in: a
 * word or its note, a record, or the name of what a record is about.
 */
export async function memoryIndex(
  options: { q?: string; offset?: number } = {},
): Promise<AiMemoryIndex> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.aiMemory)
    .orderBy(desc(schema.aiMemory.updatedAt))
    .all() as MemoryRow[];
  const query = normalizeTermText(options.q ?? '').trim();
  const has = (...texts: (string | undefined)[]) =>
    !query ||
    texts.some((text) => text && normalizeTermText(text).includes(query));

  const owner = rows.filter((row) => row.anchor === 'owner');
  const kinds = rows.filter((row) => row.anchor === 'kind');

  // Each entity with the records about it; a pair's goes under both ends.
  // Grouped by the ids stored, and named in one read per kind: an entity
  // gone since is left out.
  const groups = new Map<
    string,
    { kind: EntityKind | 'asset'; id: string; rows: MemoryRow[] }
  >();
  for (const row of rows) {
    if (row.anchor !== 'entity' && row.anchor !== 'pair') continue;
    const ends = [
      [row.anchorType, row.anchorId],
      ...(row.anchor === 'pair' && row.otherType && row.otherId
        ? [[row.otherType, row.otherId]]
        : []),
    ] as [EntityKind | 'asset', string][];
    for (const [kind, id] of ends) {
      const group = groups.get(`${kind}:${id}`) ?? { kind, id, rows: [] };
      group.rows.push(row);
      groups.set(`${kind}:${id}`, group);
    }
  }
  const faces = entityFaces(
    [...groups.values()].flatMap((group) =>
      group.kind === 'asset' ? [] : [{ kind: group.kind, id: group.id }],
    ),
  );
  // A file is no entity: what is kept about it — a «never» of its
  // description — is named by the library.
  const files = new Map<string, MediaDescriptor | undefined>();
  const found = [...groups.entries()].flatMap(([id, group]) => {
    let ref: AiEntityRef;
    if (group.kind === 'asset') {
      const file = libraryFile(group.id);
      if (!file) return [];
      files.set(group.id, file.media);
      ref = {
        ref: fileRef(group.id),
        type: 'asset',
        id: group.id,
        title: file.slug,
      };
    } else {
      const face = faces.get(id);
      if (!face) return [];
      ref = {
        ref: face.ref,
        type: group.kind as AiEntityType,
        id: group.id,
        title: face.title,
        path: face.path,
      };
    }
    return has(ref.title) || group.rows.some((row) => has(row.text))
      ? [{ ...group, ref }]
      : [];
  });
  const offset = Math.max(0, options.offset ?? 0);
  const page = found.slice(offset, offset + GROUPS_PER_PAGE);
  const entities: AiMemoryEntityGroup[] = await Promise.all(
    page.map(async (group) => {
      const media =
        group.kind === 'asset'
          ? files.get(group.id)
          : PICTURED.has(group.kind)
            ? await relationIconMedia({
                type: group.kind as never,
                id: group.id,
              }).catch(() => undefined)
            : undefined;
      return {
        entity: group.ref,
        ...(media ? { media } : {}),
        items: group.rows.map(memoryItem),
        size: factsSize(group.rows.filter((row) => row.anchor === 'entity')),
      };
    }),
  );
  const records = new Set(
    found.flatMap((group) => group.rows.map((row) => row.memoryUuid)),
  );

  const terms = listTerms().filter((term) =>
    has(term.display, term.note, ...term.forms),
  );
  return {
    owner: {
      text: THEI_SERVER.config.mcp.instructions,
      max: AI_OWNER_MEMORY_MAX,
      never: owner.filter((row) => has(row.text)).map(memoryItem),
    },
    terms: termItems(terms),
    kinds: kinds.filter((row) => has(row.text)).map(memoryItem),
    entities,
    entityCount: found.length,
    recordCount: records.size,
    ...(offset + GROUPS_PER_PAGE < found.length
      ? { next: offset + GROUPS_PER_PAGE }
      : {}),
  };
}
