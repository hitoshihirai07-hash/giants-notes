function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
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

function getKvOrThrow(env) {
  const kv = env?.POSTS;
  // If the user mistakenly set POSTS as a plain environment variable (string),
  // kv.get will not exist and the function will crash. Detect that case and
  // return a clear JSON error instead.
  if (!kv) throw new Error("KV binding 'POSTS' が設定されていません（Pages > Settings > Functions > KV namespace bindings で追加）");
  if (typeof kv.get !== "function" || typeof kv.put !== "function") {
    throw new Error("'POSTS' はKVバインディングではありません。環境変数ではなく KV namespace binding として設定してください");
  }
  return kv;
}

export async function onRequest(context) {
  try {
    const kv = getKvOrThrow(context.env);

    if (context.request.method !== "GET") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const posts = await getIndex(kv);
    return json({ posts });
  } catch (e) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }
}
