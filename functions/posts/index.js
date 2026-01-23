// /posts/ をSSRで返す（JSが動かない環境でも「読み込み中」で止めない）
// 元データは public/posts/posts.json をそのまま利用する。

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function normalizePosts(json) {
  if (!Array.isArray(json)) return [];
  return json
    .filter((p) => p && p.slug)
    .map((p) => ({
      slug: String(p.slug),
      title: String(p.title || ""),
      datetime: String(p.datetime || p.date || ""),
      info: String(p.info || ""),
      excerpt: String(p.excerpt || ""),
      tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
      hidden: !!p.hidden,
    }))
    .filter((p) => !p.hidden)
    .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
}

function renderList(posts) {
  if (!posts.length) {
    return `<div class="card"><p class="muted">まだありません</p></div>`;
  }

  return posts.map((p) => {
    const meta = [
      p.datetime ? `<span>${esc(p.datetime)}</span>` : "",
      p.info ? `<span>・ ${esc(p.info)}</span>` : "",
      ...p.tags.map((t) => `<span class="tag">${esc(t)}</span>`),
    ].filter(Boolean).join("");

    const href = `/posts/${encodeURIComponent(p.slug)}`;
    const title = esc(p.title || "(無題)");
    const excerpt = p.excerpt ? `<p class="sub" style="margin-top:10px;">${esc(p.excerpt)}</p>` : "";

    return `
      <div class="card">
        <a href="${href}"><strong>${title}</strong></a>
        <div class="meta">${meta}</div>
        ${excerpt}
      </div>
    `;
  }).join("");
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const origin = url.origin;

  let posts = [];
  try {
    const res = await fetch(`${origin}/posts/posts.json?v=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      posts = normalizePosts(json);
    }
  } catch {
    posts = [];
  }

  const countText = posts.length ? `${posts.length}件` : "";
  const listHtml = renderList(posts);

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>メモ一覧 | 読売ジャイアンツ 良かったところメモ</title>
  <meta name="description" content="読売ジャイアンツのメモ一覧。検索やタグで過去ログを見返せます。" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${origin}/posts/" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="theme-color" content="#f7f7f7" />
  <link rel="stylesheet" href="/assets/style.css" />
  <script src="/assets/seo.js" defer></script>
</head>
<body>
  <header class="wrap">
    <a class="back" href="/">← トップへ</a>
    <div class="head">
      <div>
        <h1>メモ一覧</h1>
        <p id="state" class="sub">${esc(countText)}</p>
      </div>
      <nav class="nav">
        <a href="/stats">成績・試合結果</a>
        <a href="/about">このサイトについて</a>
        <a href="/contact">お問い合わせ</a>
      </nav>
    </div>

    <div class="controls">
      <input id="q" class="input full" placeholder="検索（タイトル・タグ・本文抜粋）" />
      <div id="tags" class="row" style="gap:8px;"></div>
    </div>
  </header>

  <main class="wrap">
    <div id="list" class="list">${listHtml}</div>
    <noscript><p class="hint">※検索やタグの絞り込みは JavaScript が必要です。</p></noscript>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ</small>
  </footer>

  <script src="/assets/posts.js" defer></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
