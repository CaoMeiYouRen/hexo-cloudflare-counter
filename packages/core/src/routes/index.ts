import { env } from 'hono/adapter'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { MiddlewareHandler } from 'hono/types'
import type { AppBindings } from '../types'

interface CounterWhereInput {
    url?: string | {
        $in?: unknown
    }
}

function parseWhere(rawWhere: string | undefined): { url?: string, urls?: string[] } {
    if (!rawWhere) {
        return {}
    }

    let where: CounterWhereInput
    try {
        where = JSON.parse(rawWhere) as CounterWhereInput
    } catch {
        throw new HTTPException(400, { message: 'Invalid where JSON' })
    }

    if (typeof where.url === 'string') {
        return { url: where.url }
    }
    if (where.url && typeof where.url === 'object' && Array.isArray(where.url.$in)) {
        const urls = where.url.$in.filter((item): item is string => typeof item === 'string')
        return { urls }
    }

    throw new HTTPException(400, { message: 'Only url and url.$in filters are supported' })
}

const verifyAppCredentials: MiddlewareHandler<{ Bindings: AppBindings }> = async (c, next) => {
    const runtimeEnv = env(c)
    const appId = runtimeEnv.APP_ID || c.get('appId') || ''
    const appKey = runtimeEnv.APP_KEY || c.get('appKey') || ''

    if (!appId && !appKey) {
        await next()
        return
    }

    const requestAppId = c.req.header('X-LC-Id')
    const requestAppKey = c.req.header('X-LC-Key')
    if (requestAppId !== appId || requestAppKey !== appKey) {
        throw new HTTPException(401, { message: 'Invalid app credentials' })
    }

    await next()
}

export function createRoutes() {
    const app = new Hono<{ Bindings: AppBindings }>()

    app.get('/healthz', (c) => c.json({ status: 'ok' }))

    app.use('/1.1/*', verifyAppCredentials)

    app.get('/1.1/classes/Counter', async (c) => {
        const counterService = c.get('counterService')
        const { url, urls } = parseWhere(c.req.query('where'))

        if (url) {
            const record = await counterService.findByUrl(url)
            return c.json({ results: record ? [record] : [] })
        }
        if (urls) {
            const records = await counterService.findByUrls(urls)
            return c.json({ results: records })
        }

        return c.json({ results: [] })
    })

    app.post('/1.1/classes/Counter', async (c) => {
        const counterService = c.get('counterService')
        const body = await c.req.json<{
            title?: unknown
            url?: unknown
            time?: unknown
        }>()

        if (typeof body.url !== 'string' || body.url.length === 0) {
            throw new HTTPException(400, { message: 'url is required' })
        }

        const record = await counterService.createCounter({
            title: typeof body.title === 'string' ? body.title : '',
            url: body.url,
            time: typeof body.time === 'number' ? body.time : 0,
        })
        return c.json(record, 201)
    })

    app.put('/1.1/classes/Counter/:objectId', async (c) => {
        const counterService = c.get('counterService')
        const objectId = c.req.param('objectId')
        const body = await c.req.json<{
            time?: {
                __op?: unknown
                amount?: unknown
            }
        }>()

        if (body.time?.__op !== 'Increment' || typeof body.time.amount !== 'number') {
            throw new HTTPException(400, { message: 'Only Increment operations on time are supported' })
        }

        const record = await counterService.incrementCounter(objectId, body.time.amount)
        return c.json({
            objectId: record.objectId,
            updatedAt: record.updatedAt,
            time: record.time,
        })
    })

    return app
}

export default createRoutes
