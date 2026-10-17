import type { CallToolResult } from '@modelcontextprotocol/server';
import { EntityPatchError } from '../entity-patch/text';

/**
 * Tool results: one text, which is what a model reads — Markdown for an
 * entity or a text, compact lines for data. There is no structured copy
 * beside it: clients that show both make a model read everything twice.
 */
export function toolResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * The `_meta` key under which `propose` says how many proposals it turned
 * away, for the session's line of steps.
 */
export const REFUSED_META = 'thei/refused';

/**
 * The `_meta` key under which a tool names the library files it shows, by
 * id: Thei's own model is shown them beside the tool's answer, made into the
 * blocks its service takes.
 */
export const FILES_META = 'thei/files';

/**
 * A refusal the model can read and act on. It is a result, not a protocol
 * error, so the model sees why and can try something else.
 */
export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** An error a tool raises to be returned as `toolError`. */
export class McpToolError extends Error {}

/** Whether an error is a refusal, whose words are for the model to read. */
export function isRefusal(error: unknown): error is Error {
  return error instanceof McpToolError || error instanceof EntityPatchError;
}

/**
 * Logs an error that is no refusal, and gives the id it is logged by: what
 * the model is told instead of the raw error, which says nothing it can act
 * on and may say what it should not — a path on the server, a command's
 * output.
 */
export function logToolFailure(error: unknown): string {
  const id = Math.random().toString(36).slice(2, 10);
  THEI_SERVER.console.error(
    `[MCP] Tool failed (${id}):`,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  return id;
}

/**
 * Runs a tool body. A refusal becomes one the model can read; anything else
 * is logged with an id and told as a failure.
 */
export async function guardTool(
  run: () => Promise<CallToolResult> | CallToolResult,
): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (isRefusal(error)) return toolError(error.message);
    const id = logToolFailure(error);
    return toolError(
      `Thei could not finish this (error ${id}). Read what you were changing again before trying anything else, and tell the owner if it keeps happening.`,
    );
  }
}
