import { createFileRoute } from '@tanstack/react-router'

import { actorForToken } from '../../server/api-keys'
import { runTool, toolDescriptions } from '../../server/tools'

/**
 * The app, as a tool a member's own agent can use.
 *
 * The reason this exists is a limit of the model in the house rather than of
 * the design around it. Research is reading a cast table off a web page and
 * getting the roles right; the local 120B put Tony Danza under Leo Bloom, and
 * no amount of prompting fixed it. Everything else — the tools, the provenance
 * marking, landing as a submission — was already right and is reused unchanged.
 * What moves is who does the reading.
 *
 * A key is its owner. There is no scope column and no second permission system
 * to keep in step: every call goes through the same function the website calls,
 * with the same actor id, so an agent sees what its owner sees and can do what
 * its owner can do. Which does not include publishing to the catalog.
 *
 * Point Claude Code at it with:
 *
 *   claude mcp add --transport http broadway https://…/api/mcp \
 *     --header "Authorization: Bearer bt_…"
 */

const PROTOCOL = '2025-06-18'

type Request = { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown }

const ok = (id: Request['id'], result: unknown) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, result })

const fail = (id: Request['id'], code: number, message: string) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const member = await actorForToken(
          request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
        )
        if (!member) {
          // No detail about why. A key that is revoked and a key that never
          // existed should look identical from outside.
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: Request
        try {
          body = (await request.json()) as Request
        } catch {
          return fail(null, -32700, 'That was not JSON.')
        }

        const { id, method } = body
        // Notifications carry no id and expect no reply.
        if (method?.startsWith('notifications/')) return new Response(null, { status: 202 })

        switch (method) {
          case 'initialize':
            return ok(id, {
              protocolVersion: PROTOCOL,
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: 'broadway-tracker', version: '1.0.0' },
              instructions:
                `You are acting as ${member.name} in their own theatre journal. ` +
                'Anything you add is attributed to them and waits for review before it ' +
                'becomes catalog. Research from sources you can cite, put the URL in ' +
                'sourceNote, and leave a date out rather than guessing at one — these ' +
                'dates are what the app uses to tell somebody who they saw on a night ' +
                'they half remember.',
            })

          case 'ping':
            return ok(id, {})

          case 'tools/list':
            return ok(id, { tools: toolDescriptions({ allowWrites: true }).map((t) => t.function) })

          case 'tools/call': {
            const params = (body.params ?? {}) as { name?: string; arguments?: unknown }
            if (!params.name) return fail(id, -32602, 'No tool was named.')

            const result = await runTool(member.id, params.name, params.arguments ?? {}, {
              allowWrites: true,
            })
            // A tool that refused is not a protocol error: the model should be
            // told what went wrong and allowed to try again, which is what
            // isError means here.
            return ok(id, {
              content: [
                {
                  type: 'text',
                  text: result.ok ? JSON.stringify(result.data, null, 2) : result.error,
                },
              ],
              isError: !result.ok,
            })
          }

          default:
            return fail(id, -32601, `Unknown method: ${method}`)
        }
      },
    },
  },
})
