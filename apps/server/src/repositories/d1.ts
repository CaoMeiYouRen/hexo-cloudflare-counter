import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { generateObjectId, type CounterRepository, type CounterRecord, type CreateCounterInput } from '@hexo-cloudflare-counter/core'

interface CounterRow {
    object_id: string
    title: string
    url: string
    time: number
    created_at: string
    updated_at: string
}

export type D1PreparedStatementLike = D1PreparedStatement
export type D1DatabaseLike = D1Database

const initializedDatabases = new WeakMap<object, Promise<void>>()

function toTimestamp(): string {
    return new Date().toISOString()
}

function mapRow(row: CounterRow | null): CounterRecord | null {
    if (!row) {
        return null
    }

    return {
        objectId: row.object_id,
        title: row.title,
        url: row.url,
        time: row.time,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export class D1CounterRepository implements CounterRepository {
    constructor(private readonly db: D1DatabaseLike) {}

    private async ensureSchema(): Promise<void> {
        const cacheKey = this.db as object
        const existingPromise = initializedDatabases.get(cacheKey)
        if (existingPromise !== undefined) {
            return existingPromise
        }

        const initPromise = (async () => {
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS counters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    object_id TEXT NOT NULL UNIQUE,
                    url TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL DEFAULT '',
                    time INTEGER NOT NULL DEFAULT 0 CHECK (time >= 0),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            `)
            await this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_object_id ON counters(object_id);')
            await this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_url ON counters(url);')
        })()

        initializedDatabases.set(cacheKey, initPromise)
        return initPromise
    }

    async findByUrl(url: string): Promise<CounterRecord | null> {
        await this.ensureSchema()
        const row = await this.db.prepare('SELECT object_id, title, url, time, created_at, updated_at FROM counters WHERE url = ?1 LIMIT 1').bind(url).first<CounterRow>()
        return mapRow(row)
    }

    async findByUrls(urls: string[]): Promise<CounterRecord[]> {
        await this.ensureSchema()
        const uniqueUrls = [...new Set(urls)]
        if (uniqueUrls.length === 0) {
            return []
        }

        const placeholders = uniqueUrls.map((_, index) => `?${index + 1}`).join(', ')
        const { results } = await this.db.prepare(`SELECT object_id, title, url, time, created_at, updated_at FROM counters WHERE url IN (${placeholders})`).bind(...uniqueUrls).all<CounterRow>()
        return results.map((row) => mapRow(row)).filter((row): row is CounterRecord => row !== null)
    }

    async createCounter(input: CreateCounterInput): Promise<CounterRecord> {
        await this.ensureSchema()
        const existing = await this.findByUrl(input.url)
        if (existing) {
            return existing
        }

        const timestamp = toTimestamp()
        const record: CounterRecord = {
            objectId: generateObjectId(),
            title: input.title ?? '',
            url: input.url,
            time: input.time ?? 0,
            createdAt: timestamp,
            updatedAt: timestamp,
        }

        try {
            await this.db.prepare('INSERT INTO counters (object_id, title, url, time, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(
                record.objectId,
                record.title,
                record.url,
                record.time,
                record.createdAt,
                record.updatedAt,
            ).run()
            return record
        } catch {
            const conflictedRecord = await this.findByUrl(input.url)
            if (conflictedRecord) {
                return conflictedRecord
            }
            throw new Error(`Failed to create counter for url: ${input.url}`)
        }
    }

    async incrementCounterByObjectId(objectId: string, amount: number): Promise<CounterRecord | null> {
        await this.ensureSchema()
        await this.db.prepare('UPDATE counters SET time = time + ?1, updated_at = ?2 WHERE object_id = ?3').bind(amount, toTimestamp(), objectId).run()
        return this.findByObjectId(objectId)
    }

    async findByObjectId(objectId: string): Promise<CounterRecord | null> {
        await this.ensureSchema()
        const row = await this.db.prepare('SELECT object_id, title, url, time, created_at, updated_at FROM counters WHERE object_id = ?1 LIMIT 1').bind(objectId).first<CounterRow>()
        return mapRow(row)
    }
}
