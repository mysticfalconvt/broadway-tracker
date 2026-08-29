import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { authClient } from '../lib/auth-client'
import { checkHandle } from '../server/auth-functions'

export const Route = createFileRoute('/sign-up')({ component: SignUp })

function SignUp() {
  const [handle, setHandle] = useState('')
  const [handleState, setHandleState] = useState<Awaited<ReturnType<typeof checkHandle>> | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, setIsPending] = useState(false)

  // Tell someone their handle is taken while they are still typing it, rather
  // than after they have filled in the rest of the form.
  useEffect(() => {
    if (!handle.trim()) {
      setHandleState(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void checkHandle({ data: { handle } })
        .then((result) => {
          if (!cancelled) setHandleState(result)
        })
        .catch(() => {
          // Availability is a courtesy; the server decides on submit either way.
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [handle])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setIsPending(true)

    const chosen = String(form.get('handle') ?? '').trim()
    const { error: signUpError } = await authClient.signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
      // Left blank, the server picks one from the display name.
      ...(chosen ? { handle: chosen } : {}),
      callbackURL: `${window.location.origin}/`,
    })

    setIsPending(false)
    if (signUpError) {
      setError(signUpError.message ?? 'We could not create your account. Please try again.')
      return
    }
    setSubmitted(true)
  }

  return (
    <main className="auth-page page-wrap">
      <section className="auth-panel" aria-labelledby="sign-up-heading">
        <p className="eyebrow">Begin your collection</p>
        <h1 id="sign-up-heading">Create your theatre journal.</h1>
        {submitted ? (
          <p className="auth-message" role="status">
            Check your email to verify your account before signing in.
          </p>
        ) : (
          <form className="auth-form" method="post" action="/sign-up" onSubmit={submit}>
            <label>
              Your name
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Handle <span>Optional</span>
              <input
                name="handle"
                value={handle}
                autoComplete="off"
                placeholder="theatrelover"
                onChange={(event) => setHandle(event.target.value)}
              />
              <span>
                {handleState
                  ? (handleState.problem ?? `@${handleState.handle} is available.`)
                  : 'How friends find you. Leave blank and we will choose one for you.'}
              </span>
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <span>At least 8 characters.</span>
            </label>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button button-primary" type="submit" disabled={isPending}>
              {isPending ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        )}
        <p className="auth-switch">
          Already have an account? <Link to="/sign-in">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
