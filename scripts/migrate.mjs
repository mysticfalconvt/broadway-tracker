/**
 * Applies pending database migrations, then exits.
 *
 * Written in plain ESM against the runtime dependencies only -- drizzle-kit is
 * a devDependency and may not survive a production install, so the deployment
 * cannot rely on `drizzle-kit migrate`. Drizzle records what it has applied in
 * `__drizzle_migrations`, so running this on every start is a no-op once the
 * database is current.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'server',
  'db',
  'migrations',
)

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[migrate] DATABASE_URL is not set. Refusing to start without a database.')
  process.exit(1)
}
if (!existsSync(migrationsFolder)) {
  console.error(`[migrate] No migrations directory at ${migrationsFolder}.`)
  console.error('[migrate] The deployment must ship src/server/db/migrations alongside the build.')
  process.exit(1)
}

const client = postgres(databaseUrl, { prepare: false, max: 1 })
try {
  await migrate(drizzle(client), { migrationsFolder })
  console.info('[migrate] Database is up to date.')
} catch (error) {
  console.error('[migrate] Migration failed. The application will not be started.')
  console.error(error)
  process.exitCode = 1
} finally {
  await client.end({ timeout: 5 })
}
