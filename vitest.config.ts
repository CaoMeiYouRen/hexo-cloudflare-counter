import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
    },
    resolve: {
        alias: {
            '@hexo-cloudflare-counter/core': path.resolve(__dirname, 'packages/core/src'),
        },
    },
    root: path.resolve('./'),
})
