import { z } from 'zod';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

/**
 * The arguments several tools share, written once so a model reads them the
 * same way wherever they come.
 */

/** A day of the owner's life, as every date on the site is written. */
export const dayInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A day is written YYYY-MM-DD.');

/** Who may see an entity. */
export const accessInput = z.enum([
  ProjectEventAccessLevel.Public,
  ProjectEventAccessLevel.LinkOnly,
  ProjectEventAccessLevel.Private,
]);
