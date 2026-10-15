import type { H3Event } from 'h3';
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Marks an API request that only reads although it has to be sent as a POST,
 * because what it reads from is a body too large for a query string.
 */
export function markReadOnlyRequest(event: H3Event) {
  event.context.theiReadOnly = true;
}

/**
 * Undoes `markReadOnlyRequest` for a request that turned out to write: an
 * MCP call is marked read-only up front and becomes a write only when a tool
 * changes something.
 */
export function markContentWriteRequest(event: H3Event) {
  event.context.theiReadOnly = false;
}

/**
 * Whether a request may have changed what the site holds. Every content write
 * goes through the API, so this is what drops the in-memory indexes built
 * over the content.
 */
export function isContentWriteRequest(event: H3Event): boolean {
  return (
    !READ_METHODS.has(event.method) &&
    event.path.startsWith('/api/') &&
    event.context.theiReadOnly !== true
  );
}
