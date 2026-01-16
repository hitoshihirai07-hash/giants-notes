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
  if (!kv) throw new Error("KV binding 'POSTS' が設定されていません");
  if (typeof kv.get !== "function" || typeof kv.put !== "function" || typeof kv.delete !== "function") {
    throw new Error("'POSTS' はKVバインディングではありません（環境変数ではなくKVとして設定してください）");
  }
  return kv;
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
    const req = context.request;
    if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

    const expected = context.env.ADMIN_TOKEN || "";
    if (!expected) return json({ error: "ADMIN_TOKEN が設定されていません" }, { status: 500 });
    const token = getAuthToken(req);
    if (!token || token !== expected) return json({ error: "unauthorized" }, { status: 401 });

    const kv = getKvOrThrow(context.env);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid json" }, { status: 400 });
    }

    const id = String(body.id || "").trim();
    if (!id) return json({ error: "id is required" }, { status: 400 });

    await kv.delete(`inbox:${id}`);

    const index = await getIndex(kv);
    const next = index.filter(x => x?.id !== id);
    await setIndex(kv, next);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }
}
