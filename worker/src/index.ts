import { createHandler, type AiBinding, type KvStore, type RateLimiter } from './handler'

interface Env {
  AI: AiBinding
  POOL: KvStore
  /** Per client and minute: all requests, and the ones that ask for new sentences. */
  REQUEST_LIMIT: RateLimiter
  FRESH_LIMIT: RateLimiter
  /** Comma-separated websites allowed to call this Worker from a browser. */
  ALLOWED_ORIGINS: string
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
    return createHandler({ ai: env.AI, kv: env.POOL, allowedOrigins, limiters: { requests: env.REQUEST_LIMIT, fresh: env.FRESH_LIMIT } })(request)
  },
}
