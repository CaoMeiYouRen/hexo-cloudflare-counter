import { Hono, type Context } from 'hono'
import { timeout } from 'hono/timeout'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { showRoutes } from 'hono/dev'
import { env, getRuntimeKey } from 'hono/adapter'
import { bodyLimit } from 'hono/body-limit'
import { requestId } from 'hono/request-id'
import { createRoutes, type AppBindings, type CounterService } from '@hexo-cloudflare-counter/core'
import { __DEV__ } from './env'
import { loggerMiddleware } from './middlewares/logger'
import { errorhandler, notFoundHandler } from './middlewares/error'

type AppContext = Context<{ Bindings: AppBindings }>

interface AppOptions {
    resolveCounterService: (context: AppContext) => CounterService | Promise<CounterService>
    appId?: string
    appKey?: string
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
        const maxBodySize = parseInt(env(c).MAX_BODY_SIZE || `${100 * 1024 * 1024}`) || 100 * 1024 * 1024
        return bodyLimit({ maxSize: maxBodySize })(c, next)
    })
    app.use((c, next) => {
        c.set('appId', options.appId ?? env(c).APP_ID ?? process.env.APP_ID ?? '')
        c.set('appKey', options.appKey ?? env(c).APP_KEY ?? process.env.APP_KEY ?? '')
        return next()
    })
    app.use('/1.1/*', async (c, next) => {
        c.set('counterService', await options.resolveCounterService(c))
        await next()
    })

    app.use(cors())
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

    app.route('/', createRoutes())

    if (__DEV__) {
        showRoutes(app, {
            verbose: true,
        })
    }

    return app
}
