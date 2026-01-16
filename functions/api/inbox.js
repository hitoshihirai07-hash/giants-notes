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
  if (typeof kv.get !== "function" || typeof kv.put !== "function") {
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

export async function onRequest(context) {
  try {
    const req = context.request;
    if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

    const expected = context.env.ADMIN_TOKEN || "";
    if (!expected) return json({ error: "ADMIN_TOKEN が設定されていません" }, { status: 500 });
    const token = getAuthToken(req);
    if (!token || token !== expected) return json({ error: "unauthorized" }, { status: 401 });

    const kv = getKvOrThrow(context.env);
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50", 10) || 50));

    const index = await getIndex(kv);
    const ids = index.slice(0, limit).map(x => x?.id).filter(Boolean);
    const messages = [];

    for (const id of ids) {
      const raw = await kv.get(`inbox:${id}`);
      if (!raw) continue;
      try {
        const m = JSON.parse(raw);
        messages.push(m);
      } catch {}
    }

    // createdAt desc
    messages.sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
    return json({ messages });
  } catch (e) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }
}
