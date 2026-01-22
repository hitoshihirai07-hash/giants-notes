function htmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=60");
  return new Response(body, { ...init, headers });
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getKvOrThrow(env) {
  const kv = env?.POSTS;
  if (!kv) throw new Error("KV binding 'POSTS' が設定されていません");
  if (typeof kv.get !== "function" || typeof kv.put !== "function") {
    throw new Error("'POSTS' はKVバインディングではありません（環境変数ではなくKVとして設定してください）");
  }
  return kv;
}

function toDescription(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "読売ジャイアンツの良かった場面を記録する個人メモサイト。";
  return t.length > 120 ? t.slice(0, 120) + "…" : t;
}

function renderTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return "";
  return tags.slice(0, 12).map(t => `<span class="tag">${esc(t)}</span>`).join(" ");
}

function renderBody(text) {
  // 1行＝1段落として扱う（空行で段落区切り）
  const lines = String(text || "").split(/\r?\n/);
  const paras = [];
  let buf = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (buf.length) {
        paras.push(buf.join("\n"));
        buf = [];
      }
      continue;
    }
    buf.push(line);
  }
  if (buf.length) paras.push(buf.join("\n"));

  if (!paras.length) return `<p>（本文がありません）</p>`;

  return paras.map(p => {
    const safe = esc(p).replace(/\n/g, "<br>");
    return `<p>${safe}</p>`;
  }).join("\n");
}

export async function onRequest(context) {
  try {
    if (context.request.method !== "GET") return htmlResponse("", { status: 405 });

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return htmlResponse("id is required", { status: 400 });

    const kv = getKvOrThrow(context.env);
    const raw = await kv.get(`post:${id}`);
    if (!raw) {
      const body404 = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>メモが見つかりません</title>
<link rel="stylesheet" href="/assets/style.css">
<body>
  <div class="wrap">
    <h1>メモが見つかりません</h1>
    <div class="card"><div class="sub">URLが間違っているか、削除された可能性があります。</div></div>
    <p><a class="btn" href="/">メモ一覧へ戻る</a></p>
  </div>
</body></html>`;
      return htmlResponse(body404, { status: 404 });
    }

    let post;
    try { post = JSON.parse(raw); } catch { post = null; }
    if (!post) return htmlResponse("broken post data", { status: 500 });

    const title = post.title || "メモ";
    const date = post.date || "";
    const info = post.info || "";
    const desc = toDescription(post.body);

    const infoHtml = info ? `<div class="sub">${esc(info)}</div>` : "";
    const tagsHtml = renderTags(post.tags);

    const htmlBody = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)} | 読売ジャイアンツ 良かったところメモ</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="theme-color" content="#f7f7f7" />
  <link rel="stylesheet" href="/assets/style.css" />
</head>
<body>
  <header class="wrap">
    <div class="nav">
      <div>
        <h1>${esc(title)}</h1>
        <div class="meta"><span>${esc(date)}</span></div>
        ${infoHtml}
        <div class="meta">${tagsHtml}</div>
      </div>
      <div class="nav-links">
        <a class="btn" href="/">メモ一覧</a>
        <a class="btn" href="/stats">成績・試合結果</a>
      </div>
    </div>
  </header>

  <main class="wrap">
    <article class="card article">
      ${renderBody(post.body)}
    </article>
    <a class="back" href="/">← メモ一覧へ戻る</a>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ</small>
  </footer>
</body>
</html>`;

    return htmlResponse(htmlBody);
  } catch (e) {
    const msg = esc(String(e?.message || e));
    const body = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>エラー</title><link rel="stylesheet" href="/assets/style.css">
<body class="wrap"><h1>表示に失敗しました</h1><div class="card"><div class="sub">${msg}</div></div><p><a class="btn" href="/">メモ一覧へ</a></p></body></html>`;
    return htmlResponse(body, { status: 500 });
  }
}
