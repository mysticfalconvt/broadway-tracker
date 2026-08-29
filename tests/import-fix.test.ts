import { describe, expect, it } from 'vitest'

import { applyVenueFix, applyVenueFixes } from '../src/lib/import-fix'

const fix = {
  given: 'Booth Theater',
  city: 'Boston',
  name: 'Booth Theatre',
  venueCity: 'New York',
}

describe('applyVenueFix', () => {
  it('corrects a standalone venue entry', () => {
    const json = JSON.stringify([{ name: 'Booth Theater', city: 'Boston' }])
    const result = JSON.parse(applyVenueFix(json, fix))
    expect(result[0]).toEqual({ name: 'Booth Theatre', city: 'New York' })
  })

  it('corrects a venue named inside a production', () => {
    const json = JSON.stringify({
      shows: [
        {
          title: 'A Show',
          type: 'play',
          productions: [
            { name: 'Broadway', productionType: 'broadway', venue: 'Booth Theater', city: 'Boston' },
          ],
        },
      ],
    })
    const result = JSON.parse(applyVenueFix(json, fix))
    expect(result.shows[0].productions[0]).toMatchObject({
      venue: 'Booth Theatre',
      city: 'New York',
    })
  })

  it('corrects every occurrence, not just the first', () => {
    const json = JSON.stringify([
      { name: 'Booth Theater', city: 'Boston' },
      { name: 'Booth Theater', city: 'Boston' },
    ])
    const result = JSON.parse(applyVenueFix(json, fix))
    expect(result.every((v: { name: string }) => v.name === 'Booth Theatre')).toBe(true)
  })

  it('leaves other venues alone', () => {
    const json = JSON.stringify([
      { name: 'Booth Theater', city: 'Boston' },
      { name: 'Music Box Theatre', city: 'New York' },
    ])
    const result = JSON.parse(applyVenueFix(json, fix))
    expect(result[1]).toEqual({ name: 'Music Box Theatre', city: 'New York' })
  })

  it('adds a city that was missing rather than leaving it out', () => {
    const json = JSON.stringify([{ name: 'Booth Theatre' }])
    const result = JSON.parse(
      applyVenueFix(json, { given: 'Booth Theatre', city: null, name: 'Booth Theatre', venueCity: 'New York' }),
    )
    expect(result[0]).toEqual({ name: 'Booth Theatre', city: 'New York' })
  })

  it('preserves the rest of the document untouched', () => {
    const json = JSON.stringify({
      shows: [{ title: 'A Show', type: 'play', synopsis: 'Keep me.' }],
      venues: [{ name: 'Booth Theater', city: 'Boston' }],
    })
    const result = JSON.parse(applyVenueFix(json, fix))
    expect(result.shows[0].synopsis).toBe('Keep me.')
    expect(result.venues[0].name).toBe('Booth Theatre')
  })

  it('returns readable, re-editable JSON', () => {
    const out = applyVenueFix(JSON.stringify([{ name: 'Booth Theater', city: 'Boston' }]), fix)
    expect(out).toContain('\n  ')
    expect(() => JSON.parse(out)).not.toThrow()
  })

  it('applies several fixes together', () => {
    const json = JSON.stringify([
      { name: 'Booth Theater', city: 'Boston' },
      { name: 'Al Hirschfield Theatre', city: 'New York' },
    ])
    const result = JSON.parse(
      applyVenueFixes(json, [
        fix,
        {
          given: 'Al Hirschfield Theatre',
          city: 'New York',
          name: 'Al Hirschfeld Theatre',
          venueCity: 'New York',
        },
      ]),
    )
    expect(result.map((v: { name: string }) => v.name)).toEqual([
      'Booth Theatre',
      'Al Hirschfeld Theatre',
    ])
  })
})
