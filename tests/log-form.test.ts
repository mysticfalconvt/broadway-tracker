import { describe, expect, it } from 'vitest'

import { formFlag, formNumber, formRequired, formText } from '../src/lib/form'
import { outingInput } from '../src/server/outing-functions'

/**
 * Builds the payload exactly as the log form does, from a FormData containing
 * only the fields that precision actually renders. Everything else is absent,
 * which is the case that used to send the literal string "null".
 */
function payloadFor(precision: string, rendered: Record<string, string>) {
  const form = new FormData()
  form.set('showId', '3f7c1a2b-3d4e-5f60-8a9b-0c1d2e3f4a5b')
  for (const [key, value] of Object.entries(rendered)) form.set(key, value)
  return {
    showId: formRequired(form, 'showId'),
    productionId: formText(form, 'productionId'),
    venue: formText(form, 'venue'),
    city: formText(form, 'city'),
    datePrecision: precision as 'exact',
    occurredOn: formText(form, 'occurredOn'),
    occurredMonth: formNumber(form, 'occurredMonth'),
    occurredYear: formNumber(form, 'occurredYear'),
    approximateDate: formText(form, 'approximateDate'),
    rating: formNumber(form, 'rating'),
    favorite: formFlag(form, 'favorite'),
    review: formText(form, 'review'),
    privateNotes: formText(form, 'privateNotes'),
  }
}

describe('every date precision the form offers', () => {
  it('accepts an exact date', () => {
    const result = outingInput.safeParse(payloadFor('exact', { occurredOn: '2026-05-18' }))
    expect(result.success).toBe(true)
  })

  it('accepts a month and year', () => {
    const result = outingInput.safeParse(
      payloadFor('month', { occurredMonth: '5', occurredYear: '2026' }),
    )
    expect(result.success).toBe(true)
  })

  it('accepts a year alone', () => {
    // This is the one that failed: occurredOn is not rendered, so it was absent,
    // and String(null) sent "null" to a date validator.
    const result = outingInput.safeParse(payloadFor('year', { occurredYear: '2007' }))
    expect(result.success).toBe(true)
  })

  it('accepts an approximate date', () => {
    const result = outingInput.safeParse(
      payloadFor('approximate', { approximateDate: 'Around 2005' }),
    )
    expect(result.success).toBe(true)
  })

  it('accepts no date at all', () => {
    const result = outingInput.safeParse(payloadFor('unknown', {}))
    expect(result.success).toBe(true)
  })
})

describe('the fields a precision does not render never reach the server', () => {
  it('sends no date fields for an unknown date', () => {
    const payload = payloadFor('unknown', {})
    expect(payload.occurredOn).toBeUndefined()
    expect(payload.occurredMonth).toBeUndefined()
    expect(payload.occurredYear).toBeUndefined()
    expect(payload.approximateDate).toBeUndefined()
  })

  it('sends no approximate text when a year was chosen', () => {
    const payload = payloadFor('year', { occurredYear: '2007' })
    expect(payload.approximateDate).toBeUndefined()
    expect(payload.occurredOn).toBeUndefined()
  })

  it('sends no exact date when a month was chosen', () => {
    expect(payloadFor('month', { occurredMonth: '5', occurredYear: '2026' }).occurredOn).toBeUndefined()
  })
})

describe('a missing answer is still reported', () => {
  it('asks for a date when exact is chosen without one', () => {
    const result = outingInput.safeParse(payloadFor('exact', {}))
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('occurredOn')
  })

  it('asks for a year when year is chosen without one', () => {
    const result = outingInput.safeParse(payloadFor('year', {}))
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('occurredYear')
  })

  it('asks for both parts when month is chosen with only one', () => {
    const result = outingInput.safeParse(payloadFor('month', { occurredYear: '2026' }))
    expect(result.success).toBe(false)
  })

  it('asks for text when approximate is chosen without any', () => {
    const result = outingInput.safeParse(payloadFor('approximate', {}))
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('approximateDate')
  })
})
