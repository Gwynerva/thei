import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/thei/db/schema',
  out: './server/thei/db/migrations',
  dbCredentials: {
    url: '.playground/content/thei.db',
  },
});
