import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { createNodeApp } from '../apps/server/src/node-app'

function createTestApp(options: {
    appId?: string
    appKey?: string
    signMaxAgeMs?: number
    maxBodySize?: number
    corsAllowOrigins?: string[]
    writeSecurity?: {
        rateLimitMaxWrites?: number
        rateLimitWindowMs?: number
        dedupeWindowMs?: number
    }
} = {}) {
    return createNodeApp({
        sqlitePath: ':memory:',
        appId: options.appId ?? '',
        appKey: options.appKey ?? '',
        signMaxAgeMs: options.signMaxAgeMs,
        maxBodySize: options.maxBodySize,
        corsAllowOrigins: options.corsAllowOrigins,
        writeSecurity: options.writeSecurity,
    })
}

function createLcSign(timestamp: number, appKey: string): string {
    const signature = createHash('md5').update(`${timestamp}${appKey}`).digest('hex')
    return `${signature},${timestamp}`
}

test('GET /', async () => {
    const app = createTestApp()
    const res = await app.request('/')
    expect(await res.json()).toEqual({ message: 'Hello Hono!' })
})

test('GET /runtime', async () => {
    const app = createTestApp()
    const res = await app.request('/runtime')
    expect(await res.json()).toEqual({
        runtime: expect.any(String),
        nodeVersion: expect.any(String),
        requestId: expect.any(String),
    })
})

test('GET /healthz', async () => {
    const app = createTestApp()
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
})

test('GET /1.1/classes/Counter returns empty results for missing url', async () => {
    const app = createTestApp()
    const res = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fhello%22%7D')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [] })
})

test('POST and GET /1.1/classes/Counter create and query a counter', async () => {
    const app = createTestApp()
    const createResponse = await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            title: 'Hello',
            url: '/posts/hello',
            time: 1,
        }),
    })

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json() as {
        objectId: string
        title: string
        url: string
        time: number
        createdAt: string
        updatedAt: string
    }

    expect(created).toEqual({
        objectId: expect.any(String),
        title: 'Hello',
        url: '/posts/hello',
        time: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
    })
    expect(created.objectId).toMatch(/^[0-9a-f]{24}$/)

    const queryResponse = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fhello%22%7D')
    expect(queryResponse.status).toBe(200)
    expect(await queryResponse.json()).toEqual({
        results: [created],
    })
})

test('GET /1.1/classes/Counter supports url.$in batch query', async () => {
    const app = createTestApp()

    await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({ title: 'One', url: '/posts/one', time: 1 }),
    })
    await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({ title: 'Two', url: '/posts/two', time: 2 }),
    })

    const res = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%7B%22%24in%22%3A%5B%22%2Fposts%2Ftwo%22%2C%22%2Fposts%2Fone%22%2C%22%2Fposts%2Fmissing%22%5D%7D%7D')
    const payload = await res.json() as {
        results: {
            url: string
            time: number
        }[]
    }

    expect(res.status).toBe(200)
    expect(payload.results).toHaveLength(2)
    expect(payload.results.map((item) => item.url).sort()).toEqual(['/posts/one', '/posts/two'])
})

test('PUT /1.1/classes/Counter/:objectId increments time', async () => {
    const app = createTestApp()
    const createResponse = await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            title: 'Counter',
            url: '/posts/counter',
            time: 1,
        }),
    })
    const created = await createResponse.json() as { objectId: string }

    const updateResponse = await app.request(`/1.1/classes/Counter/${created.objectId}`, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            time: {
                __op: 'Increment',
                amount: 2,
            },
        }),
    })

    expect(updateResponse.status).toBe(200)
    expect(await updateResponse.json()).toEqual({
        objectId: created.objectId,
        updatedAt: expect.any(String),
        time: 3,
    })

    const queryResponse = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fcounter%22%7D')
    const payload = await queryResponse.json() as {
        results: {
            time: number
        }[]
    }
    expect(payload.results[0]?.time).toBe(3)
})

test('protected routes require app credentials when APP_ID and APP_KEY are configured', async () => {
    const app = createTestApp({
        appId: 'test-app-id',
        appKey: 'test-app-key',
    })

    const unauthorized = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fhello%22%7D')

    expect(unauthorized.status).toBe(401)

    const authorized = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fhello%22%7D', {
        headers: {
            'X-LC-Id': 'test-app-id',
            'X-LC-Key': 'test-app-key',
        },
    })

    expect(authorized.status).toBe(200)
    expect(await authorized.json()).toEqual({ results: [] })
})

