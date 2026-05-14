# Cloudflare Content Platform

电子书 + 视频课程 + USDT 支付 + VIP 会员 + 分销推广的 Cloudflare Workers 原型。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_GITHUB_USERNAME/cloudflare-content-platform)

> 部署前，把上面的 `YOUR_GITHUB_USERNAME` 替换成你的 GitHub 用户名。如果仓库名不是 `cloudflare-content-platform`，也要一起替换。

## 功能

- `GET /api/catalog`：读取 GitHub 内容目录。
- `GET /api/me`：用户中心信息、VIP 状态、推广链接、收益。
- `POST /api/orders`：创建 VIP 或单内容 USDT 订单。
- `POST /api/usdt/callback`：USDT 支付回调，自动发放权益。
- `POST /api/access-token`：生成 PDF/视频试看或完整访问 token。

## 一键部署

1. 新建一个公开 GitHub 仓库，建议名为 `cloudflare-content-platform`。
2. 把本目录所有文件上传到仓库根目录。
3. 修改本 README 顶部的 Deploy to Cloudflare 按钮链接。
4. 点击按钮，登录 Cloudflare 并授权。
5. Cloudflare 会读取 `wrangler.toml`，自动创建并绑定 D1、KV、R2。
6. 按页面提示填写环境变量和密钥，然后部署。

Cloudflare 官方说明：Deploy to Cloudflare 按钮会克隆公开 Git 仓库，并根据 Wrangler 配置自动创建所需资源，包括 KV、D1 和 R2。

## 必填配置

部署页面会读取 `.dev.vars.example`，你需要填写：

```text
USDT_CALLBACK_SECRET=你的USDT监听器回调密钥
GITHUB_CATALOG_URL=https://raw.githubusercontent.com/你的用户名/content-library/main/catalog.json
```

如果内容目录仓库是私有仓库，还需要：

```text
GITHUB_TOKEN=你的GitHub只读Token
```

生产建议让内容目录仓库公开，但真实 PDF/视频文件放 Cloudflare R2，避免 GitHub token 暴露和大文件限制。

## 内容仓库

内容目录示例在：

```text
content/catalog.example.json
```

建议单独创建一个 GitHub 仓库 `content-library`，把它复制为：

```text
catalog.json
```

正式文件放到 R2，路径和 `catalog.json` 中的 `r2Key` 对应：

```text
ebooks/ebook-demo.pdf
videos/course-demo/master.m3u8
```

## 本地部署命令

```powershell
npm install
npx wrangler login
npm run deploy
```

如果只想初始化数据库：

```powershell
npm run db:migrations:apply
```

## GitHub 上传

如果你安装了 Git，可以在本目录执行：

```powershell
git init
git add .
git commit -m "Initial Cloudflare content platform"
git branch -M main
git remote add origin https://github.com/你的用户名/cloudflare-content-platform.git
git push -u origin main
```

推送后，把 README 里的按钮 URL 改成你的真实仓库地址。
