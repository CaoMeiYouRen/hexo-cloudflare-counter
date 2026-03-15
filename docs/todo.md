# 当前阶段状态

更新时间：2026-03

## 已完成

1. 已完成 workspace 基础结构，当前主要包为 `apps/server` 与 `packages/core`。
2. 已完成 LeanCloud Counter 最小兼容 API。
3. 已完成 SQLite 仓储，并接入 Node.js、Docker、Bun、当前 Vercel 路线。
4. 已完成 D1 仓储，并接入 Cloudflare Workers 路线。
5. 已完成 ObjectId 风格的 24 位十六进制 `objectId` 生成逻辑。
6. 已完成基础测试、类型检查、lint 与构建链路。
7. 已完成 LeanCloud Counter JSONL -> SQLite 首版迁移脚本。
8. 已补充迁移脚本的基础测试与示例 JSONL 数据。

## 当前平台入口映射

1. Node.js：源码入口 `apps/server/src/index.ts`，最终运行文件 `dist/index.mjs`。
2. Docker：最终运行文件 `dist/index.mjs`，与 Node.js 共用运行链路。
3. Bun：源码入口 `apps/server/src/bun.ts`，最终运行文件 `dist/bun.mjs`。
4. Cloudflare Workers：开发入口 `apps/server/src/cloudflare-workers.ts`，生产入口 `dist/cloudflare-workers.mjs`。
5. Vercel：源码入口 `apps/server/src/vercel.ts`，构建产物 `dist/vercel.mjs`，平台实际入口 `api/index.js`。

## 当前公共装配入口

1. 通用 Hono 应用装配入口：`apps/server/src/app.ts`。
2. Node.js / Docker / Bun / 当前 Vercel 的数据库装配入口：`apps/server/src/node-app.ts`。
3. Cloudflare Workers 的数据库装配入口：`apps/server/src/cloudflare-app.ts`。
4. 兼容 API 路由入口：`packages/core/src/routes/index.ts`。

## 待完成

1. 补充迁移脚本对 D1 或其他远程目标的支持策略。
2. 增强迁移脚本的交互确认、日志明细与错误报告。
3. 实现 `X-LC-Sign` 校验与时间戳窗口控制。
4. 增加限流、防刷量与安全增强能力。
5. 设计并实现部署期批量初始化 Counter 的管理能力。
6. 开始自有 Hexo 插件的包拆分与实现。

## 当前判断

1. 后端 MVP 主体已经成型。
2. 当前最重要的缺口已经从“基础迁移可用性”转向“迁移增强、管理能力与安全增强能力”。
3. Vercel 虽然保留了适配入口，但在外部数据库方案落地前，仍不应作为当前阶段的主推部署目标。
