import { describe, expect, it } from 'vitest'

import { normalizePersonName, tidyPersonName } from '../src/lib/person'

describe('normalizePersonName', () => {
  it('folds case, accents, and punctuation', () => {
    expect(normalizePersonName('Ana Gasteyer')).toBe(normalizePersonName('ana gasteyer'))
    expect(normalizePersonName('Renée Elise Goldsberry')).toBe(
      normalizePersonName('Renee Elise Goldsberry'),
    )
    expect(normalizePersonName('  Alex   Brightman ')).toBe('alex brightman')
  })

  it('folds an apostrophe rather than splitting the name on it', () => {
    expect(normalizePersonName("Kelli O'Hara")).toBe(normalizePersonName('Kelli OHara'))
    expect(normalizePersonName('Kelli O’Hara')).toBe(normalizePersonName("Kelli O'Hara"))
  })

  it('keeps different people apart, including similar names', () => {
    // Guessing these are the same person would be worse than a duplicate.
    expect(normalizePersonName('Alex Brightman')).not.toBe(
      normalizePersonName('Alexander Brightman'),
    )
    expect(normalizePersonName('Sara Chase')).not.toBe(normalizePersonName('Sarah Chase'))
    expect(normalizePersonName('Ann Harada')).not.toBe(normalizePersonName('Anna Harada'))
  })
})

describe('tidyPersonName', () => {
  it('collapses whitespace but preserves the wording', () => {
    expect(tidyPersonName('  Brad   Oscar ')).toBe('Brad Oscar')
    expect(tidyPersonName('Renée Elise Goldsberry')).toBe('Renée Elise Goldsberry')
  })
})
