import { createHash } from 'node:crypto';
import type { AiTranscriptTurn } from '#layers/thei/shared/ai';
import { utcDayOf } from '#layers/thei/shared/date-range';
import { fingerprintOf } from '../actions/declined';
import {
  turnFiles,
  type StreamFile,
  type StreamFileKind,
  type StreamTool,
} from '../model/stream';

/**
 * What a session's turns are sent before the conversation, kept the same
 * from turn to turn.
 *
 * A model's thinking is bound to everything sent before it: the
 * instructions, the tools and every earlier message. Sent again over
 * anything else, it is refused — and a service may refuse the whole
 * request for it. So a session sends what its first answered request was
 * sent, byte for byte, and only ever adds to the conversation: a new day,
 * or instructions of the owner's that changed, are told as a note in the
 * turn they are noticed in, never written into what came before.
 *
 * Whatever still changes underneath — a tool the update rewrote, another
 * model, a file gone from the library — is caught by comparing what the
 * last request carried with what the next one would: then the thinking
 * that came before is no longer sent. Leaving out a leading run of it is
 * the one change a model's service takes; what is thought from then on
 * stays good.
 */

export interface AiSessionContext {
  /** The instructions every turn is sent, as the first answered one was. */
  system: string;
  /** What the tools offered with them said, digested. */
  toolsDigest: string;
  /** The service and model the conversation was last sent to. */
  provider: string;
  model: string;
  /** The day, on the server's clock, the model was last told it is. */
  day: string;
  /** The owner's own instructions the model last read, digested. */
  instructionsDigest: string;
  /** Kinds of a file's blocks the service turned away: told in words. */
  unshown: StreamFileKind[];
  /** The thinking of messages before this one, by `seq`, is sent no more. */
  thinkingFrom?: number;
  /** What the last request carried before its answer: its turns and digest. */
  sent?: { turns: number; digest: string };
}

/** The day it is on the server's clock, as the overview says it. */
export function serverDay(now = Date.now()): string {
  return utcDayOf(now);
}

/** What the offered tools say, in the order they are offered. */
export function toolsDigest(tools: readonly StreamTool[]): string {
  return fingerprintOf(
    tools.map(({ name, description, inputSchema }) => [
      name,
      description,
      inputSchema,
    ]),
  );
}

const THINKING = new Set(['thinking', 'redacted_thinking']);

/** Whether a turn carries a model's thinking, as its provider gave it. */
export function hasThinking(turn: AiTranscriptTurn): boolean {
  return (
    turn.role === 'assistant' &&
    Array.isArray(turn.native?.content) &&
    (turn.native.content as { type?: unknown }[]).some((block) =>
      THINKING.has(String(block?.type)),
    )
  );
}

/** A turn with its thinking left out: what it says and asks for stays. */
export function withoutThinking(turn: AiTranscriptTurn): AiTranscriptTurn {
  if (!hasThinking(turn) || turn.role !== 'assistant') return turn;
  return {
    ...turn,
    native: {
      ...turn.native!,
      content: (turn.native!.content as { type?: unknown }[]).filter(
        (block) => !THINKING.has(String(block?.type)),
      ),
    },
  };
}

/**
 * What a request carries before its answer, digested — thinking aside, which
 * may be left out without changing what follows it. Two requests whose
 * digests agree were sent the same instructions, tools and conversation.
 */
export function promptDigest(input: {
  system: string;
  toolsDigest: string;
  provider: string;
  model: string;
  unshown: readonly StreamFileKind[];
  turns: readonly AiTranscriptTurn[];
  files: ReadonlyMap<string, StreamFile[]>;
}): string {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify([
      input.system,
      input.toolsDigest,
      input.provider,
      input.model,
      [...input.unshown].sort(),
    ]),
  );
  const shown = new Set<string>();
  for (const turn of input.turns) {
    hash.update(JSON.stringify(withoutThinking(turn)));
    for (const id of turnFiles(turn)) shown.add(id);
  }
  // A file's blocks as they were shown: their bytes, not where they came from.
  for (const id of [...shown].sort()) {
    hash.update(`\n${id}:`);
    for (const block of input.files.get(id) ?? [])
      hash.update(
        JSON.stringify([
          block.kind,
          block.name,
          'data' in block ? block.data : block.text,
          'cutAt' in block ? (block.cutAt ?? null) : null,
        ]),
      );
  }
  return hash.digest('hex');
}
