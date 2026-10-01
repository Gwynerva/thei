import { afterEach, describe, expect, it } from 'vitest';
import type { AssetUploadResponse } from '../../../shared/api/asset';
import {
  cancelUploadJob,
  getUploadJob,
  isUploadJobRunning,
  resetUploadJobsForTests,
  startUploadJob,
  sweepUploadJobs,
} from '../../../server/thei/assets/jobs';

const asset = { assetUuid: 'a-1' } as AssetUploadResponse;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A job that ends only when the test says so, and stops on its signal. */
function heldJob() {
  let finish!: (asset: AssetUploadResponse) => void;
  let fail!: (reason: unknown) => void;
  let signal!: AbortSignal;
  let report!: (status: { phase: 'processing'; progress?: number }) => void;
  const run = (
    ownSignal: AbortSignal,
    ownReport: typeof report,
  ): Promise<AssetUploadResponse> =>
    new Promise((resolve, reject) => {
      signal = ownSignal;
      report = ownReport;
      finish = resolve;
      fail = reject;
      ownSignal.addEventListener('abort', () => reject(ownSignal.reason));
    });
  return {
    run,
    finish: (value: AssetUploadResponse) => finish(value),
    fail: (reason: unknown) => fail(reason),
    get signal() {
      return signal;
    },
    report: (status: Parameters<typeof report>[0]) => report(status),
  };
}

afterEach(() => resetUploadJobsForTests());

describe('upload jobs', () => {
  it('runs at once, shows its phases, and keeps what it made', async () => {
    const job = heldJob();
    startUploadJob('u-1', job.run, 1000);
    expect(getUploadJob('u-1')).toEqual({ phase: 'queued' });
    expect(isUploadJobRunning('u-1')).toBe(true);

    job.report({ phase: 'processing', progress: 0.4 });
    expect(getUploadJob('u-1')).toEqual({ phase: 'processing', progress: 0.4 });

    job.finish(asset);
    await settle();
    expect(getUploadJob('u-1')).toEqual({ phase: 'done', asset });
    expect(isUploadJobRunning('u-1')).toBe(false);
    // A late report changes nothing settled.
    job.report({ phase: 'processing' });
    expect(getUploadJob('u-1')).toEqual({ phase: 'done', asset });
  });

  it('keeps a failure with the error’s code and data', async () => {
    const job = heldJob();
    startUploadJob('u-2', job.run);
    job.fail(
      Object.assign(new Error('File type is not allowed'), {
        statusCode: 400,
        data: { reason: 'type' },
      }),
    );
    await settle();
    expect(getUploadJob('u-2')).toEqual({
      phase: 'failed',
      message: 'File type is not allowed',
      statusCode: 400,
      data: { reason: 'type' },
    });
  });

  it('is cancelled through its own signal, and says so', async () => {
    const job = heldJob();
    startUploadJob('u-3', job.run);
    expect(cancelUploadJob('u-3')).toBe(true);
    expect(job.signal.aborted).toBe(true);
    await settle();
    expect(getUploadJob('u-3')).toMatchObject({ phase: 'failed' });
    expect(cancelUploadJob('missing')).toBe(false);
  });

  it('refuses an id already in use rather than take its job over', () => {
    const first = heldJob();
    startUploadJob('same', first.run);
    expect(() => startUploadJob('same', heldJob().run)).toThrow(
      'Upload id already in use',
    );
    expect(first.signal.aborted).toBe(false);
    expect(isUploadJobRunning('same')).toBe(true);
  });

  it('cancels a job that runs for hours, however closely it is followed', () => {
    const hour = 60 * 60 * 1000;
    const base = Date.now();
    const stuck = heldJob();
    startUploadJob('stuck', stuck.run, base);
    for (let at = 1; at <= 3; at++) {
      getUploadJob('stuck', base + at * hour);
      sweepUploadJobs(base + at * hour);
    }
    expect(stuck.signal.aborted).toBe(false);
    getUploadJob('stuck', base + 4 * hour);
    sweepUploadJobs(base + 4 * hour);
    expect(stuck.signal.aborted).toBe(true);
  });

  it('cancels a job nobody asks about, and forgets old results', async () => {
    const minute = 60 * 1000;
    const base = Date.now();
    // Started a minute ago and never asked about since.
    const forgotten = heldJob();
    startUploadJob('orphan', forgotten.run, base - minute);
    const followed = heldJob();
    startUploadJob('followed', followed.run, base);
    const done = heldJob();
    startUploadJob('done', done.run, base);
    done.finish(asset);
    await settle();

    // Nine and a half minutes in: the followed job was polled at nine, the
    // orphan has gone unasked for over ten, the result is still fresh.
    getUploadJob('followed', base + 9 * minute);
    sweepUploadJobs(base + 9.5 * minute);
    expect(forgotten.signal.aborted).toBe(true);
    expect(followed.signal.aborted).toBe(false);
    expect(getUploadJob('done', base + 9.5 * minute)).toEqual({
      phase: 'done',
      asset,
    });

    // Results are kept ten minutes after they settled, then dropped; the
    // followed job, polled a minute ago, goes on.
    getUploadJob('followed', base + 10 * minute);
    sweepUploadJobs(base + 11 * minute);
    expect(getUploadJob('done')).toBeUndefined();
    expect(isUploadJobRunning('followed')).toBe(true);
  });
});
