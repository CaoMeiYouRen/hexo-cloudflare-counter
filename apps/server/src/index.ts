import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { name } from '../../../package.json'
import { PORT } from './env'
import app from './node-app'
import logger from './middlewares/logger'

app.get('/*', serveStatic({ root: './public' }))

serve({
    fetch: app.fetch,
    port: PORT,
})

logger.info(`${name} 启动成功，访问地址：http://localhost:${PORT}`)
