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

function randomId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0].toString(16) + a[1].toString(16)).slice(0, 10);
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

async function setIndex(kv, index) {
  await kv.put("posts:index", JSON.stringify(index));
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map(t => String(t).trim()).filter(Boolean).slice(0, 20);
  }
  return String(tags || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function onRequest(context) {
  const kv = context.env.POSTS;
  if (!kv) return json({ error: "KV binding 'POSTS' が設定されていません" }, { status: 500 });

  const req = context.request;
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id is required" }, { status: 400 });
    const raw = await kv.get(`post:${id}`);
    if (!raw) return json({ error: "not found" }, { status: 404 });

    try {
      const post = JSON.parse(raw);
      return json({ post });
    } catch {
      return json({ error: "broken post data" }, { status: 500 });
    }
  }

  if (req.method === "POST") {
    const token = getAuthToken(req);
    const expected = context.env.ADMIN_TOKEN || "";
    if (!expected) return json({ error: "ADMIN_TOKEN が設定されていません" }, { status: 500 });
    if (!token || token !== expected) return json({ error: "unauthorized" }, { status: 401 });

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid json" }, { status: 400 });
    }

    const title = String(body.title || "").trim();
    const date = String(body.date || "").trim();
    const info = String(body.info || "").trim();
    const tags = normalizeTags(body.tags);
    const text = String(body.body || "");

    if (!title || !date || !text.trim()) {
      return json({ error: "title/date/body are required" }, { status: 400 });
    }

    // allow client-provided id for future edit feature, otherwise generate
    const id = String(body.id || "").trim() || `${date}-${randomId()}`;

    const now = new Date().toISOString();
    const post = {
      id,
      date,
      title,
      info,
      tags,
      body: text,
      updatedAt: now,
      createdAt: now
    };

    // if exists, keep createdAt
    const existing = await kv.get(`post:${id}`);
    if (existing) {
      try {
        const old = JSON.parse(existing);
        if (old?.createdAt) post.createdAt = old.createdAt;
      } catch {}
    }

    await kv.put(`post:${id}`, JSON.stringify(post));

    // update index (metadata only)
    const index = await getIndex(kv);
    const meta = { id, date, title, info, tags, updatedAt: now, createdAt: post.createdAt };

    const next = [meta, ...index.filter(x => x?.id !== id)].slice(0, 5000);
    await setIndex(kv, next);

    return json({ ok: true, id, url: `/post.html?id=${encodeURIComponent(id)}` });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
