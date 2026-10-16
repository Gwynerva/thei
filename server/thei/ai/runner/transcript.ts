import type { AiTranscriptTurn } from '#layers/thei/shared/ai';

type ToolTurn = Extract<AiTranscriptTurn, { role: 'tool' }>;

/** What a call asked for and never answered is told it got. */
const UNANSWERED = 'Stopped before it ran.';

/**
 * The conversation put right for a model to go on with: every call the model
 * asked for is answered right after it, in the order it asked — one never
 * answered, because its turn was stopped or the process ended, with a note
 * it did not run — and an answer to no call is dropped. A service refuses a
 * conversation that breaks either rule.
 */
export function repairTranscript(
  turns: readonly AiTranscriptTurn[],
): AiTranscriptTurn[] {
  const out: AiTranscriptTurn[] = [];
  let at = 0;
  while (at < turns.length) {
    const turn = turns[at++]!;
    if (turn.role === 'tool') continue;
    out.push(turn);
    if (turn.role !== 'assistant') continue;
    const answers = new Map<string, ToolTurn>();
    while (turns[at]?.role === 'tool') {
      const answer = turns[at++] as ToolTurn;
      if (!answers.has(answer.id)) answers.set(answer.id, answer);
    }
    for (const call of turn.calls ?? [])
      out.push(
        answers.get(call.id) ?? {
          role: 'tool',
          id: call.id,
          name: call.name,
          output: UNANSWERED,
          error: true,
        },
      );
  }
  return out;
}
