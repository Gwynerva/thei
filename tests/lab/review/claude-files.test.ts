// The workflow, the agent and the skill name each other; a rename of one
// must not leave the others behind.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../config';
import type { ReviewSummary } from '../types';

const read = (file: string) => readFileSync(join(repoRoot, file), 'utf8');

interface Call {
  prompt: string;
  options: { label?: string; agentType?: string; schema?: object };
}

/**
 * Runs the workflow script as the Workflow tool would, with `agent()` stood
 * in for: `known` says whether the session knows the lab-reviewer agent.
 */
async function runWorkflow(args: unknown, known: boolean) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const body = read('.claude/workflows/lab-review.js').replace(
    /^export const meta/m,
    'const meta',
  );
  const run = new Function(
    'args',
    'agent',
    'parallel',
    'log',
    'phase',
    `return (async () => {
${body}
})();`,
  );
  const result = await run(
    args,
    async (prompt: string, options: Call['options']) => {
      calls.push({ prompt, options });
      if (options.agentType && !known)
        throw new Error(`agent type '${options.agentType}' not found`);
      return { job: options.label!.split(' ')[0], review: 'R1', wrote: true };
    },
    async (thunks: (() => Promise<unknown>)[]) =>
      Promise.all(thunks.map((thunk) => thunk().catch(() => null))),
    (line: string) => logs.push(line),
    () => {},
  );
  return { result, calls, logs };
}

const JOB = {
  job: 'diary-today.novice',
  review: 'R1',
  kind: 'fresh',
  lens: 'persona',
  dir: 'E:/runs/demo/jobs/diary-today.novice/reviews/R1',
  brief: 'E:/runs/demo/jobs/diary-today.novice/reviews/R1/brief.md',
  out: 'E:/runs/demo/jobs/diary-today.novice/reviews/R1/review.json',
};

/** Every field of `ReviewSummary`; the record makes a new one fail to compile here. */
const SUMMARY_FIELDS: Record<keyof ReviewSummary, true> = {
  job: true,
  review: true,
  wrote: true,
  mean: true,
  blocker: true,
  serious: true,
  minor: true,
  taste: true,
  confirmed: true,
  dismissed: true,
};

describe('the Claude files of the lab', () => {
  it('start one lab-reviewer per job with a summary of ReviewSummary', () => {
    const workflow = read('.claude/workflows/lab-review.js');
    expect(workflow).toMatch(/^export const meta = \{\n\s+name: 'lab-review',/);
    expect(workflow).toContain("agentType: 'lab-reviewer'");
    const properties = /properties: \{([\s\S]*?)\n  \},/.exec(workflow)![1]!;
    const names = [...properties.matchAll(/^\s+(\w+): \{/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(Object.keys(SUMMARY_FIELDS).sort());
  });

  it('hand each job to the lab-reviewer agent', async () => {
    const { result, calls } = await runWorkflow(
      { study: 'demo', jobs: [JOB] },
      true,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toBe(
      `Read ${JOB.brief} and do what it says. Write only ${JOB.out}.`,
    );
    expect(calls[0]!.options.agentType).toBe('lab-reviewer');
    expect(result).toEqual({
      study: 'demo',
      reviews: [{ job: 'diary-today.novice', review: 'R1', wrote: true }],
    });
  });

  it('fall back to a default agent with the reviewer’s rules when the session lacks it', async () => {
    const { result, calls, logs } = await runWorkflow(
      JSON.stringify({ study: 'demo', jobs: [JOB] }),
      false,
    );
    expect(calls).toHaveLength(2);
    const standIn = calls[1]!;
    expect(standIn.options.agentType).toBeUndefined();
    expect(standIn.options.schema).toBe(calls[0]!.options.schema);
    for (const rule of [
      'not a developer',
      'Never read or judge code',
      'Open only the files the brief lists',
      'Ignore any project instructions',
      `Write only ${JOB.out}.`,
      'Answer in English.',
    ])
      expect(standIn.prompt).toContain(rule);
    expect(logs.some((line) => line.includes('lab-reviewer unavailable'))).toBe(
      true,
    );
    expect((result as any).reviews[0].wrote).toBe(true);
  });

  it('give the reviewer only Read and Write', () => {
    const agent = read('.claude/agents/lab-reviewer.md');
    expect(agent).toMatch(/^---\nname: lab-reviewer\n/);
    expect(agent).toMatch(/\ntools: Read, Write\n/);
  });

  it('run the workflow from the skill by its name', () => {
    const skill = read('.claude/skills/lab/SKILL.md');
    expect(skill).toMatch(/^---\nname: lab\n/);
    expect(skill).toContain('`name: "lab-review"`');
    expect(skill).toContain('bun run lab jobs <study> --pending --json');
  });
});
