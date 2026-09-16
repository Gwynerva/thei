import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  readUploadHeader,
  stageUploadBody,
} from '../../../server/thei/assets/upload-stream';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-stage-'));
  (globalThis as any).THEI_SERVER = {
    projectPath: (...parts: string[]) => join(root, ...parts),
  };
  // h3's `createError` is a Nitro auto-import in production code.
  (globalThis as any).createError = (input: {
    statusCode: number;
    message: string;
  }) => Object.assign(new Error(input.message), input);
  (globalThis as any).getHeader = (event: any, name: string) =>
    event.node.req.headers[name];
});

afterEach(async () => {
  delete (globalThis as any).THEI_SERVER;
  delete (globalThis as any).createError;
  delete (globalThis as any).getHeader;
  await rm(root, { recursive: true, force: true });
});

/** Minimal stand-in for the H3 event: only the request stream is read. */
function requestEvent(body: Buffer, headers: Record<string, string> = {}) {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < body.length; offset += 8192) {
    chunks.push(body.subarray(offset, offset + 8192));
  }
  return { node: { req: Object.assign(Readable.from(chunks), { headers }) } };
}

describe('stageUploadBody', () => {
  it('writes the body to disk and hashes it in the same pass', async () => {
    const body = randomBytes(200 * 1024);
    const staged = await stageUploadBody(requestEvent(body) as any, {
      maxSizeBytes: body.length,
    });

    expect(staged.size).toBe(body.length);
    expect(staged.hash).toBe(createHash('sha256').update(body).digest('hex'));
    expect(await readFile(staged.path)).toEqual(body);

    await staged.discard();
    await expect(stat(staged.path)).rejects.toThrow();
  });

  it('rejects a body past the limit without keeping the partial file', async () => {
    const body = randomBytes(64 * 1024);
    let stagedPath = '';
    // The limit is enforced while reading, so an oversized upload is abandoned
    // partway rather than being written out in full and then measured.
    await expect(
      stageUploadBody(requestEvent(body) as any, {
        maxSizeBytes: 16 * 1024,
      }).then((staged) => {
        stagedPath = staged.path;
      }),
    ).rejects.toThrow('File exceeds the maximum allowed size');

    expect(stagedPath).toBe('');
    const leftovers = await readFile(join(root, '.thei', 'tmp')).catch(
      () => null,
    );
    expect(leftovers).toBeNull();
  });

  it('rejects an empty body', async () => {
    await expect(
      stageUploadBody(requestEvent(Buffer.alloc(0)) as any, {
        maxSizeBytes: 1024,
      }),
    ).rejects.toThrow('Empty upload');
  });

  it('percent-decodes header values', () => {
    const event = requestEvent(Buffer.from('x'), {
      'x-upload-settings': encodeURIComponent('{"подпись":"фото"}'),
    });

    expect(readUploadHeader(event as any, 'x-upload-settings')).toBe(
      '{"подпись":"фото"}',
    );
  });

  it('reports a missing required header rather than guessing', () => {
    const event = requestEvent(Buffer.from('x'));

    expect(() => readUploadHeader(event as any, 'x-upload-settings')).toThrow(
      'Missing required field: x-upload-settings',
    );
    expect(readUploadHeader(event as any, 'x-upload-id', false)).toBe('');
  });
});
