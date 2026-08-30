/**
 * Turning HTML entities back into the characters they stand for.
 *
 * This is a normalisation the app did not need until agents started feeding it.
 * A person typing into a form types "&"; a model reading a cast list off a web
 * page reads "&amp;" and passes it straight through, so "Johnny Bevan &amp;
 * Others" lands in the catalog and stays there. The web is now the main way
 * facts arrive here, which makes decoding them our job rather than the
 * caller's — an agent that has to remember to unescape is an agent that will
 * eventually forget.
 *
 * Deliberately a small table rather than a parser. What arrives is a role or a
 * person's name, not a document, and the handful below are what actually turn
 * up in one. Numeric escapes are handled generally because they are trivial to
 * and cost nothing.
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
}

export function decodeEntities(value: string): string {
  // `&amp;amp;` happens when text is escaped twice on its way here, so this
  // runs until it stops changing rather than exactly once. Bounded, because a
  // fixed point is the goal and a loop is not.
  let text = value
  for (let pass = 0; pass < 3; pass++) {
    const next = text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
      if (body.startsWith('#')) {
        const code =
          body.startsWith('#x') || body.startsWith('#X')
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10)
        // Anything outside the range, or a control character, is left alone:
        // a name is not the place to discover an unprintable codepoint.
        return Number.isFinite(code) && code >= 32 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole
      }
      return NAMED[body.toLowerCase()] ?? whole
    })
    if (next === text) break
    text = next
  }
  return text
}