test('allowed origins receive CORS headers', async () => {
    const app = createTestApp({
        corsAllowOrigins: ['https://blog.example.com'],
    })

    const response = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fhello%22%7D', {
        headers: {
            Origin: 'https://blog.example.com',
        },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://blog.example.com')
})

test('origins are allowed by default when no whitelist is configured', async () => {
    const app = createTestApp()

    const response = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fhello%22%7D', {
        headers: {
            Origin: 'https://any-origin.example.com',
        },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://any-origin.example.com')
})

test('disallowed origins are rejected', async () => {
    const app = createTestApp({
        corsAllowOrigins: ['https://blog.example.com'],
    })

    const response = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fhello%22%7D', {
        headers: {
            Origin: 'https://evil.example.com',
        },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
        status: 403,
        message: 'Origin not allowed',
    })
})

test('duplicate increments within dedupe window reuse current counter value', async () => {
    const app = createTestApp({
        writeSecurity: {
            dedupeWindowMs: 60_000,
        },
    })

    const createResponse = await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({
            title: 'Counter',
            url: '/posts/dedupe',
            time: 1,
        }),
    })
    const created = await createResponse.json() as { objectId: string }

    const firstIncrement = await app.request(`/1.1/classes/Counter/${created.objectId}`, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({
            time: {
                __op: 'Increment',
                amount: 1,
            },
        }),
    })
    expect(firstIncrement.status).toBe(200)
    expect(await firstIncrement.json()).toEqual({
        objectId: created.objectId,
        updatedAt: expect.any(String),
        time: 2,
    })

    const secondIncrement = await app.request(`/1.1/classes/Counter/${created.objectId}`, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({
            time: {
                __op: 'Increment',
                amount: 1,
            },
        }),
    })
    expect(secondIncrement.status).toBe(200)
    expect(await secondIncrement.json()).toEqual({
        objectId: created.objectId,
        updatedAt: expect.any(String),
        time: 2,
    })
})

test('write rate limit rejects excessive write requests from the same client', async () => {
    const app = createTestApp({
        writeSecurity: {
            rateLimitMaxWrites: 2,
            rateLimitWindowMs: 60_000,
            dedupeWindowMs: 0,
        },
    })

    const first = await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.8',
        },
        body: JSON.stringify({ title: 'One', url: '/posts/rate-limit-1', time: 0 }),
    })
    expect(first.status).toBe(201)

    const second = await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.8',
        },
        body: JSON.stringify({ title: 'Two', url: '/posts/rate-limit-2', time: 0 }),
    })
    expect(second.status).toBe(201)

    const third = await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.8',
        },
        body: JSON.stringify({ title: 'Three', url: '/posts/rate-limit-3', time: 0 }),
    })

    expect(third.status).toBe(429)
    expect(await third.json()).toEqual({
        status: 429,
        message: 'Too many write requests',
    })
})

test('protected routes accept valid X-LC-Sign requests', async () => {
    const app = createTestApp({
        appId: 'test-app-id',
        appKey: 'test-app-key',
        signMaxAgeMs: 60_000,
    })
    const timestamp = Date.now()

    const response = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fsigned%22%7D', {
        headers: {
            'X-LC-Id': 'test-app-id',
            'X-LC-Sign': createLcSign(timestamp, 'test-app-key'),
        },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
})

test('protected routes reject expired X-LC-Sign requests', async () => {
    const app = createTestApp({
        appId: 'test-app-id',
        appKey: 'test-app-key',
        signMaxAgeMs: 1_000,
    })
    const expiredTimestamp = Date.now() - 5_000

    const response = await app.request('/1.1/classes/Counter?where=%7B%22url%22%3A%22%2Fposts%2Fsigned%22%7D', {
        headers: {
            'X-LC-Id': 'test-app-id',
            'X-LC-Sign': createLcSign(expiredTimestamp, 'test-app-key'),
        },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
        status: 401,
        message: 'X-LC-Sign timestamp expired',
    })
})

test('request body larger than maxBodySize is rejected', async () => {
    const app = createTestApp({
        maxBodySize: 64,
    })

    const response = await app.request('/1.1/classes/Counter', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            title: 'x'.repeat(256),
            url: '/posts/large-body',
            time: 0,
        }),
    })

    expect(response.status).toBe(413)
})
