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

describe('generated show artwork', () => {
  it('every curated tone carries white type at AA', () => {
    // The lighter stop of each gradient is the worst case for the title.
    const stops = [...css.matchAll(/\.show-artwork-tone-\d+\s*\{\s*background: linear-gradient\([^,]+,\s*(#[0-9a-f]{6})/g)]
    expect(stops.length).toBeGreaterThanOrEqual(6)
    for (const [, lightStop] of stops) {
      expect(contrast('#ffffff', lightStop as string)).toBeGreaterThanOrEqual(4.5)
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

  it('gives every button variant its own text colour', () => {
    // A variant that sets a background but inherits its colour renders
    // cream-on-cream inside the dark heroes, which is invisible.
    for (const variant of ['.button-quiet', '.button-primary']) {
      const rule = css.match(new RegExp(`\\${variant}\\s*\\{([^}]*)\\}`))
      expect(rule, `${variant} rule is missing`).toBeTruthy()
      expect(rule?.[1], `${variant} must declare its own color`).toMatch(/(^|;|\s)color:/)
    }
  })

  it('scales the artwork fallback to its container, not the viewport', () => {
    // The same fallback renders at 3.5rem in a row and 21rem in a hero.
    const fallback = css.match(/\.show-artwork-fallback\s*\{([^}]*)\}/)
    expect(fallback?.[1]).toMatch(/container-type:\s*inline-size/)
    const strong = css.match(/\.show-artwork-fallback strong\s*\{([^}]*)\}/)
    expect(strong?.[1]).toMatch(/cqw/)
    expect(strong?.[1]).not.toMatch(/\d+vw/)
  })

  it('honors prefers-reduced-motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})

describe('button layout', () => {
  it('declares a display, because the class is used on anchors too', () => {
    // An <a class="button"> is inline by default: its padding would not affect
    // the line box and it would overlap the text around it.
    const rule = css.match(/\.button\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/display:\s*inline-flex/)
  })

  it('removes the underline an anchor would otherwise carry', () => {
    const rule = css.match(/\.button\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/text-decoration:\s*none/)
  })
})
