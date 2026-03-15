<h1 align="center">hexo-cloudflare-counter </h1>
<p>
  <img alt="Version" src="https://img.shields.io/github/package-json/v/CaoMeiYouRen/hexo-cloudflare-counter.svg" />
  <a href="https://hub.docker.com/r/caomeiyouren/hexo-cloudflare-counter" target="_blank">
    <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/caomeiyouren/hexo-cloudflare-counter">
  </a>
  <a href="https://github.com/CaoMeiYouRen/hexo-cloudflare-counter/actions?query=workflow%3ARelease" target="_blank">
    <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/CaoMeiYouRen/hexo-cloudflare-counter/release.yml?branch=master">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D16-blue.svg" />
  <a href="https://github.com/CaoMeiYouRen/hexo-cloudflare-counter#readme" target="_blank">
    <img alt="Documentation" src="https://img.shields.io/badge/documentation-yes-brightgreen.svg" />
  </a>
  <a href="https://github.com/CaoMeiYouRen/hexo-cloudflare-counter/graphs/commit-activity" target="_blank">
    <img alt="Maintenance" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" />
  </a>
  <a href="https://github.com/CaoMeiYouRen/hexo-cloudflare-counter/blob/master/LICENSE" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/github/license/CaoMeiYouRen/hexo-cloudflare-counter?color=yellow" />
  </a>
</p>


> 兼容 LeanCloud Counter API 的 Hexo 阅读量统计后端服务，支持 Cloudflare Workers、Docker 和 Node.js 自托管，内置 D1/SQLite 存储方案。

## 项目说明

当前仓库已经进入 workspace 结构，核心目录如下：

1. `apps/server`：服务端运行时入口与平台适配。
2. `packages/core`：共享业务内核，包含 Counter 类型、Service、ObjectId 风格 ID 生成与兼容路由。
3. `test`：当前最小兼容 API 集成测试。
4. `docs`：设计文档与当前阶段任务清单。

## 当前已实现内容

1. LeanCloud Counter 最小兼容接口：`GET /1.1/classes/Counter`、`POST /1.1/classes/Counter`、`PUT /1.1/classes/Counter/:objectId`。
2. Node.js / Docker 使用 SQLite 存储。
3. Cloudflare Workers 使用 D1 存储。
4. `objectId` 已切换为接近 MongoDB / LeanCloud 风格的 24 位十六进制字符串，而不是 UUID。
5. 已完成 workspace 形态下的 core 与 server 拆分。
6. 当前已有类型检查、lint、构建与基础接口测试。

## 平台入口与最终运行文件

当前各平台入口关系如下：

| 平台 | 开发入口 | 构建产物入口 | 最终运行链路 |
| --- | --- | --- | --- |
| Node.js 自托管 | `apps/server/src/index.ts` | `dist/index.mjs` | `index.ts` -> `node-app.ts` -> `app.ts` -> `packages/core/src/routes/index.ts` |
| Docker | 构建时同 Node | `dist/index.mjs` | Docker `CMD ["node", "dist/index.mjs"]`，实际仍走 Node 入口链路 |
| Bun | `apps/server/src/bun.ts` | `dist/bun.mjs` | `bun.ts` -> `node-app.ts` -> `app.ts` |
| Cloudflare Workers | `apps/server/src/cloudflare-workers.ts` | `dist/cloudflare-workers.mjs` | `cloudflare-workers.ts` -> `cloudflare-app.ts` -> `app.ts` |
| Vercel | `apps/server/src/vercel.ts` | `dist/vercel.mjs`，经 `api/index.js` 转发 | `api/index.js` -> `dist/vercel.mjs` -> `vercel.ts` -> `node-app.ts` -> `app.ts` |

补充说明：

1. 真正承载通用 Hono 应用装配的是 `apps/server/src/app.ts`。
2. 真正承载兼容 API 业务逻辑的是 `packages/core/src/routes/index.ts`。
3. Node.js、Docker、Bun、Vercel 当前都复用 `apps/server/src/node-app.ts`，也就是 SQLite 路线。
4. Workers 单独走 `apps/server/src/cloudflare-app.ts`，也就是 D1 路线。
5. Vercel 目前保留了入口适配代码，但仍不作为当前阶段推荐的生产部署目标。

## 依赖要求

1. Node.js >= 18

## 安装

```sh
pnpm install
```

## 本地开发

```sh
pnpm run dev
```

## 构建

```sh
pnpm run build
```

## 测试

```sh
pnpm run test
```

## 代码检查

```sh
pnpm run typecheck
pnpm run lint
```

## 部署说明

1. Node.js 自托管：构建后执行 `node dist/index.mjs`。
2. Docker：镜像最终执行的也是 `node dist/index.mjs`。
3. Cloudflare Workers：`wrangler.toml` 开发环境入口是 `apps/server/src/cloudflare-workers.ts`，生产入口是 `dist/cloudflare-workers.mjs`。
4. Vercel：当前通过 `api/index.js` 转发到 `dist/vercel.mjs`，但由于当前阶段没有外部数据库方案，不推荐作为生产落地路径。

当前设计和阶段状态见 `docs/plan.md` 与 `docs/todo.md`。

## 提交

```sh
pnpm run commit
```


## 👤 作者


**CaoMeiYouRen**

* Website: [https://blog.cmyr.ltd/](https://blog.cmyr.ltd/)

* GitHub: [@CaoMeiYouRen](https://github.com/CaoMeiYouRen)


## 🤝 贡献

欢迎 贡献、提问或提出新功能！<br />如有问题请查看 [issues page](https://github.com/CaoMeiYouRen/hexo-cloudflare-counter/issues). <br/>贡献或提出新功能可以查看[contributing guide](https://github.com/CaoMeiYouRen/hexo-cloudflare-counter/blob/master/CONTRIBUTING.md).

## 💰 支持

如果觉得这个项目有用的话请给一颗⭐️，非常感谢

<a href="https://afdian.com/@CaoMeiYouRen">
  <img src="https://oss.cmyr.dev/images/202306192324870.png" width="312px" height="78px" alt="在爱发电支持我">
</a>


## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=CaoMeiYouRen/hexo-cloudflare-counter&type=Date)](https://star-history.com/#CaoMeiYouRen/hexo-cloudflare-counter&Date)

## 📝 License

Copyright © 2026 [CaoMeiYouRen](https://github.com/CaoMeiYouRen).<br />
This project is [MIT](https://github.com/CaoMeiYouRen/hexo-cloudflare-counter/blob/master/LICENSE) licensed.

***
_This README was generated with ❤️ by [cmyr-template-cli](https://github.com/CaoMeiYouRen/cmyr-template-cli)_
