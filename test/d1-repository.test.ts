import { expect, test } from 'vitest'
import { D1CounterRepository, type D1DatabaseLike, type D1PreparedStatementLike } from '../apps/server/src/repositories/d1'

function createPreparedStatement<T>(handlers: {
    run?: () => Promise<void>
    first?: () => Promise<T | null>
}): D1PreparedStatementLike {
    return {
        bind: () => createPreparedStatement(handlers),
        first: () => Promise.resolve(handlers.first?.()).then((value) => value ?? null),
        run: () => Promise.resolve(handlers.run?.()).then(() => ({} as Awaited<ReturnType<D1PreparedStatementLike['run']>>)),
    } as D1PreparedStatementLike
}

test('D1CounterRepository initializes schema with prepared statements before querying', async () => {
    const preparedSql: string[] = []
    const db = {
        exec: () => Promise.reject(new Error('exec should not be used for schema initialization')),
        prepare: (sql: string) => {
            preparedSql.push(sql)
            if (sql.startsWith('SELECT object_id')) {
                return createPreparedStatement({ first: () => Promise.resolve(null) })
            }
            return createPreparedStatement({ run: () => Promise.resolve() })
        },
    } as unknown as D1DatabaseLike

    const repository = new D1CounterRepository(db)

    await expect(repository.findByUrl('/posts/hello')).resolves.toBeNull()
    expect(preparedSql).toEqual([
        'CREATE TABLE IF NOT EXISTS counters (id INTEGER PRIMARY KEY AUTOINCREMENT, object_id TEXT NOT NULL UNIQUE, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL DEFAULT \'\', time INTEGER NOT NULL DEFAULT 0 CHECK (time >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_object_id ON counters(object_id)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_url ON counters(url)',
        'SELECT object_id, title, url, time, created_at, updated_at FROM counters WHERE url = ?1 LIMIT 1',
    ])
})
