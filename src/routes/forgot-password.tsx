import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/forgot-password')({ component: ForgotPassword })

function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [isPending, setIsPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsPending(true)
    await authClient.requestPasswordReset({
      email: String(form.get('email')),
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setIsPending(false)
    setSent(true)
  }

  return (
    <main className="auth-page page-wrap">
      <section className="auth-panel" aria-labelledby="forgot-password-heading">
        <p className="eyebrow">Account recovery</p>
        <h1 id="forgot-password-heading">Reset your password.</h1>
        {sent ? (
          <p className="auth-message" role="status">
            If that email has an account, a reset link is on its way.
          </p>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <button className="button button-primary" type="submit" disabled={isPending}>
              {isPending ? 'Sending link...' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="auth-switch">
          <Link to="/sign-in">Return to sign in</Link>
        </p>
      </section>
    </main>
  )
}
