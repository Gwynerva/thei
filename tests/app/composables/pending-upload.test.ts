import { beforeAll, describe, expect, it } from 'vitest';
import type { AssetVariantInfo } from '../../../shared/api/asset';
import { PendingOriginalUpload } from '../../../app/composables/pending-upload';

interface SendCall {
  signal: AbortSignal;
  progress: (share: number) => void;
  status: (status: { phase: 'queued' | 'processing' | 'finishing' }) => void;
  resolve: (asset: AssetVariantInfo) => void;
  reject: (reason: unknown) => void;
}

/** A request that answers only when the test says so. */
function fakeSend() {
  const calls: SendCall[] = [];
  const send: ConstructorParameters<typeof PendingOriginalUpload>[1]['send'] = (
    _file,
    _extension,
    _constraints,
    options = {},
  ) =>
    new Promise<AssetVariantInfo>((resolve, reject) => {
      calls.push({
        signal: options.signal!,
        progress: options.onProgress!,
        status: options.onStatus!,
        resolve,
        reject,
      });
      options.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    });
  return { calls, send };
}

const asset = { assetUuid: 'a-1', size: 10 } as AssetVariantInfo;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const revoked: string[] = [];

beforeAll(() => {
  (globalThis as { phrase?: unknown }).phrase = {
    value: { upload_error_apply: 'Could not store the file' },
  };
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };
});

function upload(send: ReturnType<typeof fakeSend>['send']) {
  return new PendingOriginalUpload(new File(['x'], 'shot.png'), {
    constraints: { sizeLimitPolicy: 'media' },
    send,
  });
}

describe('a pending upload', () => {
  it('reports the way up and hands the stored file over once', async () => {
    const { calls, send } = fakeSend();
    const pending = upload(send);
    expect(pending.extension).toBe('png');
    expect(pending.preview).toEqual({ src: 'blob:test', kind: 'image' });

    const attempt = pending.run();
    expect(pending.status.value).toEqual({ phase: 'staging', progress: 0 });
    calls[0]!.progress(0.5);
    expect(pending.status.value).toEqual({ phase: 'staging', progress: 0.5 });
    calls[0]!.status({ phase: 'processing' });
    expect(pending.status.value).toEqual({ phase: 'processing' });

    calls[0]!.resolve(asset);
    await attempt;
    expect(await pending.result).toBe(asset);
    expect(pending.status.value).toBeNull();
    expect(pending.error.value).toBeUndefined();
    // Another try changes nothing once the file is in.
    pending.retry();
    expect(calls).toHaveLength(1);
  });

  it('keeps a failure for another try, and never rejects', async () => {
    const { calls, send } = fakeSend();
    const pending = upload(send);
    let settled = false;
    void pending.result.then(() => (settled = true));

    const first = pending.run();
    calls[0]!.reject(new Error('the disk is full'));
    await first;
    expect(pending.error.value).toBe('the disk is full');
    await settle();
    expect(settled).toBe(false);

    pending.retry();
    expect(calls).toHaveLength(2);
    expect(pending.error.value).toBeUndefined();
    calls[1]!.resolve(asset);
    expect(await pending.result).toBe(asset);
  });

  it('is given up quietly, whatever the request answers afterwards', async () => {
    const { calls, send } = fakeSend();
    const pending = upload(send);
    const attempt = pending.run();
    pending.dispose();

    expect(calls[0]!.signal.aborted).toBe(true);
    await attempt;
    expect(await pending.result).toBeUndefined();
    expect(pending.error.value).toBeUndefined();
    expect(revoked).toContain('blob:test');
    // A retry after giving up starts nothing.
    pending.retry();
    expect(calls).toHaveLength(1);
  });

  it('ignores the answer of an attempt a retry has replaced', async () => {
    const { calls, send } = fakeSend();
    const pending = upload(send);
    const first = pending.run();
    calls[0]!.reject(new Error('lost'));
    await first;
    pending.retry();
    // The stale request coming back late must not touch the new attempt.
    calls[0]!.resolve(asset);
    await settle();
    expect(pending.error.value).toBeUndefined();
    expect(pending.status.value).toEqual({ phase: 'staging', progress: 0 });
    calls[1]!.resolve(asset);
    expect(await pending.result).toBe(asset);
  });
});
