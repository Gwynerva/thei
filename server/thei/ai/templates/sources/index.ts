import type { AiBuiltinTemplateKey } from '#layers/thei/shared/ai-template';
import type { EntityKey } from '../../../entity-kinds';
import type { ActionRow } from '../../actions/types';
import { graphSource } from './graph';
import { linksSource } from './links';
import { proofreadSource } from './proofread';

/**
 * Where a built-in check finds its work. Each looks at subjects of its own —
 * the paragraphs of a text, a link, an entity, a file — and says which are
 * due: those it never looked at, and those that read otherwise now than when
 * it last did. What it reads of a subject is fingerprinted, and never what
 * it writes there, so its own accepted proposals do not hand the same
 * subject back to it.
 */

/** What a check has looked at of one subject. */
export interface Covered {
  /** What it read then, hashed. */
  fingerprint: string;
  /** The parts it went over, where it looks at less than the whole. */
  parts: string[];
}

/** One subject a run is given. */
export interface CheckItem extends Covered {
  /** `text:<kind>:<id>:<slot>`, `link:<ref>:<slot>:<link>`, `file:<family>`… */
  subject: string;
  /** The entity it belongs to, if any: deleting it forgets the subject. */
  entity?: EntityKey;
  /** What the model is shown of it in the run's request. */
  shown: string;
}

export interface DueInput {
  /** A run from an entity's ✦: only what belongs to it. */
  scope?: EntityKey;
  /** What the check has looked at, by subject. */
  covered: ReadonlyMap<string, Covered>;
  /** Subjects another run is looking at now. */
  busy: ReadonlySet<string>;
  /** Look at the scope again from the start, looked at or not. */
  force?: boolean;
}

export interface TemplateSource {
  /** What is due, one run's worth at most: the rest waits for the next. */
  due(input: DueInput): Promise<CheckItem[]>;
  /** What the model is asked to do with what it is given, in English. */
  brief(batch: readonly CheckItem[]): string;
  /**
   * What an applied action leaves looked at — a proofreading fix, the
   * paragraphs it mended — as the check would keep it now. `covered` is what
   * it kept of a subject before.
   */
  coveredBy?(
    action: ActionRow,
    covered: (subject: string) => Covered | undefined,
  ): CheckItem[];
}

export const TEMPLATE_SOURCES: Record<AiBuiltinTemplateKey, TemplateSource> = {
  proofread: proofreadSource,
  links: linksSource,
  graph: graphSource,
};
