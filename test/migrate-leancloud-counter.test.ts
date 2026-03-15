import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { expect, test } from 'vitest'
import { parseLeanCloudCounterJsonl } from '../packages/core/src/migration/leancloud-counter'
import {
    buildD1ImportSql,
    buildWranglerD1ExecuteArgs,
    extractD1DatabaseNameFromWranglerToml,
    isDirectScriptExecution,
    runLeanCloudCounterMigration,
} from '../scripts/migrate-leancloud-counter'

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

test('isDirectScriptExecution matches Windows script path against import.meta style file URL', () => {
    expect(isDirectScriptExecution(
        'file:///D:/hexo-cloudflare-counter/scripts/migrate-leancloud-counter.ts',
        'D:\\hexo-cloudflare-counter\\scripts\\migrate-leancloud-counter.ts',
    )).toBe(true)
})

test('extractD1DatabaseNameFromWranglerToml prefers env specific database and falls back to top level', () => {
    const content = [
        'name = "hexo-cloudflare-counter"',
        '[[d1_databases]]',
        'database_name = "prod-db"',
        '[[env.dev.d1_databases]]',
        'database_name = "dev-db"',
    ].join('\n')

    expect(extractD1DatabaseNameFromWranglerToml(content)).toBe('prod-db')
    expect(extractD1DatabaseNameFromWranglerToml(content, 'dev')).toBe('dev-db')
    expect(extractD1DatabaseNameFromWranglerToml(content, 'preview')).toBe('prod-db')
})

test('buildD1ImportSql creates D1-compatible SQL import without explicit transaction statements', () => {
    const sql = buildD1ImportSql([
        {
            objectId: '65f0aabbccddee0011223345',
            title: 'It\'s Hello',
            url: '/posts/hello',
            time: 2,
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-03T00:00:00.000Z',
        },
    ])

    expect(sql).toContain('DELETE FROM counters;')
    expect(sql).toContain('It\'\'s Hello')
    expect(sql).not.toContain('BEGIN TRANSACTION;')
    expect(sql).not.toContain('COMMIT;')
})

test('runLeanCloudCounterMigration invokes wrangler d1 execute for D1 target', () => {
    const source = path.resolve('test/fixtures/leancloud-counter.jsonl')
    let capturedCommand = ''
    let capturedArgs: string[] = []
    let capturedSql = ''

    const summary = runLeanCloudCounterMigration({
        source,
        target: 'd1',
        d1Database: 'hexo-cloudflare-counter',
        d1Mode: 'remote',
        wranglerConfig: 'wrangler.toml',
        reset: true,
        force: true,
    }, (command, args) => {
        capturedCommand = command
        capturedArgs = args
        const fileIndex = args.indexOf('--file')
        capturedSql = readFileSync(args[fileIndex + 1], 'utf8')
        return { status: 0 }
    })

    expect(summary.importedRows).toBe(2)
    expect(capturedCommand).toBe(process.execPath)
    expect(capturedArgs).toContain('--yes')
    expect(capturedArgs).toEqual(buildWranglerD1ExecuteArgs({
        source,
        target: 'd1',
        d1Database: 'hexo-cloudflare-counter',
        d1Mode: 'remote',
        wranglerConfig: 'wrangler.toml',
        reset: true,
        force: true,
    }, capturedArgs[capturedArgs.indexOf('--file') + 1]))
    expect(capturedSql).toContain('INSERT INTO counters (object_id, title, url, time, created_at, updated_at)')
})
