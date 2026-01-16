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
