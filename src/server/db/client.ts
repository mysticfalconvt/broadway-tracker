import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

function createDatabase() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and set it first.')
  }

  return drizzle(postgres(url, { prepare: false }), { schema })
}

let database: ReturnType<typeof createDatabase> | undefined

/**
 * Creates the connection only in a request that needs Postgres. This keeps the
 * landing page and development server usable before local database setup.
 */
export function getDb() {
  database ??= createDatabase()
  return database
}
