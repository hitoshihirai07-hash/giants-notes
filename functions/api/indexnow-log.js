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
  const kv = env?.GIANTS_KV || env?.KV || env?.DB;
  if (!kv) throw new Error("KV バインドが見つかりません（GIANTS_KV を設定してください）");
  return kv;
}

export async function onRequest(context) {
  let kv;
  try {
    kv = getKvOrThrow(context.env);
  } catch (e) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }

  const req = context.request;
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const token = getAuthToken(req);
  const expected = context.env.ADMIN_TOKEN || "";
  if (!expected) return json({ error: "ADMIN_TOKEN が設定されていません" }, { status: 500 });
  if (!token || token !== expected) return json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));

  const raw = await kv.get("indexnow:log");
  let arr = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {}
  }

  return json({ logs: arr.slice(0, limit) });
}
