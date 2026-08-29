import { describe, expect, it } from 'vitest'

import { editDistance, findSuspectPairs, similarity } from '../src/lib/similarity'

describe('editDistance', () => {
  it('is zero for identical strings and symmetric', () => {
    expect(editDistance('hadestown', 'hadestown')).toBe(0)
    expect(editDistance('kerr', 'ker')).toBe(editDistance('ker', 'kerr'))
  })

  it('counts single-character changes', () => {
    expect(editDistance('walter kerr', 'walter ker')).toBe(1)
    expect(editDistance('suffs', 'suff')).toBe(1)
    expect(editDistance('', 'abc')).toBe(3)
  })
})

describe('similarity', () => {
  it('scores a typo as close and unrelated titles as far apart', () => {
    expect(similarity('walter kerr theatre', 'walter ker theatre')).toBeGreaterThan(0.9)
    expect(similarity('hadestown', 'hamilton')).toBeLessThan(0.6)
  })

  it('treats two empty strings as identical', () => {
    expect(similarity('', '')).toBe(1)
  })
})

describe('findSuspectPairs', () => {
  const venues = [
    { id: '1', key: 'walter kerr' },
    { id: '2', key: 'walter ker' },
    { id: '3', key: 'music box' },
    { id: '4', key: 'kit kat club' },
  ]

  it('surfaces the near-duplicate and nothing else', () => {
    const pairs = findSuspectPairs(venues, (v) => v.key)
    expect(pairs).toHaveLength(1)
    expect([pairs[0]?.a.id, pairs[0]?.b.id].sort()).toEqual(['1', '2'])
  })

  it('never reports an exact duplicate, which cannot exist here', () => {
    const pairs = findSuspectPairs(
      [
        { id: '1', key: 'walter kerr' },
        { id: '2', key: 'walter kerr' },
      ],
      (v) => v.key,
    )
    expect(pairs).toHaveLength(0)
  })

  it('ranks the closest pair first', () => {
    const pairs = findSuspectPairs(
      [
        { id: '1', key: 'the outsiders' },
        { id: '2', key: 'the outsider' },
        { id: '3', key: 'the outsidera bc' },
      ],
      (v) => v.key,
      0.7,
    )
    expect(pairs[0]?.score).toBeGreaterThanOrEqual(pairs[1]?.score ?? 0)
  })

  it('returns nothing for a catalog with no near-duplicates', () => {
    expect(findSuspectPairs([{ k: 'a' }, { k: 'zzzz' }], (v) => v.k)).toHaveLength(0)
  })
})
