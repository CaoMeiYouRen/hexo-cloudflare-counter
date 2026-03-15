import { name } from '../../../package.json'
import createCloudflareApp from './cloudflare-app'
import logger from './middlewares/logger'

const app = createCloudflareApp()

logger.info(`${name} 云函数启动成功`)

export default app
