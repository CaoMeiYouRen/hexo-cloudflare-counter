import { handle } from '@hono/node-server/vercel'
import { name } from '../../../package.json'
import app from './node-app'
import logger from './middlewares/logger'

export const runtime = 'nodejs'

export const config = {
    api: {
        bodyParser: false,
    },
}

logger.info(`${name} 云函数启动成功`)

export default handle(app)
