const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/catalog") {
      return json(await getCatalog(env));
    }

    if (request.method === "GET" && url.pathname === "/api/admin/config") {
      return json(await getAdminConfig(request, env));
    }

    if (request.method === "GET" && url.pathname === "/api/admin/categories") {
      return json(await listCategories(request, env));
    }

    if (request.method === "POST" && url.pathname === "/api/admin/categories") {
      return json(await upsertCategory(request, env));
    }

    if (request.method === "POST" && url.pathname === "/api/admin/content/batch") {
      return json(await importContentBatch(request, env));
    }

    if (request.method === "POST" && url.pathname === "/api/admin/cloud-drive/sync") {
      return json(await syncCloudDrive(request, env));
    }

    if (request.method === "POST" && url.pathname === "/api/ai-customer-service/chat") {
      return json(await aiCustomerServiceChat(request, env));
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      return json(await getCurrentUser(request, env));
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      return json(await createOrder(request, env), 201);
    }

    if (request.method === "POST" && url.pathname === "/api/usdt/callback") {
      return json(await handleUsdtCallback(request, env));
    }

    if (request.method === "POST" && url.pathname === "/api/entitlements/sync") {
      return json(await syncEntitlementFromBackend(request, env));
    }

    if (request.method === "POST" && url.pathname === "/api/access-token") {
      return json(await createAccessToken(request, env));
    }

    return json({ error: "not_found" }, 404);
  }
};

async function getCatalog(env) {
  const cached = await env.CONTENT_CACHE?.get("catalog");
  if (cached) return JSON.parse(cached);

  let catalog;
  if (env.GITHUB_CATALOG_URL) {
    const headers = {};
    if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
    const res = await fetch(env.GITHUB_CATALOG_URL, { headers });
    if (!res.ok) throw new Error(`catalog_fetch_failed:${res.status}`);
    catalog = await res.json();
  } else {
    catalog = {
      updatedAt: new Date().toISOString(),
      banners: [],
      items: [],
      vipPlans: []
    };
  }

  await env.CONTENT_CACHE?.put("catalog", JSON.stringify(catalog), {
    expirationTtl: 60
  });
  return catalog;
}

async function getAdminConfig(request, env) {
  requireAdmin(request, env);
  return {
    upload: {
      batchImport: true,
      supportedFileTypes: ["pdf", "mp4", "m3u8", "jpg", "png", "json", "csv"],
      storage: "Cloudflare R2"
    },
    cloudDrive: {
      enabled: Boolean(env.CLOUD_DRIVE_PROVIDER),
      provider: env.CLOUD_DRIVE_PROVIDER || null,
      mode: "metadata-sync-to-r2"
    },
    aiCustomerService: {
      enabled: Boolean(env.AI_CUSTOMER_SERVICE_ENDPOINT),
      endpointConfigured: Boolean(env.AI_CUSTOMER_SERVICE_ENDPOINT)
    }
  };
}

async function listCategories(request, env) {
  requireAdmin(request, env);
  const result = await env.CONTENT_DB.prepare(
    "SELECT id, name, type, parent_id, sort, status, created_at, updated_at FROM categories ORDER BY sort ASC, created_at DESC"
  ).all();

  return {
    code: 200,
    data: result.results || []
  };
}

async function upsertCategory(request, env) {
  requireAdmin(request, env);
  const body = await request.json();
  const id = String(body.id || crypto.randomUUID()).trim();
  const name = String(body.name || "").trim();
  const type = String(body.type || "ebook").trim();
  if (!name) return { code: 422, message: "missing category name" };

  const now = new Date().toISOString();
  await env.CONTENT_DB.prepare(
    `INSERT INTO categories (id, name, type, parent_id, sort, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       parent_id = excluded.parent_id,
       sort = excluded.sort,
       status = excluded.status,
       updated_at = excluded.updated_at`
  ).bind(
    id,
    name,
    type,
    body.parentId || null,
    Number(body.sort || 0),
    body.status || "active",
    now,
    now
  ).run();

  return {
    code: 200,
    message: "success",
    data: { id, name, type }
  };
}

async function importContentBatch(request, env) {
  requireAdmin(request, env);
  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items : [];
  const validItems = items.filter((item) => item.id && item.type && item.title && item.r2Key);

  await env.CONTENT_CACHE.put("admin:last-batch-import", JSON.stringify({
    imported: validItems.length,
    skipped: items.length - validItems.length,
    importedAt: new Date().toISOString(),
    items: validItems
  }));

  return {
    code: 200,
    message: "success",
    imported: validItems.length,
    skipped: items.length - validItems.length
  };
}

