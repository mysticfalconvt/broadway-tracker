import { describe, expect, it } from 'vitest'

import { buildObjectKey, isValidObjectKey } from '../src/server/storage'

describe('object key generation', () => {
  it('namespaces by prefix and uses the sniffed format extension', () => {
    expect(buildObjectKey('shows', 'image/png')).toMatch(/^shows\/[0-9a-f-]{36}\.png$/)
    expect(buildObjectKey('avatars', 'image/jpeg')).toMatch(/^avatars\/[0-9a-f-]{36}\.jpg$/)
    expect(buildObjectKey('shows', 'image/webp')).toMatch(/^shows\/[0-9a-f-]{36}\.webp$/)
  })

  it('never repeats a key', () => {
    const keys = new Set(Array.from({ length: 500 }, () => buildObjectKey('shows', 'image/png')))
    expect(keys.size).toBe(500)
  })

  it('produces keys that pass its own validator', () => {
    for (const prefix of ['shows', 'avatars'] as const) {
      expect(isValidObjectKey(buildObjectKey(prefix, 'image/png'))).toBe(true)
    }
  })
})

describe('object key validation', () => {
  it('refuses path traversal', () => {
    expect(isValidObjectKey('shows/../../etc/passwd')).toBe(false)
    expect(isValidObjectKey('../shows/a.png')).toBe(false)
    expect(isValidObjectKey('shows/..%2f..%2fetc%2fpasswd')).toBe(false)
    expect(isValidObjectKey('shows/subdir/file.png')).toBe(false)
  })

  it('refuses an unknown prefix, so one route cannot read another namespace', () => {
    expect(isValidObjectKey('vaultwarden-backups/x.png')).toBe(false)
    expect(isValidObjectKey('backups/00000000-0000-0000-0000-000000000000.png')).toBe(false)
  })

  it('refuses a leading slash or an absolute path', () => {
    expect(isValidObjectKey('/shows/00000000-0000-0000-0000-000000000000.png')).toBe(false)
  })

  it('refuses an extension we do not store', () => {
    const id = '00000000-0000-0000-0000-000000000000'
    expect(isValidObjectKey(`shows/${id}.svg`)).toBe(false)
    expect(isValidObjectKey(`shows/${id}.html`)).toBe(false)
    expect(isValidObjectKey(`shows/${id}.php`)).toBe(false)
    expect(isValidObjectKey(`shows/${id}.png.html`)).toBe(false)
  })

  it('refuses a non-uuid name, so keys cannot be guessed by pattern', () => {
    expect(isValidObjectKey('shows/logo.png')).toBe(false)
    expect(isValidObjectKey('shows/1.png')).toBe(false)
  })

  it('refuses a newline-smuggled key', () => {
    const id = '00000000-0000-0000-0000-000000000000'
    expect(isValidObjectKey(`shows/${id}.png\nshows/other.png`)).toBe(false)
  })

  it('accepts exactly the shape it generates', () => {
    expect(isValidObjectKey('shows/0f9c1a2b-3d4e-5f60-8a9b-0c1d2e3f4a5b.png')).toBe(true)
    expect(isValidObjectKey('avatars/0f9c1a2b-3d4e-5f60-8a9b-0c1d2e3f4a5b.jpg')).toBe(true)
  })
})
