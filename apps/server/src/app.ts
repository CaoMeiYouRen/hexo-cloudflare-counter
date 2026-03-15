import { Hono, type Context } from 'hono'
import { timeout } from 'hono/timeout'
import { secureHeaders } from 'hono/secure-headers'
import { showRoutes } from 'hono/dev'
import { env, getRuntimeKey } from 'hono/adapter'
import { bodyLimit } from 'hono/body-limit'
import { requestId } from 'hono/request-id'
import { createRoutes, type AppBindings, type CounterService } from '@hexo-cloudflare-counter/core'
import { __DEV__ } from './env'
import { createCorsMiddleware } from './middlewares/cors'
import { loggerMiddleware } from './middlewares/logger'
import { errorhandler, notFoundHandler } from './middlewares/error'
import { resolveClientIdentifier, resolveWriteSecurityOptions, sharedWriteGuard, type WriteSecurityOptions } from './security/write-guard'

type AppContext = Context<{ Bindings: AppBindings }>

interface AppOptions {
    resolveCounterService: (context: AppContext) => CounterService | Promise<CounterService>
    appId?: string
    appKey?: string
    signMaxAgeMs?: number
    maxBodySize?: number
    corsAllowOrigins?: string[]
    writeSecurity?: WriteSecurityOptions
}

export function createApp(options: AppOptions) {
    const app = new Hono<{ Bindings: AppBindings }>()

    app.use(requestId())
    app.use((c, next) => {
        const benchmarksTest = env(c).BENCHMARKS_TEST
        if (benchmarksTest === 'true') {
            return next()
        }
        return loggerMiddleware(c, next)
    })
    app.use((c, next) => {
        const timeoutMs = parseInt(env(c).TIMEOUT || '60000') || 60000
        return timeout(timeoutMs)(c, next)
    })
    app.use((c, next) => {
        const maxBodySize = options.maxBodySize ?? (parseInt(env(c).MAX_BODY_SIZE || `${1024 * 1024}`) || 1024 * 1024)
        return bodyLimit({ maxSize: maxBodySize })(c, next)
    })
    app.use((c, next) => {
        c.set('appId', options.appId ?? env(c).APP_ID ?? process.env.APP_ID ?? '')
        c.set('appKey', options.appKey ?? env(c).APP_KEY ?? process.env.APP_KEY ?? '')
        c.set('signMaxAgeMs', options.signMaxAgeMs ?? (parseInt(env(c).SIGN_MAX_AGE_MS || process.env.SIGN_MAX_AGE_MS || '300000') || 300000))
        return next()
    })
    app.use('/1.1/*', async (c, next) => {
        c.set('counterService', await options.resolveCounterService(c))
        await next()
    })

    app.use(createCorsMiddleware({ allowOrigins: options.corsAllowOrigins }))
    app.use(secureHeaders())

    app.onError(errorhandler)
    app.notFound(notFoundHandler)

    app.all('/', (c) => c.json({
        message: 'Hello Hono!',
    }))

    app.all('/runtime', (c) => c.json({
        runtime: getRuntimeKey(),
        nodeVersion: typeof process !== 'undefined' ? process.version : undefined,
        requestId: c.get('requestId'),
        versions: __DEV__ && typeof process !== 'undefined' ? process.versions : undefined,
    }))

    app.route('/', createRoutes({
        beforeCreate: (c, body) => {
            const url = typeof body.url === 'string' ? body.url : ''
            const clientIdentifier = resolveClientIdentifier(c)
            const securityOptions = resolveWriteSecurityOptions(c, options.writeSecurity)
            sharedWriteGuard.assertWithinRateLimit(`${clientIdentifier}:create`, securityOptions.rateLimitMaxWrites, securityOptions.rateLimitWindowMs)
            if (url) {
                sharedWriteGuard.assertWithinRateLimit(`${clientIdentifier}:create:${url}`, securityOptions.rateLimitMaxWrites, securityOptions.rateLimitWindowMs)
            }
        },
        beforeIncrement: async (c, { objectId }) => {
            const clientIdentifier = resolveClientIdentifier(c)
            const securityOptions = resolveWriteSecurityOptions(c, options.writeSecurity)
            sharedWriteGuard.assertWithinRateLimit(`${clientIdentifier}:increment`, securityOptions.rateLimitMaxWrites, securityOptions.rateLimitWindowMs)

            if (!sharedWriteGuard.isDuplicate(`${clientIdentifier}:${objectId}`, securityOptions.dedupeWindowMs)) {
                return undefined
            }

            return c.get('counterService').findByObjectId(objectId)
        },
    }))

    if (__DEV__) {
        showRoutes(app, {
            verbose: true,
        })
    }

    return app
}
