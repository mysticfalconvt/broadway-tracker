import { describe, expect, it } from 'vitest'

import { formFlag, formNumber, formRequired, formText, pressed } from '../src/lib/form'

function make(entries: Record<string, string>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(entries)) form.set(key, value)
  return form
}

describe('formText', () => {
  it('returns undefined for a field that is not in the form at all', () => {
    // The bug this exists to prevent: a field behind a conditional is absent,
    // and String(null) is the truthy string "null".
    const form = make({})
    expect(formText(form, 'occurredOn')).toBeUndefined()
    expect(String(form.get('occurredOn'))).toBe('null')
  })

  it('returns undefined for blank and whitespace', () => {
    expect(formText(make({ venue: '' }), 'venue')).toBeUndefined()
    expect(formText(make({ venue: '   ' }), 'venue')).toBeUndefined()
  })

  it('trims a real value', () => {
    expect(formText(make({ venue: '  Booth Theatre ' }), 'venue')).toBe('Booth Theatre')
  })

  it('never returns the string "null" or "undefined"', () => {
    for (const name of ['missing', 'alsoMissing']) {
      expect(formText(make({}), name)).not.toBe('null')
      expect(formText(make({}), name)).not.toBe('undefined')
    }
  })
})

describe('formRequired', () => {
  it('gives an empty string for an absent field, so validation reports it', () => {
    expect(formRequired(make({}), 'title')).toBe('')
  })

  it('gives the trimmed value when present', () => {
    expect(formRequired(make({ title: ' Hadestown ' }), 'title')).toBe('Hadestown')
  })
})

describe('formNumber', () => {
  it('returns undefined for absent, blank, and non-numeric', () => {
    expect(formNumber(make({}), 'year')).toBeUndefined()
    expect(formNumber(make({ year: '' }), 'year')).toBeUndefined()
    expect(formNumber(make({ year: 'last April' }), 'year')).toBeUndefined()
  })

  it('reads a number', () => {
    expect(formNumber(make({ year: '2026' }), 'year')).toBe(2026)
    expect(formNumber(make({ rating: '9' }), 'rating')).toBe(9)
  })

  it('does not turn an absent field into zero', () => {
    // Number(String(null)) is NaN, but Number('') is 0 -- either would be wrong.
    expect(formNumber(make({}), 'rating')).toBeUndefined()
  })
})

describe('formFlag', () => {
  it('is false when the checkbox was not ticked, which omits it entirely', () => {
    expect(formFlag(make({}), 'favorite')).toBe(false)
  })

  it('is true when ticked', () => {
    expect(formFlag(make({ favorite: 'on' }), 'favorite')).toBe(true)
  })
})

describe('which button was pressed', () => {
  const submit = (submitter: unknown) => ({ nativeEvent: { submitter } as unknown as Event })

  it('reads the value off the button, not out of the form', () => {
    // The whole point: a FormData built by hand does not contain this, so
    // anything that reads it from there gets null and does nothing.
    expect(pressed(submit({ value: 'publish' }))).toBe('publish')
    expect(pressed(submit({ value: 'reject' }))).toBe('reject')
  })

  it('is null when a form was submitted without a button', () => {
    // Enter pressed in a text field. The caller must decide, not assume.
    expect(pressed(submit(null))).toBeNull()
    expect(pressed(submit(undefined))).toBeNull()
  })

  it('treats a button carrying no value as no answer', () => {
    expect(pressed(submit({ value: '' }))).toBeNull()
  })
})