async function syncCloudDrive(request, env) {
  requireAdmin(request, env);
  const body = await request.json();
  const provider = body.provider || env.CLOUD_DRIVE_PROVIDER || "manual";

  await env.CONTENT_CACHE.put("admin:last-cloud-drive-sync", JSON.stringify({
    provider,
    folderId: body.folderId || null,
    mode: body.mode || "metadata-sync-to-r2",
    syncedAt: new Date().toISOString()
  }));

  return {
    code: 200,
    message: "queued",
    provider,
    mode: body.mode || "metadata-sync-to-r2"
  };
}

async function aiCustomerServiceChat(request, env) {
  const body = await request.json();
  if (!env.AI_CUSTOMER_SERVICE_ENDPOINT) {
    return {
      code: 503,
      message: "ai customer service is not configured"
    };
  }

  const response = await fetch(env.AI_CUSTOMER_SERVICE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.AI_CUSTOMER_SERVICE_TOKEN
        ? { authorization: `Bearer ${env.AI_CUSTOMER_SERVICE_TOKEN}` }
        : {})
    },
    body: JSON.stringify({
      userId: getUserId(request),
      message: body.message || "",
      context: body.context || {}
    })
  });

  return response.ok
    ? await response.json()
    : { code: response.status, message: "ai customer service upstream failed" };
}

async function getCurrentUser(request, env) {
  const userId = getUserId(request);
  if (!userId) return guestUser();

  const row = await env.CONTENT_DB.prepare(
    "SELECT id, email, name, ref_code, vip_until FROM users WHERE id = ?"
  ).bind(userId).first();

  if (!row) return guestUser();

  const isVip = row.vip_until && new Date(row.vip_until).getTime() > Date.now();
  const earnings = await env.CONTENT_DB.prepare(
    "SELECT COALESCE(SUM(CAST(amount_usdt AS REAL)), 0) AS total FROM affiliate_ledger WHERE user_id = ? AND status = 'settled'"
  ).bind(userId).first();

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    vip: Boolean(isVip),
    vipUntil: row.vip_until,
    referralLink: `/register?ref=${row.ref_code}`,
    earningsUsdt: String(earnings?.total ?? 0)
  };
}

async function createOrder(request, env) {
  const userId = requireUserId(request);
  const body = await request.json();
  const catalog = await getCatalog(env);
  const target = findOrderTarget(catalog, body.kind, body.targetId);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.CONTENT_DB.prepare(
    "INSERT INTO orders (id, user_id, kind, target_id, amount_usdt, status, ref_code, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)"
  ).bind(id, userId, body.kind, body.targetId, target.priceUsdt, body.refCode || null, now).run();

  return {
    id,
    status: "pending",
    amountUsdt: target.priceUsdt,
    payMemo: id
  };
}

async function handleUsdtCallback(request, env) {
  const body = await request.json();
  const verified = await verifyBepusdtSign(body, env.BEPUSDT_MERCHANT_KEY);
  if (!verified) return { code: 400, message: "bad sign" };
  if (body.status && body.status !== "success") {
    return { code: 200, message: "ignored non-success status" };
  }

  const order = await env.CONTENT_DB.prepare(
    "SELECT * FROM orders WHERE id = ? AND status = 'pending'"
  ).bind(body.trade_no).first();

  if (!order) return { code: 200, message: "success", ignored: "order_not_pending" };

  const paidAmount = String(body.pay_amount || body.amount || "");
  if (normalizeMoney(paidAmount) !== normalizeMoney(order.amount_usdt)) {
    return { code: 422, message: "amount mismatch" };
  }

  const now = new Date().toISOString();
  await env.CONTENT_DB.prepare(
    "UPDATE orders SET status = 'paid', txid = ?, paid_at = ? WHERE id = ?"
  ).bind(body.tx_id || "", body.paid_at || now, order.id).run();

  if (order.kind === "vip") {
    await extendVip(env, order.user_id, order.target_id);
  } else {
    await grantContent(env, order.user_id, order.target_id, "purchase");
  }

  await createAffiliateLedger(env, order);
  return { code: 200, message: "success" };
}

async function syncEntitlementFromBackend(request, env) {
  const secret = request.headers.get("x-content-sync-secret");
  if (!env.CONTENT_SYNC_SECRET || secret !== env.CONTENT_SYNC_SECRET) {
    return { code: 401, message: "unauthorized" };
  }

  const body = await request.json();
  const userId = String(body.userId || "").trim();
  const kind = String(body.kind || "").trim();
  const targetId = String(body.targetId || "").trim();
  if (!userId || !kind || !targetId) {
    return { code: 422, message: "missing userId, kind or targetId" };
  }

  if (kind === "vip") {
    await extendVip(env, userId, targetId);
  } else if (kind === "content") {
    await grantContent(env, userId, targetId, body.source || "backend-payment");
  } else {
    return { code: 422, message: "invalid kind" };
  }

  return { code: 200, message: "success" };
}

