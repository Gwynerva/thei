import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AssetUploadResponse } from '../../../shared/api/asset';
import type { AssetJobStatus } from '../../../shared/api/asset-upload-progress';
import {
  commitDraftRequest,
  isDraftExpired,
  UploadJobError,
} from '../../../app/composables/upload-draft';

const asset = { assetUuid: 'a-1' } as AssetUploadResponse;
const globals = globalThis as Record<string, unknown>;

interface FakeServer {
  /** What the commit answers: the asset at once, or a job to follow. */
  commit: { status: number; body: unknown };
  /** What each poll answers, in turn; the last one repeats. */
  polls: (AssetJobStatus | null | Error)[];
  requests: string[];
  /** The commit never answers; only its signal ends it. */
  hold?: boolean;
}

function serve(server: FakeServer) {
  const raw = async (
    url: string,
    options: { method?: string; signal?: AbortSignal },
  ) => {
    server.requests.push(`${options.method ?? 'GET'} ${url}`);
    if (server.hold)
      await new Promise((_, reject) =>
        options.signal?.addEventListener('abort', () =>
          reject(new Error('The request was aborted')),
        ),
      );
    return { status: server.commit.status, _data: server.commit.body };
  };
  const $fetch = async (url: string) => {
    server.requests.push(`GET ${url}`);
    const answer =
      server.polls.length > 1 ? server.polls.shift()! : server.polls[0]!;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  globals.$fetch = Object.assign($fetch, { raw });
  globals.fetch = async (url: string, options: { method?: string }) => {
    server.requests.push(`${options.method} ${url}`);
    return new Response(null, { status: 204 });
  };
}

beforeAll(() => {
  globals.phrase = {
    value: {
      upload_error_cancelled: 'cancelled',
      upload_error_job_lost: 'the server was restarted',
    },
  };
  globals.sitePath = (path: string) => path;
  globals.window = { addEventListener() {}, removeEventListener() {} };
});

afterEach(() => {
  delete globals.$fetch;
  delete globals.fetch;
});

const commit = (signal?: AbortSignal, onStatus?: (s: unknown) => void) =>
  commitDraftRequest(
    'd-1',
    { type: 'video-transform', quality: 75, dimensions: {} } as never,
    {},
    { signal, onStatus },
  );

describe('committing a draft', () => {
  it('takes a quick result from the request itself', async () => {
    const server: FakeServer = {
      commit: { status: 200, body: asset },
      polls: [],
      requests: [],
    };
    serve(server);
    expect(await commit()).toBe(asset);
    expect(server.requests).toHaveLength(1);
  });

  it('follows a job to its result, passing the phases on', async () => {
    const server: FakeServer = {
      commit: { status: 202, body: { uploadId: 'x' } },
      polls: [
        { phase: 'processing', progress: 0.5 },
        { phase: 'finishing' },
        { phase: 'done', asset },
      ],
      requests: [],
    };
    serve(server);
    const seen: unknown[] = [];
    expect(await commit(undefined, (status) => seen.push(status))).toBe(asset);
    expect(seen).toEqual([
      { phase: 'processing', progress: 0.5 },
      { phase: 'finishing' },
    ]);
  }, 10_000);

  it('turns a failed job into the error the request would have raised', async () => {
    const server: FakeServer = {
      commit: { status: 202, body: { uploadId: 'x' } },
      polls: [{ phase: 'failed', message: 'too large', statusCode: 400 }],
      requests: [],
    };
    serve(server);
    const failure = await commit().catch((reason: unknown) => reason);
    expect(failure).toBeInstanceOf(UploadJobError);
    expect(failure).toMatchObject({ message: 'too large', statusCode: 400 });
    expect(isDraftExpired(failure)).toBe(false);
  });

  it('reads a job the server no longer knows as a draft that is gone', async () => {
    const server: FakeServer = {
      commit: { status: 202, body: { uploadId: 'x' } },
      polls: [null],
      requests: [],
    };
    serve(server);
    const failure = await commit().catch((reason: unknown) => reason);
    expect(failure).toBeInstanceOf(UploadJobError);
    expect(isDraftExpired(failure)).toBe(true);
  });

  it('keeps asking a server it cannot reach rather than give the job up', async () => {
    vi.useFakeTimers();
    try {
      const offline = new TypeError('Failed to fetch');
      const server: FakeServer = {
        commit: { status: 202, body: { uploadId: 'x' } },
        // Half a minute and more of an outage, polled all along.
        polls: [...Array(40).fill(offline), { phase: 'done', asset }],
        requests: [],
      };
      serve(server);
      const pending = commit();
      // The job may well go on there: giving it up would encode the file a
      // second time beside it.
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(await pending).toBe(asset);
      expect(server.requests.some((line) => line.startsWith('DELETE'))).toBe(
        false,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the job when abandoned before the server answered', async () => {
    const server: FakeServer = {
      commit: { status: 202, body: { uploadId: 'x' } },
      polls: [{ phase: 'processing' }],
      requests: [],
      hold: true,
    };
    serve(server);
    const controller = new AbortController();
    const pending = commit(controller.signal);
    controller.abort();
    const failure = await pending.catch((reason: unknown) => reason);
    expect((failure as DOMException).name).toBe('AbortError');
    // The job may have started all the same; nothing would ever ask for it.
    expect(
      server.requests.some((line) =>
        line.startsWith('DELETE /api/admin/uploads/'),
      ),
    ).toBe(true);
  });

  it('cancels the job when abandoned', async () => {
    const server: FakeServer = {
      commit: { status: 202, body: { uploadId: 'x' } },
      polls: [{ phase: 'processing' }],
      requests: [],
    };
    serve(server);
    const controller = new AbortController();
    const pending = commit(controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    controller.abort();
    const failure = await pending.catch((reason: unknown) => reason);
    expect(failure).toBeInstanceOf(DOMException);
    expect((failure as DOMException).name).toBe('AbortError');
    // The job is keyed by the id the client chose, not by the server's echo.
    const polled = server.requests.find((line) =>
      line.startsWith('GET /api/admin/uploads/'),
    )!;
    expect(server.requests).toContain(polled.replace('GET', 'DELETE'));
  });
});
