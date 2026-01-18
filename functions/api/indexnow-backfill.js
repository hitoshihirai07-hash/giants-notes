function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function getAuthToken(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  const alt = req.headers.get("x-admin-token");
  if (alt) return alt.trim();
  return "";
}

function getKvOrThrow(env) {
  const kv = env?.POSTS;
  if (!kv) {
    throw new Error("KV binding 'POSTS' が設定されていません");
  }
  if (typeof kv.get !== "function" || typeof kv.put !== "function") {
    throw new Error("'POSTS' はKVバインディングではありません");
  }
  return kv;
}

async function getIndex(kv) {
  const raw = await kv.get("posts:index");
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function appendIndexNowLog(kv, entry) {
  try {
    const key = "indexnow:log";
    const raw = await kv.get(key);
    let arr = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {}
    }
    arr.unshift(entry);
    if (arr.length > 100) arr = arr.slice(0, 100);
    await kv.put(key, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

async function submitIndexNow({ host, key, keyLocation, urlList }) {
  const endpoint = "https://api.indexnow.org/indexnow";
  const payload = { host, key, keyLocation, urlList };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  });

  if (res.status === 200 || res.status === 202) {
    return { ok: true, status: res.status };
  }
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, body: text.slice(0, 200) };
}

export async function onRequest(context) {
  let kv;
  try {
    kv = getKvOrThrow(context.env);
  } catch (e) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }

  const req = context.request;
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const token = getAuthToken(req);
  const expected = context.env.ADMIN_TOKEN || "";
  if (!expected) return json({ error: "ADMIN_TOKEN が設定されていません" }, { status: 500 });
  if (!token || token !== expected) return json({ error: "unauthorized" }, { status: 401 });

  const key = String(context.env?.INDEXNOW_KEY || "").trim();
  if (!key) {
    return json({ ok: false, skipped: true, reason: "INDEXNOW_KEY が未設定です" });
  }

  const url = new URL(req.url);
  const origin = url.origin;
  const host = url.host;

  const force = url.searchParams.get("force") === "1";
  const doneFlagKey = "indexnow:backfill_done";

  if (!force) {
    const done = await kv.get(doneFlagKey);
    if (done === "1") {
      return json({ ok: true, skipped: true, reason: "backfill already done" });
    }
  }

  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") || 500)));

  // Collect URLs from current post index
  const index = await getIndex(kv);
  const ids = index.map(x => String(x?.id || "").trim()).filter(Boolean);

  const postUrls = ids.slice(0, limit).map(id => `${origin}/post?id=${encodeURIComponent(id)}`);
  const urlList = [...postUrls, `${origin}/`, `${origin}/sitemap.xml`];

  const keyLocation = `${origin}/${key}.txt`;
  const now = new Date().toISOString();

  let result;
  try {
    result = await submitIndexNow({ host, key, keyLocation, urlList });
  } catch (e) {
    result = { ok: false, status: null, body: null, error: String(e?.message || e) };
  }

  await appendIndexNowLog(kv, {
    ts: now,
    postId: "*backfill*",
    ok: !!result?.ok,
    skipped: false,
    status: result?.status ?? null,
    error: result?.error ?? null,
    body: result?.body ?? null,
    urls: urlList.slice(0, 200) // UIに出すのは上限
  });

  if (result?.ok) {
    await kv.put(doneFlagKey, "1");
  }

  return json({
    ok: !!result?.ok,
    status: result?.status ?? null,
    keyLocation,
    sent: urlList.length,
    note: result?.ok ? "accepted" : "rejected",
    body: result?.body ?? null,
    error: result?.error ?? null
  });
}
