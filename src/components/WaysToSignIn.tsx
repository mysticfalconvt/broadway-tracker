import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { authClient } from '../lib/auth-client'
import type { getWaysToSignIn } from '../server/social-functions'
import { removeWayToSignIn } from '../server/social-functions'

type Way = Awaited<ReturnType<typeof getWaysToSignIn>>[number]

const NAMES: Record<string, string> = {
  credential: 'Email and password',
  google: 'Google',
}

/**
 * Every door into an account, and how to add or remove one.
 *
 * The two are separate things: the address on the profile is where letters go,
 * and a Google account is a way of proving who you are. People keep an address
 * they use and a Google account they log in with, and there is no reason those
 * should have to be the same string — so linking happens here, from a session
 * that is already signed in, rather than by matching addresses on the way in.
 *
 * The last one cannot be removed. What that guard protects is not a setting; it
 * is somebody shut out of years of their own evenings, with the account still
 * there and no way back into it.
 */
export function WaysToSignIn({ ways, googleAvailable }: { ways: Way[]; googleAvailable: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const hasGoogle = ways.some((way) => way.providerId === 'google')

  async function link() {
    setBusy(true)
    setProblem(null)
    const { error } = await authClient.linkSocial({
      provider: 'google',
      callbackURL: `${window.location.origin}/settings`,
    })
    if (error) {
      setProblem('We could not reach Google just then. Please try again.')
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    setProblem(null)
    try {
      await removeWayToSignIn({ data: { id } })
      await router.invalidate()
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : 'That could not be removed.')
    }
    setBusy(false)
  }

  return (
    <section className="settings-section">
      <h2>Ways to sign in</h2>
      <p className="settings-note">
        More than one is fine, and they do not have to share an address.
      </p>

      <ul className="ways-list">
        {ways.map((way) => (
          <li key={way.id}>
            <span>{NAMES[way.providerId] ?? way.providerId}</span>
            {ways.length > 1 ? (
              <button
                className="text-action text-action-warn"
                disabled={busy}
                onClick={() => void remove(way.id)}
                type="button"
              >
                Remove
              </button>
            ) : (
              // Said rather than left as a disabled button somebody has to
              // guess the reason for.
              <span className="ways-only">Your only way in</span>
            )}
          </li>
        ))}
      </ul>

      {googleAvailable && !hasGoogle ? (
        <button
          className="button button-quiet"
          disabled={busy}
          onClick={() => void link()}
          type="button"
        >
          {busy ? 'Opening Google…' : 'Add Google'}
        </button>
      ) : null}

      {problem ? (
        <p className="form-error" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  )
}
