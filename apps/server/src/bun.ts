import { serveStatic } from 'hono/bun'
import { name } from '../../../package.json'
import app from './node-app'
import { PORT } from './env'
import logger from './middlewares/logger'

app.get('/*', serveStatic({ root: './public' }))

logger.info(`${name} 启动成功，访问地址：http://localhost:${PORT}`)

export default {
    fetch: app.fetch,
    port: PORT,
}
