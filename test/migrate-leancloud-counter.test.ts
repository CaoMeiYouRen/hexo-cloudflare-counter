import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { expect, test } from 'vitest'
import { parseLeanCloudCounterJsonl } from '../packages/core/src/migration/leancloud-counter'
import { runLeanCloudCounterMigration } from '../scripts/migrate-leancloud-counter'

test('parseLeanCloudCounterJsonl deduplicates by url and keeps the latest updatedAt record', () => {
    const fixturePath = path.resolve('test/fixtures/leancloud-counter.jsonl')
    const content = readFileSync(fixturePath, 'utf8')
    const result = parseLeanCloudCounterJsonl(content)

    expect(result.records).toHaveLength(2)
    expect(result.summary.metadataLines).toBe(1)
    expect(result.summary.duplicateLines).toBe(1)
    expect(result.summary.skippedLines).toBe(1)
    expect(result.records.find((item) => item.url === '/posts/hello')).toEqual({
        objectId: '65f0aabbccddee0011223399',
        title: 'Hello Updated',
        url: '/posts/hello',
        time: 5,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
    })
})

test('runLeanCloudCounterMigration imports JSONL records into SQLite', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'hexo-counter-migration-'))
    const sqlitePath = path.join(tempDir, 'counters.sqlite')
    const source = path.resolve('test/fixtures/leancloud-counter.jsonl')

    const summary = runLeanCloudCounterMigration({
        source,
        sqlitePath,
        reset: true,
        force: true,
    })

    expect(summary.importedRows).toBe(2)

    const db = new Database(sqlitePath)
    const rows = db.prepare('SELECT object_id, title, url, time, created_at, updated_at FROM counters ORDER BY url ASC').all() as {
        object_id: string
        title: string
        url: string
        time: number
        created_at: string
        updated_at: string
    }[]

    expect(rows).toEqual([
        {
            object_id: '65f0aabbccddee0011223399',
            title: 'Hello Updated',
            url: '/posts/hello',
            time: 5,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-03T00:00:00.000Z',
        },
        {
            object_id: '65f0aabbccddee0011223345',
            title: 'Second',
            url: '/posts/world',
            time: 2,
            created_at: '2024-01-02T00:00:00.000Z',
            updated_at: '2024-01-02T00:00:00.000Z',
        },
    ])
    db.close()
})
