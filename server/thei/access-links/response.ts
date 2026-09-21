import type { H3Event } from 'h3';

/**
 * Marks a response that only a share link made visible.
 *
 * Such a response is private content handed to someone who is not the owner
 * and whose access expires, so it must not be stored anywhere — not by the
 * browser, and certainly not by a proxy in between.
 */
export function markSharedResponse(event: H3Event): void {
  setHeader(event, 'Cache-Control', 'private, no-store');
  event.context.viaShareLink = true;
}