async function createAccessToken(request, env) {
  const userId = getUserId(request);
  const body = await request.json();
  const catalog = await getCatalog(env);
  const item = catalog.items.find((entry) => entry.id === body.contentId);
  if (!item) return { error: "content_not_found" };

  const access = await canAccessContent(env, userId, item);
  const token = crypto.randomUUID();
  await env.CONTENT_CACHE.put(`access:${token}`, JSON.stringify({
    userId,
    contentId: item.id,
    r2Key: item.r2Key,
    full: access.full,
    previewPages: item.previewPages || null,
    previewSeconds: item.previewSeconds || null
  }), { expirationTtl: 300 });

  return {
    token,
    full: access.full,
    previewPages: access.full ? null : item.previewPages || null,
    previewSeconds: access.full ? null : item.previewSeconds || null,
    expiresIn: 300
  };
}

async function canAccessContent(env, userId, item) {
  if (!item.vipOnly) return { full: true, reason: "free" };
  if (!userId) return { full: false, reason: "guest_preview" };

  const user = await env.CONTENT_DB.prepare(
    "SELECT vip_until FROM users WHERE id = ?"
  ).bind(userId).first();
  if (user?.vip_until && new Date(user.vip_until).getTime() > Date.now()) {
    return { full: true, reason: "vip" };
  }

  const entitlement = await env.CONTENT_DB.prepare(
    "SELECT id FROM entitlements WHERE user_id = ? AND content_id = ? AND (expires_at IS NULL OR expires_at > ?)"
  ).bind(userId, item.id, new Date().toISOString()).first();

  return entitlement ? { full: true, reason: "purchase" } : { full: false, reason: "preview" };
}

async function extendVip(env, userId, planId) {
  const catalog = await getCatalog(env);
  const plan = catalog.vipPlans.find((entry) => entry.id === planId);
  if (!plan) throw new Error("vip_plan_not_found");

  const user = await env.CONTENT_DB.prepare(
    "SELECT vip_until FROM users WHERE id = ?"
  ).bind(userId).first();

  const base = user?.vip_until && new Date(user.vip_until).getTime() > Date.now()
    ? new Date(user.vip_until)
    : new Date();
  base.setDate(base.getDate() + Number(plan.days));

  await env.CONTENT_DB.prepare(
    "UPDATE users SET vip_until = ? WHERE id = ?"
  ).bind(base.toISOString(), userId).run();
}

async function grantContent(env, userId, contentId, source) {
  await env.CONTENT_DB.prepare(
    "INSERT INTO entitlements (id, user_id, content_id, source, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, contentId, source, new Date().toISOString()).run();
}

async function createAffiliateLedger(env, order) {
  if (!order.ref_code) return;

  const promoter = await env.CONTENT_DB.prepare(
    "SELECT id FROM users WHERE ref_code = ?"
  ).bind(order.ref_code).first();
  if (!promoter || promoter.id === order.user_id) return;

  const amount = (Number(order.amount_usdt) * 0.3).toFixed(2);
  await env.CONTENT_DB.prepare(
    "INSERT INTO affiliate_ledger (id, order_id, user_id, from_user_id, level, amount_usdt, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
  ).bind(crypto.randomUUID(), order.id, promoter.id, order.user_id, amount, new Date().toISOString()).run();
}

function findOrderTarget(catalog, kind, targetId) {
  if (kind === "vip") {
    const plan = catalog.vipPlans.find((entry) => entry.id === targetId);
    if (plan) return plan;
  }

  if (kind === "content") {
    const item = catalog.items.find((entry) => entry.id === targetId);
    if (item) return item;
  }

  throw new Error("invalid_order_target");
}

function getUserId(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer dev-user-")) return null;
  return header.slice("Bearer ".length);
}

function requireUserId(request) {
  const userId = getUserId(request);
  if (!userId) throw new Error("login_required");
  return userId;
}

function requireAdmin(request, env) {
  const token = request.headers.get("x-admin-token");
  if (!env.ADMIN_API_TOKEN || token !== env.ADMIN_API_TOKEN) {
    throw new Error("admin_required");
  }
}

async function verifyBepusdtSign(payload, merchantKey) {
  if (!merchantKey || !payload?.sign) return false;
  const data = canonicalBepusdtPayload(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(merchantKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toHex(signature) === String(payload.sign).toLowerCase();
}

function canonicalBepusdtPayload(payload) {
  return Object.keys(payload)
    .filter((key) => key !== "sign" && payload[key] !== undefined && payload[key] !== null)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(payload[key]))}`)
    .join("&");
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeMoney(value) {
  return Number(value).toFixed(2);
}

function guestUser() {
  return {
    id: null,
    vip: false,
    vipUntil: null,
    referralLink: null,
    earningsUsdt: "0"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}
