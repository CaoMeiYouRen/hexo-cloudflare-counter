import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { parseLeanCloudCounterJsonl, type MigratableCounterRecord } from '@hexo-cloudflare-counter/core'
import { ensureSqliteCounterSchema, openSqliteDatabase } from '../apps/server/src/repositories/sqlite'

export type MigrationTarget = 'sqlite' | 'd1'
export type D1MigrationMode = 'local' | 'remote'

interface BaseCliOptions {
    source: string
    reset: boolean
    force: boolean
}

export interface SqliteCliOptions extends BaseCliOptions {
    target?: 'sqlite'
    sqlitePath: string
}

export interface D1CliOptions extends BaseCliOptions {
    target: 'd1'
    d1Database: string
    d1Mode: D1MigrationMode
    wranglerConfig: string
    wranglerEnv?: string
}

export type CliOptions = SqliteCliOptions | D1CliOptions

export interface MigrationSummary {
    totalLines: number
    parsedLines: number
    skippedLines: number
    duplicateLines: number
    metadataLines: number
    blankLines: number
    importedRows: number
}

export interface CommandRunnerResult {
    status: number | null
    error?: Error
    stderr?: string | Buffer | null
}

export type CommandRunner = (command: string, args: string[]) => CommandRunnerResult

const counterSchemaStatements = [
    'CREATE TABLE IF NOT EXISTS counters (id INTEGER PRIMARY KEY AUTOINCREMENT, object_id TEXT NOT NULL UNIQUE, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL DEFAULT \'\', time INTEGER NOT NULL DEFAULT 0 CHECK (time >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_object_id ON counters(object_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_url ON counters(url)',
] as const

function toComparableFileUrl(filePathOrUrl: string): string {
    if (filePathOrUrl.startsWith('file://')) {
        return new URL(filePathOrUrl).href
    }

    if (/^[A-Za-z]:[\\/]/.test(filePathOrUrl)) {
        const normalizedWindowsPath = filePathOrUrl.replace(/\\/g, '/')
        return new URL(`file:///${normalizedWindowsPath}`).href
    }

    return pathToFileURL(path.resolve(filePathOrUrl)).href
}

export function isDirectScriptExecution(importMetaUrl: string, argvPath: string | undefined): boolean {
    if (!argvPath) {
        return false
    }

    return toComparableFileUrl(argvPath) === toComparableFileUrl(importMetaUrl)
}

function parseBooleanFlag(value: string | undefined): boolean {
    return value === 'true' || value === '1'
}

function readCliOption(flagName: string): string | undefined {
    const index = process.argv.indexOf(flagName)
    if (index === -1) {
        return undefined
    }
    return process.argv[index + 1]
}

function hasCliFlag(flagName: string): boolean {
    return process.argv.includes(flagName)
}

function parseMigrationTarget(value: string | undefined): MigrationTarget {
    if (!value || value === 'sqlite') {
        return 'sqlite'
    }
    if (value === 'd1') {
        return value
    }
    throw new Error(`Unsupported migration target: ${value}`)
}

export function extractD1DatabaseNameFromWranglerToml(content: string, envName?: string): string | undefined {
    const lines = content.split(/\r?\n/u)
    const envSection = envName ? `[[env.${envName}.d1_databases]]` : undefined
    let currentSection = ''
    let topLevelDatabaseName: string | undefined

    for (const rawLine of lines) {
        const line = rawLine.trim()
        if (line.length === 0 || line.startsWith('#')) {
            continue
        }

        const arraySectionMatch = /^\[\[(.+)\]\]$/u.exec(line)
        if (arraySectionMatch) {
            currentSection = `[[${arraySectionMatch[1]}]]`
            continue
        }

        const tableSectionMatch = /^\[(.+)\]$/u.exec(line)
        if (tableSectionMatch) {
            currentSection = `[${tableSectionMatch[1]}]`
            continue
        }

        const databaseNameMatch = /^database_name\s*=\s*"([^"]+)"/u.exec(line)
        if (!databaseNameMatch) {
            continue
        }

        const databaseName = databaseNameMatch[1]
        if (currentSection === '[[d1_databases]]' && !topLevelDatabaseName) {
            topLevelDatabaseName = databaseName
        }
        if (envSection && currentSection === envSection) {
            return databaseName
        }
        if (!envSection && currentSection === '[[d1_databases]]') {
            return databaseName
        }
    }

    return topLevelDatabaseName
}

export function readD1DatabaseNameFromWranglerConfig(configPath: string, envName?: string): string | undefined {
    try {
        const content = readFileSync(configPath, 'utf8')
        return extractD1DatabaseNameFromWranglerToml(content, envName)
    } catch {
        return undefined
    }
}

function parseCliOptions(): CliOptions {
    const source = readCliOption('--source') ?? process.env.MIGRATION_SOURCE
    const target = parseMigrationTarget(readCliOption('--target') ?? process.env.MIGRATION_TARGET)
    const reset = hasCliFlag('--reset') || parseBooleanFlag(process.env.MIGRATION_RESET)
    const force = hasCliFlag('--force') || parseBooleanFlag(process.env.MIGRATION_FORCE)

    if (!source) {
        throw new Error('Missing migration source. Use --source <file> or set MIGRATION_SOURCE.')
    }

    if (target === 'sqlite') {
        const sqlitePath = readCliOption('--sqlite-path') ?? process.env.SQLITE_PATH ?? 'data/counters.sqlite'
        return {
            source,
            target,
            sqlitePath,
            reset,
            force,
        }
    }

    const wranglerConfig = readCliOption('--wrangler-config') ?? process.env.MIGRATION_WRANGLER_CONFIG ?? 'wrangler.toml'
    const wranglerEnv = readCliOption('--wrangler-env') ?? process.env.MIGRATION_WRANGLER_ENV
    const d1Database = readCliOption('--d1-database')
        ?? process.env.MIGRATION_D1_DATABASE
        ?? readD1DatabaseNameFromWranglerConfig(wranglerConfig, wranglerEnv)
    if (!d1Database) {
        throw new Error('Missing D1 database name. Use --d1-database <name>, set MIGRATION_D1_DATABASE, or configure database_name in wrangler.toml.')
    }

    return {
        source,
        target,
        d1Database,
        d1Mode: hasCliFlag('--remote') || parseBooleanFlag(process.env.MIGRATION_D1_REMOTE) ? 'remote' : 'local',
        wranglerConfig,
        wranglerEnv,
        reset,
        force,
    }
}

