/**
 * Reading values out of a `FormData`.
 *
 * `String(form.get(name))` is a trap: a field that is not in the DOM — one
 * behind a conditional, say — returns `null`, and `String(null)` is the
 * *truthy* string `"null"`, which sails past `|| undefined` and reaches the
 * server as real data. These helpers return `undefined` for anything absent or
 * blank, which is what callers almost always mean.
 */

/** An optional value: `undefined` when absent or blank. */
export function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** A required value, as an empty string when absent, so validation reports it. */
export function formRequired(form: FormData, name: string): string {
  return formText(form, name) ?? ''
}

/** An optional number: `undefined` when absent, blank, or not a number. */
export function formNumber(form: FormData, name: string): number | undefined {
  const text = formText(form, name)
  if (text === undefined) return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/** A checkbox, which is absent from the payload when unchecked. */
export function formFlag(form: FormData, name: string): boolean {
  return form.get(name) === 'on' || form.get(name) === 'true'
}
