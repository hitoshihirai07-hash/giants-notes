function htmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/html; charset=utf-8");
  // キャッシュは好みで。記事が頻繁に変わるので短め。
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

function uniqTags(index) {
  const s = new Set();
  for (const p of index) {
    for (const t of (p?.tags || [])) {
      const v = String(t || "").trim();
      if (v) s.add(v);
    }
  }
  return Array.from(s).slice(0, 200);
}

function renderTagOptions(tags) {
  return ['<option value="">タグ：全部</option>', ...tags.map(t => `<option value="${esc(t)}">${esc(t)}</option>`)].join("");
}

function renderCards(index, limit = 50) {
  const items = index.slice(0, limit);
  if (!items.length) {
    return `<div class="card"><div class="sub">まだメモがありません。</div></div>`;
  }
  return items.map(p => {
    const id = p?.id || "";
    const title = p?.title || "";
    const date = p?.date || "";
    const info = p?.info || "";
    const tags = Array.isArray(p?.tags) ? p.tags : [];
    const tagHtml = tags.slice(0, 6).map(t => `<span class="tag">${esc(t)}</span>`).join(" ");
    const infoHtml = info ? ` <span>・</span><span>${esc(info)}</span>` : "";
    return `
      <div class="card">
        <a href="/post?id=${encodeURIComponent(id)}">
          <div class="h2">${esc(title)}</div>
        </a>
        <div class="meta"><span>${esc(date)}</span>${infoHtml}</div>
        <div class="meta">${tagHtml}</div>
      </div>
    `;
  }).join("");
}

export async function onRequest(context) {
  try {
    if (context.request.method !== "GET") return htmlResponse("", { status: 405 });

    const kv = getKvOrThrow(context.env);
    const index = await getIndex(kv);

    const tags = uniqTags(index);

    const body = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>読売ジャイアンツ 良かったところメモ</title>
  <meta name="description" content="読売ジャイアンツの良かった場面を記録する個人メモサイト。" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="theme-color" content="#f7f7f7" />
  <link rel="stylesheet" href="/assets/style.css" />
</head>
<body>
  <header class="wrap">
    <div class="nav">
      <div>
        <h1>読売ジャイアンツ 良かったところメモ</h1>
      </div>
      <div class="nav-links">
        <a class="btn" href="/stats">成績・試合結果</a>
        <a class="btn" href="/about">このサイトについて</a>
      </div>
    </div>

    <p class="sub">良かった場面だけを残す個人メモです。</p>

    <div class="controls">
      <input id="q" class="input full" placeholder="検索（タイトル/本文/タグ）" autocomplete="off" />
      <select id="tag" class="input">${renderTagOptions(tags)}</select>
    </div>
  </header>

  <main class="wrap">
    <div id="state" class="state" hidden></div>
    <div id="list" class="list">${renderCards(index, 60)}</div>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ ・ <a href="/about">このサイトについて</a></small>
  </footer>

  <script src="/assets/app.js" defer></script>
</body>
</html>`;

    return htmlResponse(body);
  } catch (e) {
    const msg = esc(String(e?.message || e));
    const body = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>読売ジャイアンツ 良かったところメモ</title>
<link rel="stylesheet" href="/assets/style.css">
<body class="wrap">
<h1>読売ジャイアンツ 良かったところメモ</h1>
<div class="card"><div class="sub">表示に失敗しました：${msg}</div></div>
<p><a class="back" href="/about">このサイトについて</a></p>
</body></html>`;
    return htmlResponse(body, { status: 500 });
  }
}
