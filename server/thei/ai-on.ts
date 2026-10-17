import { createError } from 'h3';

/**
 * With AI off, nothing about it can be changed: a route that would asks the
 * same answer `/api/mcp` gives, as if it were not there. What stays — the
 * switch, the keys, the record of past changes — does not ask.
 */
export function requireAiOn() {
  if (!THEI_SERVER.config.mcp.enabled) throw createError({ statusCode: 404 });
}
