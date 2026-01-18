function textResponse(text, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(text, { ...init, headers });
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return textResponse("", { status: 405 });
  }

  const key = String(context.env?.INDEXNOW_KEY || "").trim();
  if (!key) {
    // Key が未設定の場合は 404（検証に失敗するので気づける）
    return textResponse("INDEXNOW_KEY が未設定です", { status: 404 });
  }

  return textResponse(key);
}
