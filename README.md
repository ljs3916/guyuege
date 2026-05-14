# Guyuege Cloudflare Content Platform

电子书 + 视频课程 + VIP 会员 + 分销推广的 Cloudflare Workers 内容权限项目。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ljs3916/guyuege/tree/main/cloudflare-content-platform)

## 支付方式

支付接口在后台系统里配置，不在 Cloudflare 项目里配置。

后台配置：

- 支付网关：BEPUSDT / 你的支付插件网关
- KEY：后台支付插件的 `merchant_key`
- 监听器：`bepusdt-trc20-listener`
- 收款地址：你的 USDT-TRC20 地址
- 电子书：支持单本上传、批量导入、云盘绑定同步
- AI 客服：后台绑定 AI 客服接口和 Token

Cloudflare 内容平台不保存支付网关 KEY，只负责电子书、视频、VIP 权限。

推荐流程：

```text
用户下单 -> 后台创建支付订单 -> BEPUSDT 监听到账 -> 后台订单变为已支付 -> 后台调用 Cloudflare 同步权益 -> 用户解锁 VIP/电子书/视频
```

## 后台同步权益

支付成功后，后台调用：

```text
POST https://你的worker地址/api/entitlements/sync
```

Header：

```text
x-content-sync-secret: 你在 Cloudflare 设置的 CONTENT_SYNC_SECRET
content-type: application/json
```

开通 VIP 示例：

```json
{
  "userId": "用户ID",
  "kind": "vip",
  "targetId": "vip-month"
}
```

解锁单个内容示例：

```json
{
  "userId": "用户ID",
  "kind": "content",
  "targetId": "ebook-demo",
  "source": "backend-payment"
}
```

## 后台内容管理

后台可以通过接口把电子书、视频、封面、试看规则同步到 Cloudflare 内容平台。

后台管理接口需要请求头：

```text
x-admin-token: 你在 Cloudflare 设置的 ADMIN_API_TOKEN
content-type: application/json
```

电子书/视频分类列表：

```text
GET https://你的worker地址/api/admin/categories
```

创建或更新分类：

```text
POST https://你的worker地址/api/admin/categories
```

Body 示例：

```json
{
  "id": "ebook-hot",
  "name": "热门电子书",
  "type": "ebook",
  "parentId": null,
  "sort": 10,
  "status": "active"
}
```

分类字段说明：

- `id`：分类 ID，可用英文、数字、短横线。
- `name`：后台和前台显示名称。
- `type`：`ebook` 或 `video`。
- `parentId`：上级分类，没有就填 `null`。
- `sort`：排序，数字越小越靠前。
- `status`：`active` 或 `hidden`。

批量导入内容：

```text
POST https://你的worker地址/api/admin/content/batch
```

Body 示例：

```json
{
  "items": [
    {
      "id": "ebook-001",
      "type": "ebook",
      "title": "电子书标题",
      "categoryId": "ebook-hot",
      "cover": "covers/ebook-001.jpg",
      "previewPages": 10,
      "r2Key": "ebooks/ebook-001.pdf"
    },
    {
      "id": "course-001",
      "type": "video",
      "title": "视频课程标题",
      "categoryId": "video-recommended",
      "cover": "covers/course-001.jpg",
      "previewSeconds": 300,
      "r2Key": "videos/course-001/master.m3u8"
    }
  ]
}
```

云盘绑定同步：

```text
POST https://你的worker地址/api/admin/cloud-drive/sync
```

Body 示例：

```json
{
  "provider": "openlist",
  "folderId": "电子书目录ID",
  "mode": "metadata-sync-to-r2"
}
```

推荐云盘模式：

- 云盘/OpenList/Alist 用作后台素材管理入口。
- 正式付费内容同步到 Cloudflare R2。
- GitHub 公开仓库只保存目录示例，不保存真实文件。

## AI 客服

AI 客服接口：

```text
POST https://你的worker地址/api/ai-customer-service/chat
```

Body 示例：

```json
{
  "message": "VIP 怎么开通？",
  "context": {
    "page": "vip"
  }
}
```

Cloudflare Secret / 变量：

```text
AI_CUSTOMER_SERVICE_ENDPOINT=你的AI客服接口地址
AI_CUSTOMER_SERVICE_TOKEN=你的AI客服接口Token
```

`AI_CUSTOMER_SERVICE_TOKEN` 不要上传 GitHub。

## 安全说明

公开 GitHub 仓库只放代码、示例目录和 Cloudflare 资源绑定名称。

可以公开：

- `src/index.js`
- `wrangler.toml`
- `package.json`
- `migrations/0001_init.sql`
- `content/catalog.example.json`

不能公开：

