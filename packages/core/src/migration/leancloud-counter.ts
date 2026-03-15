import { generateObjectId } from '../counter/object-id'

export interface LeanCloudCounterJsonlInput {
    objectId?: unknown
    title?: unknown
    url?: unknown
    time?: unknown
    createdAt?: unknown
    updatedAt?: unknown
}

export interface MigratableCounterRecord {
    objectId: string
    title: string
    url: string
    time: number
    createdAt: string
    updatedAt: string
}

export interface ParseLeanCloudCounterJsonlResult {
    records: MigratableCounterRecord[]
    summary: {
        totalLines: number
        parsedLines: number
        skippedLines: number
        duplicateLines: number
        metadataLines: number
        blankLines: number
    }
}

function normalizeTimestamp(value: unknown, fallback: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        return fallback
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return fallback
    }
    return date.toISOString()
}

function normalizeCounterTime(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.trunc(value))
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.trunc(parsed))
        }
    }
    return 0
}

function normalizeInputRecord(input: LeanCloudCounterJsonlInput, fallbackTimestamp: string): MigratableCounterRecord | null {
    if (typeof input.url !== 'string' || input.url.trim().length === 0) {
        return null
    }

    const createdAt = normalizeTimestamp(input.createdAt, fallbackTimestamp)
    const updatedAt = normalizeTimestamp(input.updatedAt, createdAt)

    return {
        objectId: typeof input.objectId === 'string' && input.objectId.length > 0 ? input.objectId : generateObjectId(),
        title: typeof input.title === 'string' ? input.title : '',
        url: input.url,
        time: normalizeCounterTime(input.time),
        createdAt,
        updatedAt,
    }
}

function compareRecords(left: MigratableCounterRecord, right: MigratableCounterRecord): MigratableCounterRecord {
    const leftTime = new Date(left.updatedAt).getTime()
    const rightTime = new Date(right.updatedAt).getTime()
    if (rightTime > leftTime) {
        return right
    }
    if (rightTime < leftTime) {
        return left
    }
    return right
}

export function parseLeanCloudCounterJsonl(content: string): ParseLeanCloudCounterJsonlResult {
    const fallbackTimestamp = new Date().toISOString()
    const recordsByUrl = new Map<string, MigratableCounterRecord>()
    const lines = content.split(/\r?\n/u)

    let parsedLines = 0
    let skippedLines = 0
    let duplicateLines = 0
    let metadataLines = 0
    let blankLines = 0

    for (const rawLine of lines) {
        const line = rawLine.trim()
        if (line.length === 0) {
            blankLines += 1
            continue
        }
        if (line.startsWith('#filetype:JSON-streaming')) {
            metadataLines += 1
            continue
        }

        let parsed: LeanCloudCounterJsonlInput
        try {
            parsed = JSON.parse(line) as LeanCloudCounterJsonlInput
        } catch {
            skippedLines += 1
            continue
        }

        const normalized = normalizeInputRecord(parsed, fallbackTimestamp)
        if (!normalized) {
            skippedLines += 1
            continue
        }

        parsedLines += 1
        const existing = recordsByUrl.get(normalized.url)
        if (!existing) {
            recordsByUrl.set(normalized.url, normalized)
            continue
        }

        duplicateLines += 1
        recordsByUrl.set(normalized.url, compareRecords(existing, normalized))
    }

    return {
        records: [...recordsByUrl.values()],
        summary: {
            totalLines: lines.length,
            parsedLines,
            skippedLines,
            duplicateLines,
            metadataLines,
            blankLines,
        },
    }
}
