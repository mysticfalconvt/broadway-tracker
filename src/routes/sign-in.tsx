import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/sign-in')({ component: SignIn })

function SignIn() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null)
  const [verificationSent, setVerificationSent] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setIsPending(true)

    const email = String(form.get('email'))
    const { error: signInError } = await authClient.signIn.email({
      email,
      password: String(form.get('password')),
      rememberMe: true,
    })

    setIsPending(false)
    if (signInError) {
      setVerificationEmail(signInError.status === 403 ? email : null)
      setError(
        signInError.status === 403
          ? 'Verify your email before signing in.'
          : (signInError.message ?? 'We could not sign you in. Please try again.'),
      )
      return
    }
    window.location.assign('/')
  }

  async function resendVerification() {
    if (!verificationEmail) return
    await authClient.sendVerificationEmail({
      email: verificationEmail,
      callbackURL: `${window.location.origin}/`,
    })
    setVerificationSent(true)
  }

  return (
    <main className="auth-page page-wrap">
      <section className="auth-panel" aria-labelledby="sign-in-heading">
        <p className="eyebrow">Welcome back</p>
        <h1 id="sign-in-heading">Return to your theatre.</h1>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {verificationEmail ? (
            <button className="text-action" type="button" onClick={resendVerification}>
              {verificationSent ? 'Verification email sent' : 'Resend verification email'}
            </button>
          ) : null}
          <button className="button button-primary" type="submit" disabled={isPending}>
            {isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
        <p className="auth-switch">
          New here? <Link to="/sign-up">Create an account</Link>
        </p>
      </section>
    </main>
  )
}
