import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

config()

const TEST_DATABASE = 'broadway_tracker_test'

const configured = process.env.DATABASE_URL
if (!configured) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and set it first.')
}

const testUrl =
  process.env.TEST_DATABASE_URL ?? configured.replace(/\/[^/?]+(\?|$)/, `/${TEST_DATABASE}$1`)
// A suite truncates every table, so refuse to run anywhere but the test database.
if (!new URL(testUrl).pathname.endsWith(`/${TEST_DATABASE}`)) {
  throw new Error(`Refusing to run tests against ${new URL(testUrl).pathname}`)
}

// Create the database on first run so a fresh clone only needs `pnpm test`.
const admin = postgres(configured, { prepare: false, max: 1 })
try {
  const existing = await admin`select 1 from pg_database where datname = ${TEST_DATABASE}`
  if (!existing.length) await admin.unsafe(`create database ${TEST_DATABASE}`)
} finally {
  await admin.end()
}

const migrationClient = postgres(testUrl, { prepare: false, max: 1 })
try {
  await migrate(drizzle(migrationClient), { migrationsFolder: './src/server/db/migrations' })
} finally {
  await migrationClient.end()
}

// Point the lazy database client at the test database before any suite imports it.
process.env.DATABASE_URL = testUrl
