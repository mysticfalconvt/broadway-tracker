import 'dotenv/config'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { user } from './schema'

const email = process.argv[2]?.trim().toLowerCase()
const databaseUrl = process.env.DATABASE_URL
if (!email) throw new Error('Usage: pnpm db:grant-admin <email>')
if (!databaseUrl) throw new Error('DATABASE_URL is not set.')

const client = postgres(databaseUrl, { prepare: false })
const db = drizzle(client)

try {
  const [admin] = await db
    .update(user)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(user.email, email))
    .returning({ email: user.email })
  if (!admin) throw new Error(`No account exists for ${email}.`)
  console.log(`${admin.email} is now an administrator.`)
} finally {
  await client.end({ timeout: 5 })
}
