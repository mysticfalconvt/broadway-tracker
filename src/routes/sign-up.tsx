import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/sign-up')({ component: SignUp })

function SignUp() {
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, setIsPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setIsPending(true)

    const { error: signUpError } = await authClient.signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
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
          <form className="auth-form" onSubmit={submit}>
            <label>
              Your name
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
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
