import 'dotenv/config'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { shows } from './schema'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set.')

const catalog = [
  ['Hamilton', 'hamilton', 'musical'],
  ['Hadestown', 'hadestown', 'musical'],
  ['Wicked', 'wicked', 'musical'],
  ['The Lion King', 'the-lion-king', 'musical'],
  ['Les Miserables', 'les-miserables', 'musical'],
  ['Rent', 'rent', 'musical'],
  ['Suffs', 'suffs', 'musical'],
  ['Operation Mincemeat', 'operation-mincemeat', 'musical'],
  ['Maybe Happy Ending', 'maybe-happy-ending', 'musical'],
  ['Cabaret', 'cabaret', 'musical'],
  ['Gypsy', 'gypsy', 'musical'],
  ['The Outsiders', 'the-outsiders', 'musical'],
  ['John Proctor Is the Villain', 'john-proctor-is-the-villain', 'play'],
  ['Death of a Salesman', 'death-of-a-salesman', 'play'],
  ['Angels in America', 'angels-in-america', 'play'],
] as const

const client = postgres(databaseUrl, { prepare: false })
const db = drizzle(client)

try {
  await db
    .insert(shows)
    .values(
      catalog.map(([title, slug, type]) => ({
        title,
        slug,
        type,
        catalogStatus: 'published' as const,
      })),
    )
    .onConflictDoNothing({ target: shows.slug })
  console.log(`Ensured ${catalog.length} curated shows are available.`)
} finally {
  await client.end({ timeout: 5 })
}
