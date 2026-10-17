import {
  findEntity,
  refOf,
  type EntityKey,
  type EntityKind,
} from '../../entity-kinds';
import { assetFamilyOf } from '../../assets/descriptions';

/**
 * What an action may be about: an entity of the archive, or a file of the
 * library. A file is no entity — it has no form, no page, no texts — so it
 * stays out of `ENTITY_KINDS`; an action names it as `asset:<id>`, and what
 * it changes of it, its description, is kept for its whole family.
 */

/** A file of the library, by the id of the file the action names. */
export interface FileKey {
  kind: 'asset';
  id: string;
}

export type ActionTarget = EntityKey | FileKey;
export type ActionTargetKind = EntityKind | FileKey['kind'];

/** The ref prefix a file is named by. */
const FILE_PREFIX = 'asset:';

export function isFileKey(
  key: Pick<ActionTarget, 'kind'> | undefined | null,
): key is FileKey {
  return key?.kind === 'asset';
}

/** A file's ref as a ref: `asset:<id>`. */
export function fileRef(assetUuid: string): string {
  return `${FILE_PREFIX}${assetUuid}`;
}

/** The library file a ref or a bare id names, when it is there. */
export function findFile(ref: unknown): FileKey | undefined {
  if (typeof ref !== 'string') return undefined;
  const value = ref.trim();
  const id = value.startsWith(FILE_PREFIX)
    ? value.slice(FILE_PREFIX.length).trim()
    : value;
  return id && assetFamilyOf(id) ? { kind: 'asset', id } : undefined;
}

/** The entity or the file a ref names, when it is there. */
export function findTarget(ref: unknown): ActionTarget | undefined {
  if (typeof ref === 'string' && ref.trim().startsWith(FILE_PREFIX))
    return findFile(ref);
  return findEntity(ref);
}

/** A target as a ref. */
export function targetRef(key: ActionTarget): string {
  return isFileKey(key) ? fileRef(key.id) : refOf(key);
}
