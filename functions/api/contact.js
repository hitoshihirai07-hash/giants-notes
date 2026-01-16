function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function getKvOrThrow(env) {
  const kv = env?.POSTS;
  if (!kv) throw new Error("KV binding 'POSTS' が設定されていません");
  if (typeof kv.get !== "function" || typeof kv.put !== "function") {
    throw new Error("'POSTS' はKVバインディングではありません（環境変数ではなくKVとして設定してください）");
  }
  return kv;
}

function getClientIp(req) {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

async function checkRateLimit(kv, ip) {
  // ゆるいレート制限: 同一IPからの連投を抑制
  const key = `rl:contact:${ip}`;
  const now = Date.now();
  const windowMs = 60_000; // 1分
  const max = 3; // 1分に3回まで

  let state = { ts: now, count: 0 };
  const raw = await kv.get(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.ts === "number" && typeof parsed?.count === "number") {
        state = parsed;
      }
    } catch {}
  }

  if (now - state.ts > windowMs) {
    state = { ts: now, count: 0 };
  }

  state.count += 1;

  // 保存（少し長めのTTLで自然消滅）
  await kv.put(key, JSON.stringify(state), { expirationTtl: 90 });

  if (state.count > max) {
    return { ok: false, retryAfterSec: 60 };
  }
  return { ok: true };
}

async function verifyTurnstile(secret, token, ip) {
  // Cloudflare Turnstile siteverify
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip && ip !== "unknown") form.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const json = await res.json().catch(() => ({}));
  return Boolean(json?.success);
}

function randomId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0].toString(16) + a[1].toString(16)).slice(0, 12);
}

async function getIndex(kv) {
  const raw = await kv.get("inbox:index");
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function setIndex(kv, index) {
  await kv.put("inbox:index", JSON.stringify(index));
}

export async function onRequest(context) {
  try {
    if (context.request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const kv = getKvOrThrow(context.env);

    const ip = getClientIp(context.request);
    const rl = await checkRateLimit(kv, ip);
    if (!rl.ok) {
      return json(
        { error: "送信が多すぎます。少し時間をおいてください" },
        { status: 429, headers: { "retry-after": String(rl.retryAfterSec || 60) } }
      );
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return json({ error: "invalid json" }, { status: 400 });
    }

    // honeypot: botが埋めがちな隠し項目
    const website = String(body.website || "").trim();
    if (website) {
      // bot扱い：成功扱いで返して終了（スパムを溜めない）
      return json({ ok: true });
    }

    // Turnstile（必須）
    const tsSecret = String(context.env?.TURNSTILE_SECRET || "").trim();
    const tsToken = String(body.turnstile || "").trim();
    if (!tsSecret) {
      return json({ error: "Turnstile設定が未完了です（管理者側でsecretを設定してください）" }, { status: 503 });
    }
    if (!tsToken) {
      return json({ error: "認証が必要です" }, { status: 403 });
    }
    const okTs = await verifyTurnstile(tsSecret, tsToken, ip);
    if (!okTs) {
      return json({ error: "認証に失敗しました（再度お試しください）" }, { status: 403 });
    }

    const name = String(body.name || "").trim().slice(0, 80);
    const reply = String(body.reply || "").trim().slice(0, 200);
    const text = String(body.body || "");

    if (!text.trim()) return json({ error: "body is required" }, { status: 400 });
    if (text.length > 8000) return json({ error: "body too long" }, { status: 400 });

    const createdAt = new Date().toISOString();
    const id = `${createdAt.slice(0, 10)}-${randomId()}`;

    const msg = {
      id,
      createdAt,
      name,
      reply,
      body: text
    };

    await kv.put(`inbox:${id}`, JSON.stringify(msg));

    // index（最新を先頭）
    const index = await getIndex(kv);
    const next = [
      { id, createdAt, name, reply },
      ...index.filter(x => x?.id !== id)
    ].slice(0, 2000);
    await setIndex(kv, next);

    return json({ ok: true, id });
  } catch (e) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }
}
