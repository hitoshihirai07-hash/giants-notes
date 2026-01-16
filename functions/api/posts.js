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

export async function onRequest(context) {
  const kv = context.env.POSTS;
  if (!kv) return json({ error: "KV binding 'POSTS' が設定されていません" }, { status: 500 });

  if (context.request.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const posts = await getIndex(kv);
  return json({ posts });
}
