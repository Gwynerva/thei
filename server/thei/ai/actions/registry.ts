import {
  AI_ACTION_KINDS,
  type AiActionKind,
} from '#layers/thei/shared/ai-actions';
import { refuse as fail } from '../../entity-patch/text';
import {
  accessAction,
  fieldAction,
  periodsAction,
  updateAction,
} from './kinds/fields';
import { relationAction, tagsAction } from './kinds/links';
import { noteAction, reviseAction, writeAction } from './kinds/text';
import {
  memoryCompactAction,
  rememberAction,
  termAction,
} from './kinds/memory';
import { createAction, deleteAction } from './kinds/structure';
import { describeAction } from './kinds/media';
import type { AiActionKindDef } from './types';

/**
 * Every kind of action, by its name: the one place the site, the session
 * runner and MCP look a kind up. A new feature or field of an entity comes
 * with its action here (AGENTS.md), with one exception the owner made: a
 * video's poster frame has none — it is chosen by eye among the frames,
 * and a model is shown one frame and the sound, never enough to choose.
 */
export const AI_ACTION_DEFS: { [K in AiActionKind]: AiActionKindDef<K> } = {
  update: updateAction,
  field: fieldAction,
  periods: periodsAction,
  tags: tagsAction,
  relation: relationAction,
  note: noteAction,
  access: accessAction,
  write: writeAction,
  revise: reviseAction,
  create: createAction,
  delete: deleteAction,
  remember: rememberAction,
  term: termAction,
  'memory-compact': memoryCompactAction,
  describe: describeAction,
};

function isActionKind(value: unknown): value is AiActionKind {
  return (AI_ACTION_KINDS as readonly unknown[]).includes(value);
}

export function actionDef(kind: unknown): AiActionKindDef<AiActionKind> {
  if (!isActionKind(kind))
    fail(
      `There is no action "${String(kind)}". Kinds: ${AI_ACTION_KINDS.join(', ')}.`,
    );
  return AI_ACTION_DEFS[kind] as unknown as AiActionKindDef<AiActionKind>;
}
