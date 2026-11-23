# Pigeon · 信鸽

Pigeon 是一个自托管文件分享服务。登录后上传文件并复制分享地址。访客可匿名提取文件, 获得支持 HTTP Range 续传的限时下载直链。界面默认根据浏览器语言偏好显示简体中文、繁體中文或英文, 其他语言回退到英文。可在登录页、主页和分享页切换语言, 浏览器会记住选择。

## 启动

从 GitHub Releases 下载对应平台的二进制, 在终端运行。以下示例使用占位密码, 部署时请替换。

```sh
pigeon --user 'alice:example-password' --port 3000
```

| 参数 | 用途与默认值 |
| --- | --- |
| `--user 'username:password'` | 配置允许登录上传的账号, 可重复指定。零账号时可继续访问既有分享 |
| `--port <port>` | HTTP 监听端口, 默认 `3000` |
| `--base-path <path>` | 公网部署路径, 默认 `/` |
| `--data <dir>` | 数据目录, 默认当前工作目录下的 `./pigeon-data` |

根路径部署的入口是 `/`。用 `--base-path /pigeon` 时, 入口是 `/pigeon`, 分享地址为 `/pigeon/sharing?id=...`, 爬虫规则位于 `/pigeon/robots.txt`。反向代理应保留配置的路径前缀。

## 分享与数据

- 在分享设置里查看剩余磁盘空间和调整分享条件. 点击上传框内的「上传文件」或「上传目录」选择内容, 也可以把文件或目录拖到主页任意位置. 文件会立即上传, 目录会在浏览器中保留文件层级, 打包成 ZIP 后上传. 请选择至少包含一个文件的目录.
- 分享列表展示本账号上传且仍可提取的分享, 每页 20 条, 可按文件名搜索、复制链接或删除分享. 确认删除后立即撤销分享和已发直链, 已经开始的传输结束后回收文件.
- 上传页预填 7 天有效期。清空后, 分享没有时间限制。三项分享条件可组合, 密码默认关闭, 提取次数默认不限。开启密码时自动生成 5 位密码, 支持自行修改为 1 到 64 位英文字母或数字.
- 登录密码验证按用户名独立计时, 每个用户名每 3 秒最多验证一次. 每个带密码的分享独立执行相同的验证间隔. 提前重试返回 HTTP 429, 并附带 `Retry-After`.
- 每次签发直链消耗一次提取额度。已签发的直链可以重复下载或续传, 直链最多有效 24 小时, 最晚与分享同时到期。分享失效、直链全部到期且传输结束后, 服务会删除文件和记录。
- 登录使用 `X-Pigeon-Token`, 令牌从签发起有效 180 天. 页面使用标签页会话存储保存令牌, 同一标签页刷新或在首页和分享页之间跳转时保留登录状态. 退出登录或会话失效时清除令牌. 后端重启后需重新登录.
- SQLite、文件和下载直链状态保存在 `--data`。每个数据目录由一个 Pigeon 实例独占。列表按上传时的用户名归属, 已发链接按各分享的规则处理.

公网请通过 HTTPS 反向代理访问。部署者自行配置外层 HTTP Auth。请限制数据目录权限, 并在代理日志中隐藏分享和直链查询参数。首版单文件上限为 64 GiB, 预留 256 MiB 磁盘空间。代理允许的请求大小和超时时间应与实际文件规模匹配。

## Docker

```sh
docker run --name pigeon -p 127.0.0.1:3000:3000 \
  -v pigeon-data:/data mebtte/pigeon:v0 \
  --data /data --user 'alice:example-password'
```

镜像支持 `linux/amd64` 和 `linux/arm64`, 容器以 UID/GID `65532` 运行。使用宿主目录挂载时, 为该用户授予目录写入权限。

## 本地开发

先运行 `nvm use` 和 `npm --prefix frontend ci` 安装前端依赖。安装 [Watchexec](https://watchexec.github.io/downloads/), macOS 可运行 `brew install watchexec`。

前端终端运行 Vite, 默认端口为 5173。

```sh
npm --prefix frontend run dev
```

后端终端运行开发监听脚本, 默认端口为 3000。脚本接受 Pigeon 的 CLI 参数。

```sh
sh scripts/dev-backend.sh --user 'alice:example-password'
```

脚本每 500 毫秒轮询后端源码和 Cargo 配置. 保存改动后, 会重新编译并重启 Rust 服务. 打开 [Vite 开发页面](http://127.0.0.1:5173/), React 改动通过 Vite 热更新。按 `Ctrl+C` 停止对应进程。

开发构建默认输出应用的 DEBUG 日志, 包含请求方法、路由模板、状态码、响应准备耗时和上传下载事件. 日志只记录路由模板和安全字段, 密码、令牌和分享 ID 均不输出. 可设置 `RUST_LOG=pigeon=info` 减少输出.

浏览器可以从 Rust 入口打开应用, React 模块由 Vite 提供。开发模式的 Vite 入口也支持通过开发代理访问 Rust API。调试子路径时, 给 Vite 设置与 Rust `--base-path` 相同的 `PIGEON_BASE_PATH`。

```sh
npm --prefix frontend test
npm --prefix frontend run build
cargo test --manifest-path backend/Cargo.toml --locked
cargo build --manifest-path backend/Cargo.toml --locked --release
python3 scripts/smoke_release.py backend/target/release/pigeon
python3 scripts/smoke_dev_backend.py
python3 scripts/smoke_share_list.py backend/target/release/pigeon
```

## 发版

新建并推送形如 `1.2.3` 的 Git tag 后, GitHub Actions 构建并测试 macOS arm64、Windows x86_64/arm64 和 Linux x86_64/arm64, 准备 GitHub Release 草稿, 更新 `mebtte/pigeon:v0`, 再公开 GitHub Release。在 GitHub Actions 的 Secrets 中配置 `DOCKERHUB_TOKEN`。镜像推送默认使用 `mebtte` 账号, 可通过仓库变量 `DOCKERHUB_USERNAME` 指定授权账号。
