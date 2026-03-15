import { CounterService } from '@hexo-cloudflare-counter/core'
import { createApp } from './app'
import { SQLiteCounterRepository } from './repositories/sqlite'
import type { WriteSecurityOptions } from './security/write-guard'

interface NodeAppOptions {
    sqlitePath?: string
    appId?: string
    appKey?: string
    signMaxAgeMs?: number
    maxBodySize?: number
    corsAllowOrigins?: string[]
    writeSecurity?: WriteSecurityOptions
}

const servicesByPath = new Map<string, CounterService>()

function getDefaultSqlitePath(): string {
    return process.env.SQLITE_PATH || 'data/counters.sqlite'
}

function getNodeCounterService(sqlitePath: string): CounterService {
    if (sqlitePath === ':memory:') {
        return new CounterService(new SQLiteCounterRepository(sqlitePath))
    }

    const existingService = servicesByPath.get(sqlitePath)
    if (existingService) {
        return existingService
    }

    const counterService = new CounterService(new SQLiteCounterRepository(sqlitePath))
    servicesByPath.set(sqlitePath, counterService)
    return counterService
}

export function createNodeApp(options: NodeAppOptions = {}) {
    const sqlitePath = options.sqlitePath ?? getDefaultSqlitePath()
    const requestScopedCounterService = sqlitePath === ':memory:' ? getNodeCounterService(sqlitePath) : null

    return createApp({
        appId: options.appId,
        appKey: options.appKey,
        signMaxAgeMs: options.signMaxAgeMs,
        maxBodySize: options.maxBodySize,
        corsAllowOrigins: options.corsAllowOrigins,
        writeSecurity: options.writeSecurity,
        resolveCounterService: () => requestScopedCounterService ?? getNodeCounterService(sqlitePath),
    })
}

const app = createNodeApp()

if (typeof process !== 'undefined' && process.env.BENCHMARKS_TEST === 'true') {
    setTimeout(() => {
        process.exit(0)
    }, 20000)
}

export default app
