import { describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import {
  isContentWriteRequest,
  markReadOnlyRequest,
} from '../../server/thei/read-only-request';

function request(method: string, path: string) {
  return { method, path, context: {} } as unknown as H3Event;
}

describe('content write requests', () => {
  it('counts API writes and nothing else', () => {
    expect(isContentWriteRequest(request('PUT', '/api/admin/events/e-1'))).toBe(
      true,
    );
    expect(isContentWriteRequest(request('GET', '/api/admin/events'))).toBe(
      false,
    );
    expect(isContentWriteRequest(request('POST', '/sign-in/'))).toBe(false);
  });

  it('leaves out a POST that only reads', () => {
    const event = request('POST', '/api/admin/tag-recommendations');
    markReadOnlyRequest(event);
    expect(isContentWriteRequest(event)).toBe(false);
  });
});
