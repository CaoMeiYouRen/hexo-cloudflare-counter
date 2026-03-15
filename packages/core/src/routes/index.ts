import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { HTTPException } from 'hono/http-exception'
import type { MiddlewareHandler } from 'hono/types'
import type { CounterRecord } from '../counter/types'
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

function createMd5Hex(value: string): string {
    return createHash('md5').update(value).digest('hex')
}

function isSameSignature(expectedSignature: string, actualSignature: string): boolean {
    const expectedBuffer = Buffer.from(expectedSignature)
    const actualBuffer = Buffer.from(actualSignature)
    if (expectedBuffer.length !== actualBuffer.length) {
        return false
    }
    return timingSafeEqual(expectedBuffer, actualBuffer)
}

function parseSignHeader(rawSignHeader: string | undefined): { signature: string, timestamp: number } | null {
    if (!rawSignHeader) {
        return null
    }

    const parts = rawSignHeader.split(',').map((item) => item.trim())
    if (parts.length !== 2) {
        throw new HTTPException(401, { message: 'Invalid X-LC-Sign format' })
    }

    const [signature, timestampRaw] = parts
    if (!signature || !/^\d+$/u.test(timestampRaw)) {
        throw new HTTPException(401, { message: 'Invalid X-LC-Sign format' })
    }

    const timestamp = Number.parseInt(timestampRaw, 10)
    if (!Number.isSafeInteger(timestamp)) {
        throw new HTTPException(401, { message: 'Invalid X-LC-Sign timestamp' })
    }

    return {
        signature: signature.toLowerCase(),
        timestamp,
    }
}

function resolveSignMaxAgeMs(c: Parameters<MiddlewareHandler<{ Bindings: AppBindings }>>[0]): number {
    const fromContext = c.get('signMaxAgeMs')
    if (typeof fromContext === 'number' && Number.isFinite(fromContext) && fromContext >= 0) {
        return fromContext
    }

    const runtimeEnv = env(c)
    const parsedValue = Number.parseInt(runtimeEnv.SIGN_MAX_AGE_MS || process.env.SIGN_MAX_AGE_MS || '300000', 10)
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        return 300000
    }
    return parsedValue
}

function verifyAppSign(c: Parameters<MiddlewareHandler<{ Bindings: AppBindings }>>[0], appKey: string, rawSignHeader: string): void {
    if (!appKey) {
        throw new HTTPException(401, { message: 'Invalid app credentials' })
    }

    const signPayload = parseSignHeader(rawSignHeader)
    if (!signPayload) {
        throw new HTTPException(401, { message: 'Invalid app credentials' })
    }

    const signMaxAgeMs = resolveSignMaxAgeMs(c)
    const now = Date.now()
    if (Math.abs(now - signPayload.timestamp) > signMaxAgeMs) {
        throw new HTTPException(401, { message: 'X-LC-Sign timestamp expired' })
    }

    const expectedSignature = createMd5Hex(`${signPayload.timestamp}${appKey}`)
    if (!isSameSignature(expectedSignature, signPayload.signature)) {
        throw new HTTPException(401, { message: 'Invalid X-LC-Sign' })
    }
}

const verifyAppCredentials: MiddlewareHandler<{ Bindings: AppBindings }> = async (c, next) => {
    const appId = c.get('appId') || ''
    const appKey = c.get('appKey') || ''

    if (!appId && !appKey) {
        await next()
        return
    }

    const requestAppId = c.req.header('X-LC-Id')
    if (requestAppId !== appId) {
        throw new HTTPException(401, { message: 'Invalid app credentials' })
    }

    const requestSign = c.req.header('X-LC-Sign')
    if (requestSign) {
        verifyAppSign(c, appKey, requestSign)
        await next()
        return
    }

    const requestAppKey = c.req.header('X-LC-Key')
    if (requestAppKey !== appKey) {
        throw new HTTPException(401, { message: 'Invalid app credentials' })
    }

    await next()
}

interface CreateCounterBody {
    title?: unknown
    url?: unknown
    time?: unknown
}

interface IncrementCounterBody {
    time?: {
        __op?: unknown
        amount?: unknown
    }
}

interface RouteHooks {
    beforeCreate?: (context: Parameters<MiddlewareHandler<{ Bindings: AppBindings }>>[0], body: CreateCounterBody) => Promise<void> | void
    beforeIncrement?: (context: Parameters<MiddlewareHandler<{ Bindings: AppBindings }>>[0], input: { objectId: string, body: IncrementCounterBody }) => Promise<CounterRecord | null | undefined> | CounterRecord | null | undefined
}

export function createRoutes(options: RouteHooks = {}) {
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
        const body = await c.req.json<CreateCounterBody>()

        await options.beforeCreate?.(c, body)

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
        const body = await c.req.json<IncrementCounterBody>()

        const existingRecord = await options.beforeIncrement?.(c, { objectId, body })
        if (existingRecord) {
            return c.json({
                objectId: existingRecord.objectId,
                updatedAt: existingRecord.updatedAt,
                time: existingRecord.time,
            })
        }

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
