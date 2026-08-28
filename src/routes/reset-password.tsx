import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/reset-password')({ component: ResetPassword })

function ResetPassword() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)

  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') ?? null), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const password = String(new FormData(event.currentTarget).get('password'))
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token })
    if (resetError) {
      setError(resetError.message ?? 'We could not reset your password. Please request a new link.')
      return
    }
    setComplete(true)
  }

  return (
    <main className="auth-page page-wrap">
      <section className="auth-panel" aria-labelledby="reset-password-heading">
        <p className="eyebrow">Account recovery</p>
        <h1 id="reset-password-heading">Choose a new password.</h1>
        {complete ? (
          <p className="auth-message" role="status">
            Your password has been reset. <Link to="/sign-in">Sign in</Link>
          </p>
        ) : token ? (
          <form className="auth-form" onSubmit={submit}>
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button button-primary" type="submit">
              Reset password
            </button>
          </form>
        ) : (
          <p className="form-error" role="alert">
            This reset link is missing or has expired.
          </p>
        )}
      </section>
    </main>
  )
}
