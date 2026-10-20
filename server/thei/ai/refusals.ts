import { createError } from 'h3';
import { EntityPatchError } from '../entity-patch/text';

/**
 * What does not fit a schema, in words a model reads: each issue after the
 * path to it.
 */
export function zodProblem(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .map((issue) =>
      issue.path.length
        ? `${issue.path.map(String).join('.')}: ${issue.message}`
        : issue.message,
    )
    .join('; ');
}

/**
 * Runs what an AI route does, telling a refusal — it is undone already, it
 * changed since — as a conflict the page shows in words, never as a crash.
 */
export async function withRefusals<T>(run: () => T | Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof EntityPatchError)
      throw createError({ statusCode: 409, message: error.message });
    throw error;
  }
}
