import { describe, expect, it } from 'vitest'

import { normalizeCity, normalizeVenueName, tidyPlace, venueKey } from '../src/lib/place'

describe('normalizeCity', () => {
  it('folds the ways people write New York into one', () => {
    const forms = ['NYC', 'New York', 'new york city', 'New York, NY', 'Manhattan', 'Broadway']
    const keys = new Set(forms.map(normalizeCity))
    expect(keys).toEqual(new Set(['new york']))
  })

  it('folds other common shorthands', () => {
    expect(normalizeCity('LA')).toBe(normalizeCity('Los Angeles'))
    expect(normalizeCity('philly')).toBe(normalizeCity('Philadelphia'))
    expect(normalizeCity('Washington DC')).toBe(normalizeCity('washington'))
  })

  it('ignores case, punctuation, and stray whitespace', () => {
    expect(normalizeCity('  chicago ')).toBe('chicago')
    expect(normalizeCity('Chicago,')).toBe('chicago')
    expect(normalizeCity('Montréal')).toBe(normalizeCity('Montreal'))
  })

  it('keeps genuinely different cities apart', () => {
    expect(normalizeCity('Boston')).not.toBe(normalizeCity('Chicago'))
    expect(normalizeCity('London')).not.toBe(normalizeCity('New York'))
  })
})

describe('normalizeVenueName', () => {
  it('folds the filler words that appear on nearly every theatre', () => {
    const forms = [
      'Walter Kerr Theatre',
      'The Walter Kerr Theater',
      'walter kerr',
      'Walter  Kerr   Theatre',
    ]
    expect(new Set(forms.map(normalizeVenueName)).size).toBe(1)
  })

  it('keeps different houses apart', () => {
    expect(normalizeVenueName('Walter Kerr Theatre')).not.toBe(
      normalizeVenueName('Music Box Theatre'),
    )
    expect(normalizeVenueName('Kit Kat Club')).not.toBe(normalizeVenueName('August Wilson'))
  })
})

describe('venueKey', () => {
  it('treats the same theatre in the same city as one venue', () => {
    expect(venueKey('Walter Kerr Theatre', 'NYC')).toBe(
      venueKey('the walter kerr', 'New York City'),
    )
  })

  it('keeps same-named theatres in different cities apart', () => {
    // Plenty of cities have an "Orpheum".
    expect(venueKey('Orpheum Theatre', 'Boston')).not.toBe(venueKey('Orpheum Theatre', 'Memphis'))
  })

  it('tolerates a missing city', () => {
    expect(venueKey('Walter Kerr', null)).toBe(venueKey('Walter Kerr Theatre', undefined))
  })
})

describe('tidyPlace', () => {
  it('collapses whitespace but preserves the wording the person chose', () => {
    expect(tidyPlace('  Walter   Kerr Theatre ')).toBe('Walter Kerr Theatre')
    expect(tidyPlace('Théâtre du Nouveau Monde')).toBe('Théâtre du Nouveau Monde')
  })
})

describe('punctuation that joins rather than separates', () => {
  it('folds an apostrophe away, so O\u2019Neill and ONeill agree', () => {
    expect(normalizeVenueName("Eugene O'Neill Theatre")).toBe(
      normalizeVenueName('Eugene ONeill Theatre'),
    )
    expect(venueKey("Eugene O'Neill Theatre", 'New York')).toBe(
      venueKey('Eugene ONeill Theatre', 'NYC'),
    )
  })

  it('handles a typographic apostrophe the same as a straight one', () => {
    expect(normalizeVenueName('Eugene O\u2019Neill Theatre')).toBe(
      normalizeVenueName("Eugene O'Neill Theatre"),
    )
  })

  it('still keeps genuinely different theatres apart', () => {
    expect(normalizeVenueName('Al Hirschfeld Theatre')).not.toBe(
      normalizeVenueName('Hirschfeld Theatre'),
    )
    expect(normalizeVenueName('Music Box Theatre')).not.toBe(normalizeVenueName('Booth Theatre'))
  })
})
