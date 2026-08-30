/**
 * Normalisation for people's names, so the same performer entered by different
 * members collides instead of multiplying.
 *
 * Deliberately conservative. A venue can drop "Theatre" because every theatre
 * has it; a person's every word carries meaning, so only case, accents, and
 * punctuation are folded. "Alex Brightman" and "Alexander Brightman" stay
 * apart — guessing they are the same would be a worse error than a duplicate an
 * administrator can merge.
 */
export function normalizePersonName(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // An apostrophe joins a word rather than separating it: O'Hara, D'Arcy.
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  )
}

/** Tidies what gets stored for display, preserving the wording. */
export function tidyPersonName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}
