import type { H3Event } from 'h3';

/**
 * Aborted when the client goes away before the response is finished.
 *
 * Processing a file for a closed tab is work nobody will ever see; the signal
 * lets a queued job give its place up and a running encode stop.
 */
export function requestAbortSignal(event: H3Event): AbortSignal {
  const controller = new AbortController();
  const response = event.node.res;
  response.once('close', () => {
    if (!response.writableFinished) {
      controller.abort(
        new DOMException('The request was closed', 'AbortError'),
      );
    }
  });
  return controller.signal;
}
