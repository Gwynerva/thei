import type {
  AiEntityRef,
  AiEntityType,
  AiMemoryAnchor,
  AiMemoryType,
  AiTerm,
} from './ai';
import type { MediaDescriptor } from './media';

/**
 * What the AI remembers, as the Memory tab and the forms show it. A record
 * is anchored to what it is about — an entity, a pair of them, a kind of
 * entity — and a model reads it only together with that. The owner's own
 * words, «about you», are read in every session; they are kept in the
 * settings, beside the switch.
 */

/** How long one record may be: a fact is a sentence or two. */
export const AI_MEMORY_TEXT_MAX = 400;

/** The session a record or a word came from, while that session lives. */
export interface AiMemorySource {
  sessionUuid: string;
  title: string;
}

export interface AiMemoryItem {
  memoryUuid: string;
  anchor: AiMemoryAnchor;
  /** What it is about: the entity, or the first of a pair. */
  entity?: AiEntityRef;
  /** The other end of a pair. */
  other?: AiEntityRef;
  /** For a kind: which kind of entity. */
  kind?: AiEntityType;
  type: AiMemoryType;
  text: string;
  session?: AiMemorySource;
  createdAt: number;
  updatedAt: number;
}

/** One entity with all it is remembered by, alone or with another. */
export interface AiMemoryEntityGroup {
  entity: AiEntityRef;
  /** The picture that stands for it, as on its relation chip. */
  media?: MediaDescriptor;
  items: AiMemoryItem[];
  /** The characters its facts take, against `AI_ANCHOR_MEMORY_MAX`. */
  size: number;
}

/** A word of the dictionary, with how often the archive uses it. */
export interface AiTermItem extends AiTerm {
  /** How many texts of the archive use it, in any of its forms. */
  uses: number;
}

/** The Memory tab whole, or what its search finds. */
export interface AiMemoryIndex {
  owner: { text: string; max: number; never: AiMemoryItem[] };
  terms: AiTermItem[];
  kinds: AiMemoryItem[];
  entities: AiMemoryEntityGroup[];
  /** The entities remembered by, and their records, in all. */
  entityCount: number;
  recordCount: number;
  /** Pass as `offset` for the next groups; absent at the end. */
  next?: number;
}

/** What an entity's form shows of it: its memory and the model's digest. */
export interface AiEntityMemory {
  entity: AiEntityRef;
  items: AiMemoryItem[];
  size: number;
  max: number;
  digest?: { text: string; fresh: boolean; model: string; at: number };
}
