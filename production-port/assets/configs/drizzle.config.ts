import { defineConfig } from 'drizzle-kit'

// Local default matches docker-compose.yml — keep them in step. Remote pushes
// are refused by scripts/db-push-guard.mjs; the remote path is generate+migrate.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:local@127.0.0.1:55432/app',
  },
})
