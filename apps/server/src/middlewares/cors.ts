import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { MiddlewareHandler } from 'hono/types'
import type { AppBindings } from '@hexo-cloudflare-counter/core'

interface CorsOptions {
    allowOrigins?: string[]
}

function parseOrigins(rawValue: string | undefined): string[] {
    if (!rawValue) {
        return []
    }

    return rawValue.split(',').map((item) => item.trim()).filter(Boolean)
}

function normalizeOrigins(origins: string[]): string[] {
    return [...new Set(origins.map((item) => item.trim()).filter(Boolean))]
}

function resolveAllowedOrigins(c: Parameters<MiddlewareHandler<{ Bindings: AppBindings }>>[0], options: CorsOptions): string[] {
    if (options.allowOrigins && options.allowOrigins.length > 0) {
        return normalizeOrigins(options.allowOrigins)
    }

    const runtimeEnv = env(c)
    return normalizeOrigins([
        ...parseOrigins(runtimeEnv.CORS_ALLOW_ORIGINS),
        ...parseOrigins(runtimeEnv.CORS_ALLOW_ORIGIN),
        ...parseOrigins(process.env.CORS_ALLOW_ORIGINS),
        ...parseOrigins(process.env.CORS_ALLOW_ORIGIN),
    ])
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
    if (allowedOrigins.includes('*')) {
        return true
    }
    if (allowedOrigins.length > 0) {
        return allowedOrigins.includes(origin)
    }

    return true
}

export function createCorsMiddleware(options: CorsOptions = {}): MiddlewareHandler<{ Bindings: AppBindings }> {
    return async (c, next) => {
        const origin = c.req.header('Origin')
        if (!origin) {
            await next()
            return
        }

        const allowedOrigins = resolveAllowedOrigins(c, options)
        if (!isOriginAllowed(origin, allowedOrigins)) {
            throw new HTTPException(403, { message: 'Origin not allowed' })
        }

        const corsMiddleware = cors({
            origin,
            allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'X-LC-Id', 'X-LC-Key', 'X-LC-Sign'],
            maxAge: 86400,
        })

        return corsMiddleware(c, next)
    }
}
