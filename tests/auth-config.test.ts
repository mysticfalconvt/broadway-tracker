import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Better Auth's `additionalFields.defaultValue` is applied by the library itself
 * and wins over both the database column default and the synthetic-user hook.
 * Three places therefore have to agree, and nothing else would notice if they
 * stopped: a new account would simply be created at the wrong visibility.
 */
const auth = readFileSync('src/server/auth.ts', 'utf8')
const schema = readFileSync('src/server/db/schema.ts', 'utf8')

function authDefault(field: string) {
  const block = auth.match(new RegExp(`${field}: \\{[\\s\\S]*?\\}`))
  return block?.[0].match(/defaultValue: '(\w+)'/)?.[1]
}

describe('profile visibility default', () => {
  it('agrees between Better Auth, the schema, and the synthetic user', () => {
    const fromAuth = authDefault('profileVisibility')
    const fromSchema = schema.match(/profile_visibility[\s\S]*?\.default\('(\w+)'\)/)?.[1]
    const fromSynthetic = auth
      .slice(auth.indexOf('customSyntheticUser'))
      .match(/profileVisibility: '(\w+)'/)?.[1]

    expect(fromAuth).toBeDefined()
    expect(fromSchema).toBeDefined()
    expect(fromSynthetic).toBeDefined()
    expect({ fromAuth, fromSchema, fromSynthetic }).toEqual({
      fromAuth: fromSchema,
      fromSchema,
      fromSynthetic: fromSchema,
    })
  })
})
