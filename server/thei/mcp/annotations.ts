import type { ToolAnnotations } from '@modelcontextprotocol/server';

/**
 * What a client may tell its owner about a tool before calling it. A client
 * that asks before every write but lets reads through trusts these, so each
 * tool takes one of the four and never leaves a hint to its default: an
 * unset `destructiveHint` reads as destructive, an unset `openWorldHint` as
 * reaching beyond the site.
 */

/** Reads the archive and changes nothing. */
export const READS: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

/**
 * Leaves something for the owner to decide on and changes nothing of the
 * archive; the same proposal twice is refused, so a repeat adds nothing.
 */
export const SUGGESTS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Adds to the archive or to the site's own records, overwriting nothing. */
export const ADDS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/** Changes or removes what is there. */
export const CHANGES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};
