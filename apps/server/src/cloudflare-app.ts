import { CounterService } from '@hexo-cloudflare-counter/core'
import { createApp } from './app'
import { D1CounterRepository, type D1DatabaseLike } from './repositories/d1'

const servicesByDatabase = new WeakMap<object, CounterService>()

function isD1DatabaseLike(value: unknown): value is D1DatabaseLike {
    return typeof value === 'object' && value !== null && 'prepare' in value && 'exec' in value
}

function getCloudflareCounterService(database: unknown): CounterService {
    if (!isD1DatabaseLike(database)) {
        throw new Error('COUNTER_DB binding is required for Cloudflare Workers runtime')
    }

    const existingService = servicesByDatabase.get(database as object)
    if (existingService) {
        return existingService
    }

    const counterService = new CounterService(new D1CounterRepository(database))
    servicesByDatabase.set(database as object, counterService)
    return counterService
}

export function createCloudflareApp() {
    return createApp({
        resolveCounterService: (c) => getCloudflareCounterService(c.env.COUNTER_DB),
    })
}

export default createCloudflareApp
