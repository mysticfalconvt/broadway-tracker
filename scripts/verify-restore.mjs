/**
 * Checks that a restored copy of the database is complete and current.
 *
 * A backup nobody has restored is a hope, not a backup. This is the step that
 * turns one into the other: restore a dump into a scratch database, point this
 * at it, and it reports what is missing rather than leaving you to notice
 * during an actual emergency.
 *
 * Written in plain ESM against the runtime dependencies only, like the
 * migrator, so it runs on the deployment host without a dev install and without
 * the Postgres client binaries.
 *
 *   node scripts/verify-restore.mjs postgres://…/broadway_restore_check
 *
 * The expected tables are read out of the migration files rather than listed
 * here, so this cannot drift from the schema.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'server',
  'db',
  'migrations',
)

const target = process.argv[2] ?? process.env.VERIFY_DATABASE_URL
if (!target) {
  console.error('Usage: node scripts/verify-restore.mjs <database-url-of-the-restored-copy>')
  console.error('Restore a dump into a scratch database first; this never writes anything.')
  process.exit(2)
}

// Reading production would prove nothing about a backup, and a green result
// against it would be actively misleading.
if (process.env.DATABASE_URL && target === process.env.DATABASE_URL) {
  console.error('Refusing to run against DATABASE_URL. Point this at a restored copy instead.')
  process.exit(2)
}

/** Every table the migrations create, minus any they later drop. */
function expectedTables() {
  const files = readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const tables = new Set()
  for (const file of files) {
    const sql = readFileSync(join(migrationsFolder, file), 'utf8')
    for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)"/gi)) {
      tables.add(match[1])
    }
    for (const match of sql.matchAll(/DROP TABLE(?: IF EXISTS)? "([^"]+)"/gi)) {
      tables.delete(match[1])
    }
  }
  return [...tables].sort()
}

const expectedMigrations = readdirSync(migrationsFolder).filter((n) => n.endsWith('.sql')).length
const sql = postgres(target, { prepare: false, max: 1 })
let failures = 0

function report(ok, line) {
  if (!ok) failures += 1
  console.log(`  ${ok ? '✓' : '✗'} ${line}`)
}

try {
  console.log(`\nChecking the restored copy at ${target.replace(/:\/\/[^@]*@/, '://…@')}\n`)

  const present = new Set(
    (await sql`select tablename from pg_tables where schemaname = 'public'`).map(
      (row) => row.tablename,
    ),
  )
  const expected = expectedTables()
  const missing = expected.filter((name) => !present.has(name))
  report(
    missing.length === 0,
    missing.length === 0
      ? `all ${expected.length} tables present`
      : `missing ${missing.length}: ${missing.join(', ')}`,
  )

  // A restore that predates a migration looks fine until something reads a
  // column that is not there.
  const [applied] = await sql`
    select count(*)::int as count from drizzle.__drizzle_migrations
  `.catch(() => [{ count: -1 }])
  report(
    applied?.count === expectedMigrations,
    applied?.count === -1
      ? 'no migration journal — this copy was not built by the migrator'
      : `${applied?.count} of ${expectedMigrations} migrations applied`,
  )

  // Row counts, because a structurally perfect restore of an empty database is
  // the failure this whole exercise exists to catch, and it looks like success.
  console.log('\n  Rows:')
  const counts = new Map()
  for (const table of expected) {
    if (!present.has(table)) continue
    const [row] = await sql`select count(*)::int as count from ${sql(table)}`
    counts.set(table, row.count)
    console.log(`    ${String(row.count).padStart(6)}  ${table}`)
  }
  // The tables a live copy of this application cannot plausibly be missing.
  const core = ['user', 'shows', 'outings']
  const empty = core.filter((table) => (counts.get(table) ?? 0) === 0)
  report(
    empty.length === 0,
    empty.length === 0
      ? `data present in every core table (${core.join(', ')})`
      : `empty: ${empty.join(', ')} — this is a valid schema with nothing in it, not a restore of a live database`,
  )

  // How much would be lost if this copy were the one restored from.
  const [freshest] = await sql`
    select max(created_at) as newest from outings
  `.catch(() => [{ newest: null }])
  if (freshest?.newest) {
    const age = Math.round((Date.now() - new Date(freshest.newest).getTime()) / 3_600_000)
    console.log(
      `\n  Newest recorded night: ${new Date(freshest.newest).toISOString()} (${age}h old)`,
    )
  }

  console.log(
    failures === 0
      ? '\nThis copy is complete, current, and populated. It would restore.\n'
      : `\n${failures} problem(s). Do not rely on this copy.\n`,
  )
} catch (error) {
  console.error('\nCould not read the restored copy.')
  console.error(error)
  failures += 1
} finally {
  await sql.end({ timeout: 5 })
}

process.exit(failures === 0 ? 0 : 1)
