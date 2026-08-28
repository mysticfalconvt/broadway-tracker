import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Guards the palette against silent accessibility regressions. Each pair below
 * is a combination the stylesheet actually renders, not every possible pairing --
 * a token pair that never meets on screen does not need to pass.
 */
const css = readFileSync('src/styles.css', 'utf8')

function token(name: string) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`Design token --${name} is missing`)
  return match[1]
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrast(a: string, b: string) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

const CREAM = '#fffdf8'

describe('text contrast meets WCAG AA (4.5:1)', () => {
  const pairs: [string, string, string][] = [
    ['body text on canvas', 'ink', 'canvas'],
    ['body text on surface', 'ink', 'surface'],
    ['body text on muted surface', 'ink', 'surface-muted'],
    ['metadata on canvas', 'ink-muted', 'canvas'],
    ['metadata on surface', 'ink-muted', 'surface'],
    ['metadata on muted surface', 'ink-muted', 'surface-muted'],
    ['seen status on surface', 'success', 'surface'],
    ['favorite status on surface', 'oxblood', 'surface'],
    ['error text on surface', 'danger', 'surface'],
    ['hero eyebrow on midnight', 'brass', 'midnight'],
  ]
  for (const [label, fg, bg] of pairs) {
    it(label, () => {
      expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('cream type on the dark sections', () => {
    for (const bg of ['midnight', 'midnight-soft', 'oxblood', 'oxblood-deep']) {
      expect(contrast(CREAM, token(bg))).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('non-text contrast meets WCAG 1.4.11 (3:1)', () => {
  it('form field borders read against every surface they sit on', () => {
    for (const bg of ['canvas', 'surface', 'surface-muted']) {
      expect(contrast(token('field-border'), token(bg))).toBeGreaterThanOrEqual(3)
    }
  })

  it('the focus ring reads against every surface it sits on', () => {
    for (const bg of ['canvas', 'surface', 'surface-muted']) {
      expect(contrast(token('midnight'), token(bg))).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('stylesheet invariants', () => {
  it('never suppresses a focus outline', () => {
    expect(css).not.toMatch(/outline:\s*(none|0)\b/)
  })

  it('defines a global focus-visible ring', () => {
    expect(css).toMatch(/^:focus-visible\s*\{/m)
  })

  it('honors prefers-reduced-motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})
