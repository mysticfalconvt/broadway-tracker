import path from 'node:path'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, type Plugin } from 'vite'

/** Root-relative URL prefixes that vite owns and nitro must not answer. */
const VITE_OWNED = ['/node_modules/', '/src/']

/**
 * Nitro's dev middleware decides whether a request belongs to the app by
 * matching it against the nitro route table -- and tanstack start registers a
 * catch-all, so every URL with a file extension looks like an app route. It
 * only skips that check when the browser sends `Sec-Fetch-Dest: script`, so in
 * browsers that send `empty` (or omit the header) module requests like
 * `/src/router.tsx` and the vite HMR client's `env.mjs` get the SSR 404 page
 * instead of reaching vite. Rewriting them to `/@fs/` puts them back on
 * nitro's passthrough list.
 */
function serveViteOwnedUrls(): Plugin {
  return {
    name: 'serve-vite-owned-urls',
    enforce: 'pre',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url
        if (url && VITE_OWNED.some((prefix) => url.startsWith(prefix))) {
          req.url = `/@fs${path.posix.join(server.config.root, url)}`
        }
        next()
      })
    },
  }
}

export default defineConfig({
  server: { host: '0.0.0.0', port: 3000 },
  plugins: [
    serveViteOwnedUrls(),
    tailwindcss(),
    tanstackStart({ srcDirectory: 'src' }),
    viteReact(),
    /**
     * `sharp` stays out of the bundle.
     *
     * It is a native module: the JavaScript is portable and the `.node` binary
     * beside it is not. Bundled into `.output/server/_libs/`, the binary is
     * left behind in `node_modules/@img` and the import throws on the deployed
     * host — while the server is still loading, so nothing starts at all.
     *
     * External, it is imported from `node_modules` at run time, where its
     * platform binary actually is.
     *
     * `imageAtWidth` still treats its absence as an ordinary answer, because a
     * build that ships without it must degrade to full-size pictures rather
     * than to no application. Belt and braces, deliberately: this is the second
     * time the packaging of one optional dependency has been able to decide
     * whether anybody can sign in.
     */
    nitro({ rolldownConfig: { external: ['sharp'] } }),
  ],
})
