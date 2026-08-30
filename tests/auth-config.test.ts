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

function agrees(field: string, column: string) {
  const fromAuth = authDefault(field)
  const fromSchema = schema.match(new RegExp(`${column}[\\s\\S]*?\\.default\\('(\\w+)'\\)`))?.[1]
  const fromSynthetic = auth
    .slice(auth.indexOf('customSyntheticUser'))
    .match(new RegExp(`${field}: '(\\w+)'`))?.[1]

  expect(fromAuth, `${field} missing from additionalFields`).toBeDefined()
  expect(fromSchema, `${column} missing a column default`).toBeDefined()
  expect(fromSynthetic, `${field} missing from the synthetic user`).toBeDefined()
  expect({ fromAuth, fromSchema, fromSynthetic }).toEqual({
    fromAuth: fromSchema,
    fromSchema,
    fromSynthetic: fromSchema,
  })
}

describe('defaults Better Auth applies for itself', () => {
  it('agree about profile visibility', () => {
    agrees('profileVisibility', 'profile_visibility')
  })

  it('agree about how often to write to somebody', () => {
    agrees('digestCadence', 'digest_cadence')
  })
})
