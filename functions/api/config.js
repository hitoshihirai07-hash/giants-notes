function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

// 公開して問題ない設定のみ返す（sitekeyは公開OK）
export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const sitekey = String(context.env?.TURNSTILE_SITEKEY || "").trim();
  return json({ turnstileSiteKey: sitekey });
}
