# Cloudflare + GitHub 内容平台方案

这个目录是一套独立原型，用来把现有发卡/会员/分销思路扩展成「电子书 + 视频课程 + USDT 支付 + VIP + 分销」平台。

## 推荐架构

- Cloudflare Pages：前端页面、会员中心、播放器页面。
- Cloudflare Workers：API、登录态校验、试看限制、USDT 回调、推广归因、签名下载链接。
- Cloudflare D1：用户、订单、VIP、分销、收益、内容购买记录。
- Cloudflare R2：正式存储 PDF、视频、封面、试看片段。
- Cloudflare KV：缓存内容目录、短期播放/下载 token、邀请码映射。
- GitHub 仓库：存放内容目录、后台配置、少量小体积样章。大文件和视频不要长期放 GitHub。

GitHub 适合做「内容索引仓库」，例如 `catalog.json`、封面路径、章节配置、R2 object key。PDF/视频如果放在公开 GitHub raw 链接，VIP 权限基本无法真正保护；如果放私有仓库，又会遇到 API 限流、带宽、文件大小和 token 泄漏风险。所以生产环境建议：GitHub 管目录，R2 管文件。

## 模块拆分

### 内容系统

- 电子书：标题、分类、封面、页数、试看页数、R2 文件 key。
- 视频课程：标题、分类、封面、总时长、试看秒数、HLS/MP4 R2 key。
- 内容权限：免费、VIP 解锁、单独购买、兑换码解锁。

### 支付系统 USDT

- 创建订单：用户选择 VIP 套餐或单个内容，生成待支付订单。
- 收款监听：接入现有 `bepusdt-trc20-listener` 或其它 TRC20 监听器。
- 回调确认：Workers 接收回调，校验签名、金额、订单号、链上 txid。
- 发放权益：支付成功后开通 VIP、写入购买记录、触发分销返佣。

### 分销系统

- 注册/访问时绑定邀请码。
- 每个用户生成推广链接：`https://domain.com/?ref=邀请码`。
- 订单成功后按配置计算一级/二级/三级返佣。
- 收益分为：待结算、可提现、已提现、冻结。

### 用户系统

- 登录注册。
- VIP 状态、到期时间。
- 我的书籍、我的课程、订单记录。
- 我的推广链接、我的团队、我的收益。

### 管理后台

- 内容管理：电子书、视频、分类、上下架、试看规则。
- 订单管理：USDT 订单、txid、支付状态。
- 会员管理：VIP 到期、购买记录、封禁。
- 分销管理：返佣比例、团队关系、提现审核。

## 权限规则

- Free 用户 PDF 只能看前 `previewPages` 页。
- Free 用户视频只能试看 `previewSeconds` 秒。
- VIP 用户解锁全部 VIP 内容。
- 已单独购买的内容，即使不是 VIP 也可完整访问。
- 文件真实地址不直接暴露给前端，前端只拿短期 token。

## 内容仓库结构

建议新建一个私有 GitHub 仓库，例如 `content-library`：

```text
content-library/
  catalog.json
  covers/
    ebook-demo.jpg
    course-demo.jpg
  samples/
    ebook-demo-preview.pdf
```

`catalog.json` 示例见本目录的 [content/catalog.example.json](content/catalog.example.json)。

## Cloudflare 环境变量

```text
JWT_SECRET=替换成随机长密钥
GITHUB_CATALOG_URL=https://raw.githubusercontent.com/owner/content-library/main/catalog.json
GITHUB_TOKEN=私有仓库读取 token，可选
USDT_CALLBACK_SECRET=支付监听器回调密钥
```

绑定资源：

```text
D1: CONTENT_DB
KV: CONTENT_CACHE
R2: CONTENT_BUCKET
```

## API 草案

- `GET /api/catalog`：内容首页目录。
- `GET /api/me`：用户信息、VIP、推广收益摘要。
- `POST /api/orders`：创建 VIP/内容订单。
- `POST /api/usdt/callback`：USDT 支付成功回调。
- `POST /api/access-token`：生成 PDF/视频短期访问 token。
- `GET /api/content/:id/preview`：返回试看配置。

## 和当前 PHP 发卡系统的关系

当前项目已经有商品、用户、订单、会员等级、推广返佣、后台管理等基础能力。最快落地路线是：

1. 继续用 PHP 系统做商品、订单、USDT 支付、用户和后台。
2. 新增 Cloudflare Worker 做内容保护层和播放器 API。
3. GitHub/R2 存内容目录和文件。
4. 支付成功后，PHP 系统把用户权益同步给 Worker/D1，或 Worker 反查 PHP 的订单接口。

这样可以少重写很多基础业务，先把「电子书/视频试看 + VIP 解锁」跑通。
