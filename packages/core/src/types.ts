import type { CounterService } from './counter/service'

export interface AppBindings {
    NODE_ENV: string
    PORT: string
    LOGFILES: string
    LOG_LEVEL: string
    APP_ID: string
    APP_KEY: string
    SQLITE_PATH: string
    TIMEOUT: string
    MAX_BODY_SIZE: string
    BENCHMARKS_TEST: string
    COUNTER_DB: unknown
}

declare module 'hono' {
    interface ContextVariableMap {
        appId: string
        appKey: string
        counterService: CounterService
    }
}
