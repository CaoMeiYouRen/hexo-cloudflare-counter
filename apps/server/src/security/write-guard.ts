import { env } from 'hono/adapter'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import type { AppBindings } from '@hexo-cloudflare-counter/core'

export interface WriteSecurityOptions {
    rateLimitMaxWrites?: number
    rateLimitWindowMs?: number
    dedupeWindowMs?: number
}

interface ResolvedWriteSecurityOptions {
    rateLimitMaxWrites: number
    rateLimitWindowMs: number
    dedupeWindowMs: number
}

function parsePositiveInteger(value: string | undefined, fallbackValue: number): number {
    if (!value) {
        return fallbackValue
    }

    const parsedValue = Number.parseInt(value, 10)
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        return fallbackValue
    }
    return parsedValue
}

function resolveForwardedIp(value: string | undefined): string {
    if (!value) {
        return ''
    }

    return value.split(',')[0]?.trim() ?? ''
}

export function resolveWriteSecurityOptions(c: Context<{ Bindings: AppBindings }>, options: WriteSecurityOptions = {}): ResolvedWriteSecurityOptions {
    const runtimeEnv = env(c)

    return {
        rateLimitMaxWrites: options.rateLimitMaxWrites ?? parsePositiveInteger(runtimeEnv.RATE_LIMIT_MAX_WRITES || process.env.RATE_LIMIT_MAX_WRITES, 60),
        rateLimitWindowMs: options.rateLimitWindowMs ?? parsePositiveInteger(runtimeEnv.RATE_LIMIT_WINDOW_MS || process.env.RATE_LIMIT_WINDOW_MS, 60_000),
        dedupeWindowMs: options.dedupeWindowMs ?? parsePositiveInteger(runtimeEnv.DEDUPE_WINDOW_MS || process.env.DEDUPE_WINDOW_MS, 15_000),
    }
}

export function resolveClientIdentifier(c: Context<{ Bindings: AppBindings }>): string {
    const forwardedIp = resolveForwardedIp(c.req.header('X-Forwarded-For'))
    const clientIp = c.req.header('CF-Connecting-IP')
        || c.req.header('X-Real-IP')
        || forwardedIp
        || 'unknown'
    const userAgent = (c.req.header('User-Agent') || 'unknown').slice(0, 160)
    return `${clientIp}:${userAgent}`
}

export class WriteGuard {
    private readonly requestBuckets = new Map<string, number[]>()
    private readonly duplicateMarks = new Map<string, number>()

    private pruneBucket(key: string, now: number, windowMs: number): number[] {
        const timestamps = this.requestBuckets.get(key) ?? []
        const activeTimestamps = timestamps.filter((timestamp) => now - timestamp < windowMs)

        if (activeTimestamps.length > 0) {
            this.requestBuckets.set(key, activeTimestamps)
        } else {
            this.requestBuckets.delete(key)
        }

        return activeTimestamps
    }

    assertWithinRateLimit(key: string, limit: number, windowMs: number): void {
        if (limit <= 0 || windowMs <= 0) {
            return
        }

        const now = Date.now()
        const timestamps = this.pruneBucket(key, now, windowMs)
        if (timestamps.length >= limit) {
            throw new HTTPException(429, { message: 'Too many write requests' })
        }

        timestamps.push(now)
        this.requestBuckets.set(key, timestamps)
    }

    isDuplicate(key: string, windowMs: number): boolean {
        if (windowMs <= 0) {
            return false
        }

        const now = Date.now()
        const lastSeenAt = this.duplicateMarks.get(key)
        this.duplicateMarks.set(key, now)

        if (this.duplicateMarks.size > 10_000) {
            for (const [entryKey, timestamp] of this.duplicateMarks.entries()) {
                if (now - timestamp >= windowMs) {
                    this.duplicateMarks.delete(entryKey)
                }
            }
        }

        return lastSeenAt !== undefined && now - lastSeenAt < windowMs
    }
}

export const sharedWriteGuard = new WriteGuard()
