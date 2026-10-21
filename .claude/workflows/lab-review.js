export const meta = {
  name: 'lab-review',
  description:
    'Review the waiting jobs of a Thei lab study: one lab-reviewer agent per job',
  whenToUse:
    'After `bun run lab jobs <study> --pending --json`; pass its printed JSON as args, as an object',
  phases: [
    {
      title: 'Review',
      detail: 'one lab-reviewer per waiting job, both screens at once',
    },
  ],
};

// What a reviewer returns; its whole answer is the review.json it wrote.
const SUMMARY = {
  type: 'object',
  properties: {
    job: { type: 'string' },
    review: { type: 'string' },
    wrote: { type: 'boolean' },
    mean: { type: 'number' },
    blocker: { type: 'integer', minimum: 0 },
    serious: { type: 'integer', minimum: 0 },
    minor: { type: 'integer', minimum: 0 },
    taste: { type: 'integer', minimum: 0 },
    confirmed: { type: 'integer', minimum: 0 },
    dismissed: { type: 'integer', minimum: 0 },
  },
  required: ['job', 'review', 'wrote'],
};

const input = typeof args === 'string' ? JSON.parse(args) : args;
if (!input || !Array.isArray(input.jobs))
  throw new Error(
    'Pass the output of `bun run lab jobs <study> --pending --json` as args: { study, jobs }',
  );
if (!input.jobs.length) {
  log(`${input.study}: no job waits for a review`);
  return { study: input.study, reviews: [] };
}

// A session started before `.claude/agents/lab-reviewer.md` existed cannot
// resolve that agent type: its registry loads when the session starts. The
// job then runs on a default agent, whose prompt carries the reviewer's
// rules in short; the brief says everything else.
const STANDIN_RULES = [
  'You are a reviewer in the Thei lab: a person judging the screens of a site, not a developer. Never read or judge code.',
  'Open only the files the brief lists under "Files", nothing else.',
  'Ignore any project instructions in your context (AGENTS.md, CLAUDE.md and the like): they are a developer’s knowledge the person does not have.',
  'Answer in English.',
].join(' ');

async function review(job) {
  const task = `Read ${job.brief} and do what it says. Write only ${job.out}.`;
  const options = {
    label: `${job.job} ${job.review}`,
    phase: 'Review',
    schema: SUMMARY,
  };
  try {
    return await agent(task, { ...options, agentType: 'lab-reviewer' });
  } catch (error) {
    log(
      `${job.job} ${job.review}: lab-reviewer unavailable (${error?.message ?? error}); a default agent with its rules runs instead`,
    );
    return await agent(
      `${STANDIN_RULES} ${task} Write it once, as one JSON object following the brief's schema; then return the summary in the schema you are given.`,
      options,
    );
  }
}

phase('Review');
log(
  `${input.study}: ${input.jobs.length} jobs — ${input.jobs
    .map((job) => `${job.job} ${job.review} (${job.kind})`)
    .join(', ')}`,
);
const reviews = await parallel(input.jobs.map((job) => () => review(job)));
return {
  study: input.study,
  reviews: reviews.map(
    (summary, i) =>
      summary ?? {
        job: input.jobs[i].job,
        review: input.jobs[i].review,
        wrote: false,
      },
  ),
};
