import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { generateObjectId, type CounterRepository, type CounterRecord, type CreateCounterInput } from '@hexo-cloudflare-counter/core'

export interface CounterRow {
    object_id: string
    title: string
    url: string
    time: number
    created_at: string
    updated_at: string
}

function toTimestamp(): string {
    return new Date().toISOString()
}

export function normalizeSqlitePath(sqlitePath: string): string {
    if (sqlitePath === ':memory:') {
        return sqlitePath
    }
    const resolvedPath = path.resolve(sqlitePath)
    mkdirSync(path.dirname(resolvedPath), { recursive: true })
    return resolvedPath
}

export function ensureSqliteCounterSchema(db: Database.Database) {
    db.pragma('journal_mode = WAL')
    db.exec(`
        CREATE TABLE IF NOT EXISTS counters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_id TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL DEFAULT '',
            time INTEGER NOT NULL DEFAULT 0 CHECK (time >= 0),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_object_id ON counters(object_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_url ON counters(url);
    `)
}

export function openSqliteDatabase(sqlitePath: string): Database.Database {
    return new Database(normalizeSqlitePath(sqlitePath))
}

function mapRow(row: CounterRow | undefined): CounterRecord | null {
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

function isSqliteConstraintError(error: unknown): error is Error & { code?: string } {
    return error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
}

export class SQLiteCounterRepository implements CounterRepository {
    private readonly db: Database.Database

    constructor(sqlitePath: string) {
        this.db = openSqliteDatabase(sqlitePath)
        ensureSqliteCounterSchema(this.db)
    }

    private findByUrlSync(url: string): CounterRecord | null {
        const row = this.db.prepare('SELECT object_id, title, url, time, created_at, updated_at FROM counters WHERE url = ? LIMIT 1').get(url) as CounterRow | undefined
        return mapRow(row)
    }

    findByUrl(url: string): Promise<CounterRecord | null> {
        return Promise.resolve(this.findByUrlSync(url))
    }

    findByUrls(urls: string[]): Promise<CounterRecord[]> {
        const uniqueUrls = [...new Set(urls)]
        if (uniqueUrls.length === 0) {
            return Promise.resolve([])
        }

        const placeholders = uniqueUrls.map(() => '?').join(', ')
        const rows = this.db.prepare(`SELECT object_id, title, url, time, created_at, updated_at FROM counters WHERE url IN (${placeholders})`).all(...uniqueUrls) as CounterRow[]
        return Promise.resolve(rows.map((row) => mapRow(row)).filter((row): row is CounterRecord => row !== null))
    }

    createCounter(input: CreateCounterInput): Promise<CounterRecord> {
        const existing = this.findByUrlSync(input.url)
        if (existing) {
            return Promise.resolve(existing)
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
            this.db.prepare('INSERT INTO counters (object_id, title, url, time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
                record.objectId,
                record.title,
                record.url,
                record.time,
                record.createdAt,
                record.updatedAt,
            )
            return Promise.resolve(record)
        } catch (error) {
            if (isSqliteConstraintError(error) && error.code?.startsWith('SQLITE_CONSTRAINT')) {
                const conflictedRecord = this.findByUrlSync(input.url)
                if (conflictedRecord) {
                    return Promise.resolve(conflictedRecord)
                }
            }
            throw error
        }
    }

    incrementCounterByObjectId(objectId: string, amount: number): Promise<CounterRecord | null> {
        const updatedAt = toTimestamp()
        this.db.prepare('UPDATE counters SET time = time + ?, updated_at = ? WHERE object_id = ?').run(amount, updatedAt, objectId)
        return Promise.resolve(mapRow(this.db.prepare('SELECT object_id, title, url, time, created_at, updated_at FROM counters WHERE object_id = ? LIMIT 1').get(objectId) as CounterRow | undefined))
    }

    findByObjectId(objectId: string): Promise<CounterRecord | null> {
        return Promise.resolve(mapRow(this.db.prepare('SELECT object_id, title, url, time, created_at, updated_at FROM counters WHERE object_id = ? LIMIT 1').get(objectId) as CounterRow | undefined))
    }
}
