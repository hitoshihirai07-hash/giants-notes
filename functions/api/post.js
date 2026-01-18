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

async function submitIndexNow({ origin, host, key, keyLocation, urlList }) {
  // IndexNow（失敗しても投稿は成功させる）
  const endpoint = "https://api.indexnow.org/indexnow";
  const payload = {
    host,
    key,
    keyLocation,
    urlList
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  });

  // 200: OK / 202: Accepted（key validation pending）
  if (res.status === 200 || res.status === 202) {
    return { ok: true, status: res.status };
  }
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, body: text.slice(0, 200) };
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

function getKvOrThrow(env) {
  const kv = env?.POSTS;
  if (!kv) throw new Error("KV binding 'POSTS' が設定されていません（Pages > Settings > Functions > KV namespace bindings で追加）");
  if (typeof kv.get !== "function" || typeof kv.put !== "function") {
    throw new Error("'POSTS' はKVバインディングではありません。環境変数ではなく KV namespace binding として設定してください");
  }
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

    // IndexNow: 投稿したページ＋トップ＋サイトマップを通知
    let urlList = [];
    let indexNow = { ok: false, skipped: true };
    try {
      const key = String(context.env?.INDEXNOW_KEY || "").trim();
      if (key) {
        const origin = url.origin;
        const host = url.host;
        const keyLocation = `${origin}/${key}.txt`;
        const postUrl = `${origin}/post?id=${encodeURIComponent(id)}`;
        urlList = [postUrl, `${origin}/`, `${origin}/sitemap.xml`];

        const r = await submitIndexNow({ origin, host, key, keyLocation, urlList });
        indexNow = { ...r, skipped: false };
      }
    } catch (e) {
      indexNow = { ok: false, skipped: false, error: String(e?.message || e) };
    }

    // IndexNow log（管理画面で確認できるように保存）
    await appendIndexNowLog(kv, {
      ts: now,
      postId: id,
      ok: !!indexNow?.ok,
      skipped: !!indexNow?.skipped,
      status: indexNow?.status ?? null,
      error: indexNow?.error ?? null,
      body: indexNow?.body ?? null,
      urls: Array.isArray(urlList) ? urlList : []
    });

    return json({ ok: true, id, url: `/post?id=${encodeURIComponent(id)}`, indexNow });

  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
