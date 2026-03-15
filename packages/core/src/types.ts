import type { D1Database } from '@cloudflare/workers-types'
import type { CounterService } from './counter/service'

export interface AppBindings {
    NODE_ENV: string
    PORT: string
    LOGFILES: string
    LOG_LEVEL: string
    APP_ID: string
    APP_KEY: string
    CORS_ALLOW_ORIGIN: string
    CORS_ALLOW_ORIGINS: string
    RATE_LIMIT_MAX_WRITES: string
    RATE_LIMIT_WINDOW_MS: string
    DEDUPE_WINDOW_MS: string
    SIGN_MAX_AGE_MS: string
    SQLITE_PATH: string
    TIMEOUT: string
    MAX_BODY_SIZE: string
    BENCHMARKS_TEST: string
    COUNTER_DB: D1Database
}

declare module 'hono' {
    interface ContextVariableMap {
        appId: string
        appKey: string
        signMaxAgeMs: number
        counterService: CounterService
    }
}
