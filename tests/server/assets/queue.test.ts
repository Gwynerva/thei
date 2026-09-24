import { describe, expect, it } from 'vitest';
import { withProbeSlot } from '../../../server/thei/assets/queue';

/** A job that runs until released, recording that it started. */
function heldJob(started: string[], name: string) {
  let release!: () => void;
  const done = new Promise<void>((resolve) => (release = resolve));
  const job = async () => {
    started.push(name);
    await done;
    return name;
  };
  return { job, release };
}

describe('processing queue', () => {
  it('admits waiting jobs in arrival order once a slot frees up', async () => {
    const started: string[] = [];
    const first = heldJob(started, 'first');
    const second = heldJob(started, 'second');
    const third = heldJob(started, 'third');

    const running = [
      withProbeSlot(first.job),
      withProbeSlot(second.job),
      withProbeSlot(third.job),
    ];
    await Promise.resolve();
    expect(started).toEqual(['first', 'second']);

    first.release();
    await running[0];
    // A job arriving now must not take the freed slot from the one waiting.
    const late = heldJob(started, 'late');
    const lateRun = withProbeSlot(late.job);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(['first', 'second', 'third']);

    second.release();
    third.release();
    late.release();
    await Promise.all([...running, lateRun]);
    expect(started).toEqual(['first', 'second', 'third', 'late']);
  });

  it('lets an aborted job leave the queue without running', async () => {
    const started: string[] = [];
    const first = heldJob(started, 'first');
    const second = heldJob(started, 'second');
    const running = [withProbeSlot(first.job), withProbeSlot(second.job)];

    const controller = new AbortController();
    const abandoned = withProbeSlot(
      async () => {
        started.push('abandoned');
        return 'abandoned';
      },
      { signal: controller.signal },
    );
    const next = heldJob(started, 'next');
    const nextRun = withProbeSlot(next.job);

    controller.abort(new Error('closed'));
    await expect(abandoned).rejects.toThrow('closed');

    first.release();
    await running[0];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(['first', 'second', 'next']);

    second.release();
    next.release();
    await Promise.all([running[1], nextRun]);
  });

  it('refuses a job whose request is already gone', async () => {
    const controller = new AbortController();
    controller.abort(new Error('gone'));
    let ran = false;

    await expect(
      withProbeSlot(
        async () => {
          ran = true;
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('gone');
    expect(ran).toBe(false);
  });
});
