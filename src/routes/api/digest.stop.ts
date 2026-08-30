import { createFileRoute } from '@tanstack/react-router'

import { stopDigestsFor } from '../../server/digest-functions'

/**
 * Unsubscribing, from the letter, without signing in.
 *
 * Anything that asks somebody to remember a password before it will stop
 * emailing them is teaching them to report the mail as spam instead. A GET is
 * the right method here despite changing something: it is the only thing a
 * link in an email can do.
 */
export const Route = createFileRoute('/api/digest/stop')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get('token')
        if (token) await stopDigestsFor(token)
        // The same page either way: a wrong token must not report whether it
        // was ever a real one.
        return new Response(
          `<!doctype html><meta charset="utf-8">` +
            `<meta name="viewport" content="width=device-width,initial-scale=1">` +
            `<title>Letters stopped</title>` +
            `<style>body{font:16px/1.6 system-ui;margin:0;display:grid;place-items:center;` +
            `min-height:100vh;background:#faf7f2;color:#241f1c}main{max-width:26rem;padding:2rem}` +
            `h1{font:600 1.5rem/1.2 Georgia,serif}a{color:inherit}</style>` +
            `<main><h1>That is stopped.</h1>` +
            `<p>You will not get any more of these. Your theatre history is untouched, and you ` +
            `can turn them back on in your settings whenever you like.</p>` +
            `<p><a href="/">Broadway Tracker</a></p></main>`,
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        )
      },
    },
  },
})
