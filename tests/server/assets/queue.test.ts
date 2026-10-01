import { describe, expect, it } from 'vitest';
import { AssetType } from '../../../shared/asset';
import {
  withProbeSlot,
  withProcessingSlot,
} from '../../../server/thei/assets/queue';

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

  it('lets normal work go ahead of low work, in arrival order within a kind', async () => {
    const started: string[] = [];
    // The video lane has one slot: one held job makes everything else wait.
    const held = heldJob(started, 'held');
    const running = [withProcessingSlot(AssetType.Video, held.job)];
    const order = ['low-1', 'low-2', 'normal-1', 'low-3', 'normal-2'];
    const jobs = order.map((name) => {
      const job = heldJob(started, name);
      running.push(
        withProcessingSlot(AssetType.Video, job.job, {
          priority: name.startsWith('low') ? 'low' : 'normal',
        }),
      );
      return job;
    });
    await Promise.resolve();
    expect(started).toEqual(['held']);

    // An aborted low job leaves without disturbing the order of the rest.
    const controller = new AbortController();
    const abandoned = withProcessingSlot(
      AssetType.Video,
      async () => {
        started.push('abandoned');
      },
      { signal: controller.signal, priority: 'low' },
    );
    controller.abort(new Error('gone'));
    await expect(abandoned).rejects.toThrow('gone');

    held.release();
    for (const job of jobs) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      job.release();
    }
    await Promise.all(running);
    expect(started).toEqual([
      'held',
      'normal-1',
      'normal-2',
      'low-1',
      'low-2',
      'low-3',
    ]);
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
