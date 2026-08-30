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

/**
 * Which submit button was pressed.
 *
 * A second trap of the same family, and a worse one because it fails silently
 * in the safe direction. `new FormData(form)` does **not** include the button
 * that submitted the form, however carefully that button carries a `name` and a
 * `value` — the submitter is not a successful control until the browser builds
 * the entry list, and constructing FormData yourself skips that. So
 * `form.get('action')` is null, a guard that checks it returns early, and the
 * button does nothing at all: no error, no request, no clue.
 *
 * That shipped here. Publish and Reject on the submission review screen were
 * both dead for exactly this reason.
 */
export function pressed(event: { nativeEvent: Event }): string | null {
  const submitter = (event.nativeEvent as SubmitEvent).submitter
  if (!submitter) return null
  const value = (submitter as HTMLButtonElement).value
  return value === '' ? null : value
}
