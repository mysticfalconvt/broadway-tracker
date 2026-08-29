import { describe, expect, it } from 'vitest'

import { isEnforcing, parseAdminEmails, roleFor } from '../src/lib/admin-roles'

describe('parseAdminEmails', () => {
  it('accepts commas, spaces, and newlines', () => {
    expect(parseAdminEmails('a@x.com, b@x.com')).toEqual(['a@x.com', 'b@x.com'])
    expect(parseAdminEmails('a@x.com b@x.com')).toEqual(['a@x.com', 'b@x.com'])
    expect(parseAdminEmails('a@x.com\nb@x.com')).toEqual(['a@x.com', 'b@x.com'])
  })

  it('folds case and trims, so a stray space cannot lock somebody out', () => {
    expect(parseAdminEmails('  Rob@Example.COM ')).toEqual(['rob@example.com'])
  })

  it('treats unset, empty, and whitespace as no list at all', () => {
    for (const value of [undefined, null, '', '   ', ',,']) {
      expect(parseAdminEmails(value)).toEqual([])
      expect(isEnforcing(value)).toBe(false)
    }
  })
})

describe('roleFor', () => {
  const list = 'rob@example.com, sarah@example.com'

  it('promotes a listed address', () => {
    expect(roleFor('rob@example.com', 'member', list)).toBe('admin')
  })

  it('matches regardless of case', () => {
    expect(roleFor('ROB@Example.com', 'member', list)).toBe('admin')
  })

  it('demotes an administrator who is no longer listed', () => {
    // This is the reason the variable exists: taking somebody off the list has
    // to actually remove their access.
    expect(roleFor('former@example.com', 'admin', list)).toBe('member')
  })

  it('returns null when nothing needs to change, so no write happens', () => {
    expect(roleFor('rob@example.com', 'admin', list)).toBeNull()
    expect(roleFor('someone@example.com', 'member', list)).toBeNull()
  })

  it('changes nothing at all when the list is unset', () => {
    // Local development and the grant-admin script keep working untouched.
    expect(roleFor('rob@example.com', 'member', undefined)).toBeNull()
    expect(roleFor('rob@example.com', 'admin', undefined)).toBeNull()
    expect(roleFor('anyone@example.com', 'admin', '')).toBeNull()
  })

  it('does not partially match a longer address', () => {
    expect(roleFor('rob@example.com.evil.test', 'member', list)).toBeNull()
    expect(roleFor('notrob@example.com', 'member', list)).toBeNull()
  })
})
