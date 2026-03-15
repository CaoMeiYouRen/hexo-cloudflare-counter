# Changesets Strategy

根级服务端发布继续使用 semantic-release。

Changesets 仅用于 workspace 中对外发布的 npm 包，例如未来的 Hexo 插件包。

当前仓库仍处于从单包实现向 workspace 结构过渡的阶段，因此包发布工作流会在检测到 apps/* 或 packages/* 下存在 package.json 后再生效。
