import { describe, expect, it } from 'vitest'

import { generateHandle, handleProblem, isValidHandle, normalizeHandle } from '../src/lib/handle'

describe('normalizeHandle', () => {
  it('folds case, trims, and drops characters that are not allowed', () => {
    expect(normalizeHandle('  Rob.Boskind! ')).toBe('rob-boskind')
    // Accents fold to their base letter rather than vanishing.
    expect(normalizeHandle('Théâtre Lover')).toBe('theatre-lover')
  })

  it('collapses and trims hyphens', () => {
    expect(normalizeHandle('--rob---boskind--')).toBe('rob-boskind')
  })
})

describe('handleProblem', () => {
  it('accepts a reasonable handle', () => {
    expect(handleProblem('rob-boskind')).toBeNull()
    expect(handleProblem('sarah42')).toBeNull()
  })

  it('explains what is wrong rather than just refusing', () => {
    expect(handleProblem('ab')).toMatch(/three characters/)
    expect(handleProblem('!!!')).toMatch(/letters, numbers/)
    expect(handleProblem('a'.repeat(31))).toMatch(/thirty/)
  })
})

describe('generateHandle', () => {
  it('builds from the display name, never from an email', () => {
    const handle = generateHandle('Rob Boskind', () => 0.5)
    expect(handle).toBe('rob-boskind-5500')
    expect(handle).not.toContain('@')
  })

  it('always produces something valid', () => {
    for (const name of ['Rob Boskind', 'X', '', null, undefined, '!!!', 'Ω']) {
      expect(isValidHandle(generateHandle(name))).toBe(true)
    }
  })

  it('falls back when a name gives nothing usable', () => {
    expect(generateHandle('!!!', () => 0)).toBe('theatregoer-1000')
    expect(generateHandle(null, () => 0)).toBe('theatregoer-1000')
  })

  it('varies its suffix, so two people with one name do not collide every time', () => {
    const handles = new Set(Array.from({ length: 200 }, () => generateHandle('Rob Boskind')))
    expect(handles.size).toBeGreaterThan(100)
  })

  it('reveals nothing about an address', () => {
    // The old scheme embedded the local part and a hash of the whole address.
    const handle = generateHandle('Sarah Chen')
    expect(handle).not.toMatch(/gmail|chen@|\d{8}/)
  })
})
