import { describe, expect, it } from 'vitest'

import { ARTWORK_TONES, toneForTitle } from '../src/lib/artwork'

describe('toneForTitle', () => {
  it('is stable for the same title', () => {
    expect(toneForTitle('Hadestown')).toBe(toneForTitle('Hadestown'))
  })

  it('always lands inside the curated palette', () => {
    for (const title of ['Hadestown', 'Suffs', 'Wicked', '', 'A', 'Les Misérables', '!!!']) {
      const tone = toneForTitle(title)
      expect(tone).toBeGreaterThanOrEqual(0)
      expect(tone).toBeLessThan(ARTWORK_TONES)
      expect(Number.isInteger(tone)).toBe(true)
    }
  })

  it('spreads a realistic catalog across every tone', () => {
    const titles = [
      'Hadestown',
      'Suffs',
      'Wicked',
      'Hamilton',
      'Cabaret',
      'Gypsy',
      'Rent',
      'The Lion King',
      'The Outsiders',
      'Operation Mincemeat',
      'Maybe Happy Ending',
      'Angels in America',
      'Death of a Salesman',
      'John Proctor Is the Villain',
      'Les Misérables',
      'Company',
      'Six',
      'Chicago',
      'Hair',
      'Oklahoma!',
    ]
    const used = new Set(titles.map(toneForTitle))
    expect(used.size).toBe(ARTWORK_TONES)
  })

  it('gives neighbouring titles different tones', () => {
    // A hash that ignored ordering would collide on these.
    expect(toneForTitle('Cats')).not.toBe(toneForTitle('Cast'))
  })
})
