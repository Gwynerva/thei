import type { AiBuiltinTemplateKey } from '#layers/thei/shared/ai-template';
import type { EntityKey } from '../../../entity-kinds';
import type { ActionTarget } from '../../actions/target';
import type { ActionRow } from '../../actions/types';
import { describeSource } from './describe';
import { graphSource } from './graph';
import { linksSource } from './links';
import { proofreadSource } from './proofread';

/**
 * Where a built-in check finds its work. Each looks at subjects of its own —
 * the paragraphs of a text, the short texts of an entity, a link, an entity,
 * a file — and says which are due: those it never looked at, and those that
 * read otherwise now than when it last did. What it reads of a subject is
 * fingerprinted, and never what it writes there, so its own accepted
 * proposals do not hand the same subject back to it. A subject's parts each
 * belong to an area — titles, captions, statuses… — which the owner's words
 * may narrow a run to.
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
  /** `text:<kind>:<id>:<slot>`, `fields:<kind>:<id>`, `link:…`, `file:…` */
  subject: string;
  /** The entity it belongs to, if any: deleting it forgets the subject. */
  entity?: EntityKey;
  /** The family of files it belongs to: gone with the family, it is forgotten. */
  family?: string;
  /** What the model is shown of it in the run's request. */
  shown: string;
}

export interface DueInput {
  /** Only what belongs to these entities and files: a ✦'s, or those named. */
  scope?: readonly ActionTarget[];
  /** Only these areas of the source's own, as the owner's words ask. */
  areas?: ReadonlySet<string>;
  /** What the check has looked at, by subject. */
  covered: ReadonlyMap<string, Covered>;
  /** Subjects another run is looking at now. */
  busy: ReadonlySet<string>;
  /**
   * All of the scope at once, however much a run takes: what a run on
   * entities looked at already lets go of, to look at them from the start.
   */
  whole?: boolean;
}

export interface TemplateSource {
  /** The areas it looks at, each with what it holds, in English. */
  areas: Record<string, string>;
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
  describe: describeSource,
  links: linksSource,
  graph: graphSource,
};
