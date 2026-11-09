import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getRouterParam,
  toNodeListener,
} from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshAiTestDb, quietConsole } from '../helpers/fresh-ai-db';

vi.mock('../../server/thei/assets/upload-stream', async (original) => ({
  ...(await original<object>()),
  stageUploadBody: vi.fn(),
}));

import { stageUploadBody } from '../../server/thei/assets/upload-stream';
import { createApiToken, revokeApiToken } from '../../server/thei/api-tokens';
import { fileJob, runFileJob } from '../../server/thei/mcp/file-jobs';
import { fileSettings, issueUploadTicket } from '../../server/thei/mcp/files';
import { McpToolError } from '../../server/thei/mcp/result';

/**
 * Files an app brings in over MCP: what it is told when making one fails,
 * how long one may take, and that an address of a revoked key takes in
 * nothing.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;
const logged: unknown[][] = [];
const principal = {
  tokenUuid: 'tk-files',
  label: 'App',
  scopes: ['read', 'edit'] as ('read' | 'edit')[],
};

beforeEach(async () => {
  logged.length = 0;
  context = await freshAiTestDb({
    console: {
      ...quietConsole,
      error: (...args: unknown[]) => logged.push(args),
    },
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await context.close();
});

describe('a file job', () => {
  it('tells an app why it failed only when the reason is for it', async () => {
    const raw = await runFileJob(principal, 'clip.mp4', async () => {
      throw new Error('ffmpeg exited 1: /srv/thei/.thei/tmp/abc/input.mp4');
    });
    expect(raw.status).toBe('failed');
    expect(raw.error).not.toContain('/srv/thei');
    expect(raw.error).toMatch(/error \w+/);
    // The whole of it is in the log, under the id the app is told.
    expect(String(logged[0]?.[1])).toContain('/srv/thei');
    expect(String(logged[0]?.[0])).toContain(
      raw.error!.match(/error (\w+)/)![1],
    );

    const refused = await runFileJob(principal, 'clip.mp4', async () => {
      throw new McpToolError('The address answered 404; no file was taken.');
    });
    expect(refused.error).toBe('The address answered 404; no file was taken.');
  });

  it('is stopped when it runs for hours, and gives its place back', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const hung = (signal: AbortSignal) => {
      signals.push(signal);
      // Work that hears nothing and never ends.
      return new Promise<never>(() => {});
    };
    const started = [
      runFileJob(principal, 'one.mp4', hung),
      runFileJob(principal, 'two.mp4', hung),
    ];
    await vi.advanceTimersByTimeAsync(30_000);
    const jobs = await Promise.all(started);
    expect(jobs.map((job) => job.status)).toEqual(['running', 'running']);
    await expect(runFileJob(principal, 'three.mp4', hung)).rejects.toThrow(
      /already on their way/,
    );

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(fileJob(jobs[0]!.job, principal.tokenUuid)?.status).toBe('failed');
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    const next = runFileJob(principal, 'three.mp4', async () => {
      throw new McpToolError('Not this one.');
    });
    await vi.advanceTimersByTimeAsync(0);
    expect((await next).status).toBe('failed');
  });
});

describe('an upload address', () => {
  it('takes in nothing once its key is revoked', async () => {
    Object.assign(globalThis, {
      defineEventHandler,
      createError,
      getRouterParam,
    });
    const { item } = await createApiToken('App', 'editor');
    const { ticket } = issueUploadTicket(
      { ...principal, tokenUuid: item.tokenUuid },
      'photo.jpg',
      fileSettings(undefined),
    );
    revokeApiToken(item.tokenUuid);
    const route = (await import('../../server/api/mcp/upload/[ticket].put'))
      .default;
    const server = createServer(
      toNodeListener(
        createApp().use(createRouter().put('/api/mcp/upload/:ticket', route)),
      ),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${port}/api/mcp/upload/${ticket}`,
        { method: 'PUT', body: 'abc', signal: AbortSignal.timeout(5000) },
      );
      expect(response.status).toBe(404);
      expect(vi.mocked(stageUploadBody)).not.toHaveBeenCalled();
      expect(
        context.rawDb.prepare('SELECT COUNT(*) AS n FROM `asset-usages`').get(),
      ).toEqual({ n: 0 });
    } finally {
      server.close();
    }
  });
});
