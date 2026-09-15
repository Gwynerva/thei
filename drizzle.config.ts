import { defineConfig } from 'drizzle-kit';

/**
 * Development only, for `bun run db:push` against the playground database.
 *
 * Thei does not use drizzle-kit to produce migrations. A schema change is
 * released by regenerating the baseline with `bun run db:baseline` and adding
 * a hand-written migration under `update/migrations/`, which is what every
 * installed instance actually applies. `out` points at a scratch directory so
 * a stray `drizzle-kit generate` cannot leave files that look authoritative.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/thei/db/schema',
  out: './.thei/drizzle-scratch',
  dbCredentials: {
    url: '.playground/content/thei.db',
  },
});
