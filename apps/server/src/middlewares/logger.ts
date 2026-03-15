import path from 'node:path'
import { logger as honoLogger } from 'hono/logger'
import { IS_CLOUDFLARE_WORKERS, LOG_LEVEL, LOGFILES } from '../env'

function stringifyLogValue(value: unknown): string {
    if (typeof value === 'string') {
        return value
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value)
    }
    if (typeof value === 'symbol') {
        return value.toString()
    }
    if (typeof value === 'function') {
        return value.name || '[Function]'
    }
    if (value instanceof Error) {
        return value.stack || value.message
    }
    if (value === null || value === undefined) {
        return ''
    }
    try {
        return JSON.stringify(value)
    } catch {
        return Object.prototype.toString.call(value)
    }
}

async function createLogger() {
    if (IS_CLOUDFLARE_WORKERS) {
        return console
    }

    const logDir = path.resolve('logs')
    const winston = await import('winston')
    const DailyRotateFile = (await import('winston-daily-rotate-file')).default

    const format = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSSZ' }),
        winston.format.splat(),
        winston.format.printf((info: { timestamp?: unknown, level: string, message?: unknown }) => `[${stringifyLogValue(info.timestamp)}] ${info.level}: ${stringifyLogValue(info.message)}`),
    )

    const dailyRotateFileOption = {
        dirname: logDir,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: false,
        maxSize: '20m',
        maxFiles: '31d',
        format,
        auditFile: path.join(logDir, '.audit.json'),
    }

    return winston.createLogger({
        level: LOG_LEVEL,
        exitOnError: false,
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                    winston.format.ms(),
                    winston.format.splat(),
                    winston.format.printf((info) => {
                        const timestamp = stringifyLogValue(info.timestamp)
                        const message = stringifyLogValue(info.message)
                        const infoLevel = winston.format.colorize().colorize(info.level, `[${timestamp}] ${info.level}`)
                        return `${infoLevel}: ${message}`
                    }),
                ),
            }),
            LOGFILES && new DailyRotateFile({
                ...dailyRotateFileOption,
                filename: '%DATE%.log',
            }),
            LOGFILES && new DailyRotateFile({
                ...dailyRotateFileOption,
                level: 'error',
                filename: '%DATE%.errors.log',
            }),
        ].filter(Boolean),
        exceptionHandlers: [
            LOGFILES && new DailyRotateFile({
                ...dailyRotateFileOption,
                level: 'error',
                filename: '%DATE%.errors.log',
            }),
        ].filter(Boolean),
        rejectionHandlers: [
            LOGFILES && new DailyRotateFile({
                ...dailyRotateFileOption,
                level: 'error',
                filename: '%DATE%.errors.log',
            }),
        ].filter(Boolean),
    })
}

const logger = await createLogger()
const loggerMiddleware = honoLogger(logger.info)

export { loggerMiddleware }
export default logger