- `CONTENT_SYNC_SECRET`
- `BEPUSDT_MERCHANT_KEY`
- `ADMIN_API_TOKEN`
- `AI_CUSTOMER_SERVICE_TOKEN`
- `GITHUB_TOKEN`
- Cloudflare API Token
- 钱包私钥、助记词
- 后台真实账号密码
- 真实 PDF/视频文件

真实电子书和视频请放 Cloudflare R2。公开 GitHub 目录里只保存 `r2Key`，例如 `ebooks/ebook-demo.pdf`。

`wrangler.toml` 不写 D1/KV/R2 的真实 ID，只声明绑定名称。Cloudflare 会在部署时自动创建并绑定资源。

Worker 部署名由 Cloudflare / GitHub 项目自动生成，`wrangler.toml` 不再硬编码 `name`。

自动创建的 D1/KV/R2 会在 Cloudflare 后台以部署名作为前缀区分。你看到的资源名称应按这个思路识别：

```text
D1: <Cloudflare项目名> / CONTENT_DB
KV: <Cloudflare项目名> / CONTENT_CACHE
R2: <Cloudflare项目名> / CONTENT_BUCKET
```

这样不会再出现 `content-platform`、`你的 KV`、`guyueger2` 混用的问题。

## Cloudflare 部署

1. 点击 README 顶部的 `Deploy to Cloudflare` 按钮。
2. 登录 Cloudflare 并授权 GitHub。
3. 项目目录选择 `cloudflare-content-platform`。
4. Deploy command 使用：

```bash
npm run deploy
```

5. Cloudflare 会自动创建并绑定 D1/KV/R2。绑定名称固定为：

```text
D1 binding name: CONTENT_DB
KV binding name: CONTENT_CACHE
R2 binding name: CONTENT_BUCKET
```

资源在后台用部署名区分：

```text
Worker: 以 Cloudflare / GitHub 项目名为准
D1: <Cloudflare项目名> / CONTENT_DB
KV: <Cloudflare项目名> / CONTENT_CACHE
R2: <Cloudflare项目名> / CONTENT_BUCKET
```

代码里使用的是：

```text
env.CONTENT_DB
env.CONTENT_CACHE
env.CONTENT_BUCKET
```

6. Deploy command 必须使用：

```bash
npm run deploy
```

这个命令会先部署 Worker，让 Cloudflare 自动创建 D1/KV/R2，然后执行 D1 migrations 建表。

7. 如果页面要求填写变量：

```text
GITHUB_CATALOG_URL=https://raw.githubusercontent.com/ljs3916/guyuege/main/cloudflare-content-platform/content/catalog.example.json
GITHUB_TOKEN=
```

8. 在 Cloudflare 后台添加 Secret：

```text
Workers & Pages -> guyuege -> Settings -> Variables -> Add variable
```

变量名：

```text
CONTENT_SYNC_SECRET
```

类型选择 Secret，值填写一串随机长密钥。这个密钥只给你的后台使用，不要上传 GitHub。

后台上传、批量导入、云盘同步需要再添加一个 Secret：

```text
ADMIN_API_TOKEN
```

AI 客服如果使用私有接口，需要添加：

```text
AI_CUSTOMER_SERVICE_TOKEN
```

## 可选 BEPUSDT 直连

如果你让 `bepusdt-trc20-listener` 直接回调 Cloudflare，而不是先回调后台，`POST /api/usdt/callback` 也已兼容 BEPUSDT 回调格式。

这种模式需要在 Cloudflare Secret 里额外设置：

```text
BEPUSDT_MERCHANT_KEY
```

它必须和 `bepusdt-trc20-listener` 的 `MERCHANT_KEY` 完全一致。

但当前推荐方式仍然是：支付网关和 KEY 绑定在后台，由后台调用 `/api/entitlements/sync`。

## API

- `GET /api/catalog`：内容目录。
- `GET /api/me`：用户信息、VIP 状态、推广收益。
- `POST /api/orders`：创建内容平台订单记录。
- `POST /api/entitlements/sync`：后台支付成功后同步 VIP/内容权益。
- `GET /api/admin/categories`：后台读取电子书/视频分类。
- `POST /api/admin/categories`：后台创建或更新分类。
- `POST /api/admin/content/batch`：后台批量导入电子书/视频。
- `POST /api/admin/cloud-drive/sync`：后台云盘绑定同步。
- `POST /api/ai-customer-service/chat`：AI 客服转发接口。
- `POST /api/usdt/callback`：可选，BEPUSDT 直接回调。
- `POST /api/access-token`：生成 PDF/视频访问 token。

## 测试

部署后打开：

```text
https://你的worker地址/api/catalog
https://你的worker地址/api/me
```

`/api/catalog` 返回 JSON 内容目录，说明部署成功。