function assertDestructiveFlags(options: CliOptions) {
    if (!options.reset) {
        throw new Error('This migration is destructive by design. Re-run with --reset or set MIGRATION_RESET=true.')
    }
    if (!options.force) {
        throw new Error('This migration clears the counters table before import. Re-run with --force or set MIGRATION_FORCE=true.')
    }
}

function insertRecords(records: MigratableCounterRecord[], sqlitePath: string): number {
    const db = openSqliteDatabase(sqlitePath)
    ensureSqliteCounterSchema(db)

    const clearStatement = db.prepare('DELETE FROM counters')
    const insertStatement = db.prepare(`
        INSERT INTO counters (object_id, title, url, time, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `)

    const transaction = db.transaction((items: MigratableCounterRecord[]) => {
        clearStatement.run()
        for (const item of items) {
            insertStatement.run(
                item.objectId,
                item.title,
                item.url,
                item.time,
                item.createdAt,
                item.updatedAt,
            )
        }
    })

    transaction(records)
    db.close()
    return records.length
}

function escapeSqlString(value: string): string {
    return value.replace(/'/g, '\'\'')
}

export function buildD1ImportSql(records: MigratableCounterRecord[]): string {
    const lines = [
        ...counterSchemaStatements.map((statement) => `${statement};`),
        'DELETE FROM counters;',
    ]

    for (const record of records) {
        lines.push([
            'INSERT INTO counters (object_id, title, url, time, created_at, updated_at)',
            `VALUES ('${escapeSqlString(record.objectId)}', '${escapeSqlString(record.title)}', '${escapeSqlString(record.url)}', ${record.time}, '${escapeSqlString(record.createdAt)}', '${escapeSqlString(record.updatedAt)}');`,
        ].join(' '))
    }

    return lines.join('\n')
}

function resolveWranglerCliPath(): string {
    const wranglerCliPath = path.resolve('node_modules/wrangler/bin/wrangler.js')
    return wranglerCliPath
}

export function buildWranglerD1ExecuteArgs(options: D1CliOptions, sqlFilePath: string): string[] {
    const args = [
        resolveWranglerCliPath(),
        'd1',
        'execute',
        options.d1Database,
        '--yes',
        `--${options.d1Mode}`,
        '--file',
        sqlFilePath,
        '--config',
        path.resolve(options.wranglerConfig),
    ]
    if (options.wranglerEnv) {
        args.push('--env', options.wranglerEnv)
    }
    return args
}

function defaultCommandRunner(command: string, args: string[]): CommandRunnerResult {
    const result = spawnSync(command, args, { stdio: 'inherit' })
    return {
        status: result.status,
        error: result.error ?? undefined,
        stderr: null,
    }
}

function importRecordsToD1(records: MigratableCounterRecord[], options: D1CliOptions, commandRunner: CommandRunner): number {
    const sql = buildD1ImportSql(records)
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'hexo-counter-d1-migration-'))
    const sqlFilePath = path.join(tempDir, 'counter-import.sql')
    writeFileSync(sqlFilePath, sql, 'utf8')

    try {
        const result = commandRunner(process.execPath, buildWranglerD1ExecuteArgs(options, sqlFilePath))
        if (result.error) {
            throw result.error
        }
        if (result.status !== 0) {
            const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : ''
            throw new Error(stderr ? `wrangler d1 execute failed: ${stderr}` : `wrangler d1 execute failed with exit code ${String(result.status)}`)
        }
    } finally {
        rmSync(tempDir, { recursive: true, force: true })
    }

    return records.length
}

export function runLeanCloudCounterMigration(options: CliOptions, commandRunner: CommandRunner = defaultCommandRunner): MigrationSummary {
    assertDestructiveFlags(options)

    const content = readFileSync(options.source, 'utf8')
    const parsed = parseLeanCloudCounterJsonl(content)
    const importedRows = options.target === 'd1'
        ? importRecordsToD1(parsed.records, options, commandRunner)
        : insertRecords(parsed.records, options.sqlitePath)

    return {
        ...parsed.summary,
        importedRows,
    }
}

function printSummary(summary: MigrationSummary) {
    console.log('LeanCloud Counter migration completed.')
    console.log(`Total lines: ${summary.totalLines}`)
    console.log(`Parsed lines: ${summary.parsedLines}`)
    console.log(`Skipped lines: ${summary.skippedLines}`)
    console.log(`Duplicate lines: ${summary.duplicateLines}`)
    console.log(`Metadata lines: ${summary.metadataLines}`)
    console.log(`Blank lines: ${summary.blankLines}`)
    console.log(`Imported rows: ${summary.importedRows}`)
}

if (isDirectScriptExecution(import.meta.url, process.argv[1])) {
    try {
        const summary = runLeanCloudCounterMigration(parseCliOptions())
        printSummary(summary)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`LeanCloud Counter migration failed: ${message}`)
        process.exitCode = 1
    }
}
