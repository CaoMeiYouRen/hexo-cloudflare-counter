import { readFileSync } from 'node:fs'
import process from 'node:process'
import { parseLeanCloudCounterJsonl, type MigratableCounterRecord } from '@hexo-cloudflare-counter/core'
import { ensureSqliteCounterSchema, openSqliteDatabase } from '../apps/server/src/repositories/sqlite'

interface CliOptions {
    source: string
    sqlitePath: string
    reset: boolean
    force: boolean
}

export interface MigrationSummary {
    totalLines: number
    parsedLines: number
    skippedLines: number
    duplicateLines: number
    metadataLines: number
    blankLines: number
    importedRows: number
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

function parseCliOptions(): CliOptions {
    const source = readCliOption('--source') ?? process.env.MIGRATION_SOURCE
    const sqlitePath = readCliOption('--sqlite-path') ?? process.env.SQLITE_PATH ?? 'data/counters.sqlite'
    const reset = hasCliFlag('--reset') || parseBooleanFlag(process.env.MIGRATION_RESET)
    const force = hasCliFlag('--force') || parseBooleanFlag(process.env.MIGRATION_FORCE)

    if (!source) {
        throw new Error('Missing migration source. Use --source <file> or set MIGRATION_SOURCE.')
    }

    return {
        source,
        sqlitePath,
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

export function runLeanCloudCounterMigration(options: CliOptions): MigrationSummary {
    assertDestructiveFlags(options)

    const content = readFileSync(options.source, 'utf8')
    const parsed = parseLeanCloudCounterJsonl(content)
    const importedRows = insertRecords(parsed.records, options.sqlitePath)

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

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
    const summary = runLeanCloudCounterMigration(parseCliOptions())
    printSummary(summary)
}
