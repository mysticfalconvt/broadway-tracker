/**
 * Handles: the name a friend looks you up by.
 *
 * A handle is shown to approved friends and to administrators, so it must never
 * be derived from an email address. An earlier version was built from the local
 * part plus a hash of the address, which meant a handle could confirm a guessed
 * email offline -- domain and all.
 */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{2,29}$/

/** Folds what someone typed into the stored form. */
export function normalizeHandle(value: string): string {
  return (
    value
      .normalize('NFKD')
      // Fold accents rather than deleting them, so Théâtre reads as theatre.
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      // Anything separating words becomes a hyphen, so a typed name survives.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  )
}

export function isValidHandle(value: string): boolean {
  return HANDLE_PATTERN.test(value)
}

/** Why a handle was refused, in words a person can act on. */
export function handleProblem(value: string): string | null {
  const handle = normalizeHandle(value)
  if (!handle) return 'Use letters, numbers, and hyphens.'
  if (handle.length < 3) return 'A handle needs at least three characters.'
  if (handle.length > 30) return 'A handle can be at most thirty characters.'
  if (!isValidHandle(handle)) return 'Use lowercase letters, numbers, and hyphens.'
  return null
}

/**
 * The fallback when someone would rather not choose one. Built from the display
 * name, which their friends already see, plus a random suffix -- random rather
 * than derived, so it reveals nothing and confirms nothing.
 */
export function generateHandle(name: string | null | undefined, random: () => number = Math.random) {
  const base = normalizeHandle(name ?? '').slice(0, 20).replace(/-$/, '')
  const suffix = String(Math.floor(random() * 9000) + 1000)
  const stem = base.length >= 3 ? base : 'theatregoer'
  return `${stem}-${suffix}`
}
