import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { z } from 'zod'

import { GoogleSignIn } from '../components/GoogleSignIn'
import { authClient } from '../lib/auth-client'
import { auth } from '../server/auth'
import { getSocialProviders } from '../server/social-functions'

export const Route = createFileRoute('/sign-in')({
  validateSearch: z.object({ error: z.string().optional() }),
  server: { handlers: { POST: signInFromForm } },
  loader: () => getSocialProviders(),
  component: SignIn,
})

async function signInFromForm({ request }: { request: Request }) {
  if (process.env.NODE_ENV !== 'production') console.info('[auth] form sign-in request')
  const form = await request.formData()
  const response = await auth.handler(
    new Request(new URL('/api/auth/sign-in/email', request.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        rememberMe: true,
      }),
    }),
  )
  if (process.env.NODE_ENV !== 'production') {
    console.info('[auth] form sign-in response', { status: response.status })
  }
  if (!response.ok) {
    let error = 'sign-in-failed'
    if (response.status === 403) {
      const email = String(form.get('email') ?? '')
      const verificationResponse = await auth.handler(
        new Request(new URL('/api/auth/send-verification-email', request.url), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, callbackURL: new URL('/', request.url).toString() }),
        }),
      )
      error = verificationResponse.ok ? 'verification-sent' : 'verification-required'
      if (process.env.NODE_ENV !== 'production') {
        console.info('[auth] verification resend response', { status: verificationResponse.status })
      }
    }
    return Response.redirect(new URL(`/sign-in?error=${error}`, request.url), 303)
  }
  const headers = new Headers({ location: '/', 'cache-control': 'no-store' })
  const cookie = response.headers.get('set-cookie')
  if (cookie) headers.set('set-cookie', cookie)
  return new Response(null, { status: 303, headers })
}

function SignIn() {
  const providers = Route.useLoaderData()
  const { error: serverError } = Route.useSearch()
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
        <form className="auth-form" method="post" action="/sign-in" onSubmit={submit}>
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {serverError === 'verification-sent' ? (
            <p className="auth-message" role="status">
              Verification email sent. Check your inbox before signing in.
            </p>
          ) : null}
          {error || (serverError && serverError !== 'verification-sent') ? (
            <p className="form-error" role="alert">
              {error ??
                (serverError === 'verification-required'
                  ? 'Verify your email before signing in.'
                  : 'We could not sign you in. Check your email and password.')}
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
        {providers.google ? <GoogleSignIn label="Continue with Google" /> : null}
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
