import { expect, test } from 'vitest'
import { createNodeApp } from '../apps/server/src/node-app'

function createTestApp(options: { appId?: string, appKey?: string } = {}) {
    return createNodeApp({
        sqlitePath: ':memory:',
        appId: options.appId ?? '',
        appKey: options.appKey ?? '',
    })
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
