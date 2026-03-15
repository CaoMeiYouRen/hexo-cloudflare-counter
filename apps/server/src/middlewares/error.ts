import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ErrorHandler, HTTPResponseError, NotFoundHandler } from 'hono/types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import logger from './logger'

export const errorhandler: ErrorHandler = (error: HTTPResponseError | Error, c: Context) => {
    let status: ContentfulStatusCode = 500
    if (error instanceof HTTPException) {
        status = error.status
    }

    let message = 'Internal Server Error'
    if (error instanceof HTTPException) {
        message = error.message
    } else if (process.env.NODE_ENV !== 'production') {
        message = error.stack || error.message
    }

    const logMessage = process.env.NODE_ENV === 'production'
        ? `${error.name}: ${error.message}`
        : error.stack || error.message

    const method = c.req.method
    const requestPath = c.req.path
    logger.error(`Error in ${method} ${requestPath}: \n${logMessage}`)

    return c.json({
        status,
        message,
    }, status)
}

export const notFoundHandler: NotFoundHandler = (c: Context) => {
    const method = c.req.method
    const requestPath = c.req.path
    const message = `Cannot ${method} ${requestPath}`
    logger.warn(message)
    return c.json({
        status: 404,
        message,
    }, 404)
}
