import { createServerOnlyFn } from '@tanstack/react-start'

/**
 * The language model, which runs on a machine in the house.
 *
 * That is the whole reason it is local rather than a hosted API: anything this
 * is asked to reason about touches somebody's private journal, and a hosted
 * model means their theatre history and their friends' names leave the
 * building. There is deliberately no cloud fallback for a slow night — the
 * feature degrading is a better outcome than the data moving.
 */

export type Message = { role: 'system' | 'user'; content: string }

export const askModel = createServerOnlyFn(
  async (messages: Message[], { maxTokens = 4_000, temperature = 0.1 } = {}) => {
    const endpoint = process.env.LM_STUDIO_ENDPOINT
    const model = process.env.CHAT_MODEL_NAME
    if (!endpoint || !model) throw new Error('No language model is configured.')

    const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        // Near-zero: this is extraction, not writing. Somewhere a date is being
        // read off a page, and imagination is the failure mode.
        temperature,
        max_tokens: maxTokens,
      }),
      // Generous. A 120B model on one box is not fast, and the alternative to
      // waiting is a half-filled catalog.
      signal: AbortSignal.timeout(180_000),
    })
    if (!response.ok) {
      throw new Error(`The model answered ${response.status}. Is it loaded?`)
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = body.choices?.[0]?.message?.content
    if (!text) throw new Error('The model returned nothing.')
    return text
  },
)

/**
 * The same, insisting on JSON.
 *
 * Models wrap JSON in prose and fences however firmly they are asked not to, so
 * this takes the first balanced object rather than trusting the whole reply.
 */
export const askModelForJson = createServerOnlyFn(
  async <T>(messages: Message[], options?: { maxTokens?: number }): Promise<T> => {
    const raw = await askModel(messages, options)
    const start = raw.indexOf('{')
    if (start === -1) throw new Error('The model did not return any JSON.')

    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < raw.length; i++) {
      const char = raw[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') inString = !inString
      if (inString) continue
      if (char === '{') depth += 1
      if (char === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            return JSON.parse(raw.slice(start, i + 1)) as T
          } catch (error) {
            throw new Error(
              `The model returned something that is not valid JSON: ${(error as Error).message}`,
            )
          }
        }
      }
    }
    throw new Error('The model returned JSON that was cut off before it finished.')
  },
)
