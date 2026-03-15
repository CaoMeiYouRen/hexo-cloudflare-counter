# 当前阶段状态

更新时间：2026-03

## 已完成

1. 已完成 workspace 基础结构，当前主要包为 `apps/server` 与 `packages/core`。
2. 已完成 LeanCloud Counter 最小兼容 API：`GET /1.1/classes/Counter`、`POST /1.1/classes/Counter`、`PUT /1.1/classes/Counter/:objectId`。
3. 已完成 `url` 与 `url.$in` 两类查询兼容，能够覆盖单篇文章与列表页批量查询场景。
4. 已完成基于 `APP_ID` / `APP_KEY` 的最小鉴权，对外兼容 `X-LC-Id` / `X-LC-Key` 请求头。
5. 已提供 `GET /healthz` 健康检查接口与 `GET /runtime` 运行时信息接口。
6. 已完成 SQLite 仓储，并接入 Node.js、Docker、Bun、当前 Vercel 路线。
7. 已完成 D1 仓储，并接入 Cloudflare Workers 路线。
8. 已完成 ObjectId 风格的 24 位十六进制 `objectId` 生成逻辑。
9. 已完成 requestId、日志、超时、Body 大小限制、CORS 与安全响应头等通用中间件装配。
10. 已完成基础测试、类型检查、lint 与构建链路。
11. 已完成 LeanCloud Counter JSONL -> SQLite 首版迁移脚本。
12. 已补充迁移脚本的基础测试与示例 JSONL 数据。
13. 已完成 LeanCloud Counter JSONL -> D1 的本地/远程迁移脚本，底层复用 Wrangler CLI 执行导入。
14. 已在文档中明确现阶段的兼容接入方式：现有 Hexo / NexT 项目主要只需把 `leancloud_visitors.server_url` 改为本服务地址；`server_url` 现为必填。

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

1. 增强迁移脚本的增量导入、分批导入与失败回滚策略。
2. 增强迁移脚本的交互确认、日志明细与错误报告。
3. 实现 `X-LC-Sign` 校验与时间戳窗口控制。
4. 增加限流、防刷量与安全增强能力。
5. 设计并实现部署期批量初始化 Counter 的管理能力。
6. 开始自有 Hexo 插件的包拆分与实现。

## 当前判断

1. 后端 MVP 主体已经成型。
2. 当前最重要的缺口已经从“基础兼容接口可用性”转向“迁移增强、管理能力与安全增强能力”。
3. Vercel 虽然保留了适配入口，但在外部数据库方案落地前，仍不应作为当前阶段的主推部署目标。
4. 对现有 Hexo / NexT 用户来说，当前迁移成本已经可以收敛到“部署后端并修改 `server_url`”这一主路径，但安全签名兼容仍待后续补齐。
