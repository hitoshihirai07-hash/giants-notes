// SSR: /posts/ を HTML で返す（JSが動かない環境でも「読み込み中…」で止まらない）

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function normalizePost(p) {
  const tags = Array.isArray(p?.tags) ? p.tags.map(String).filter(Boolean) : [];
  return {
    slug: String(p?.slug || ""),
    title: String(p?.title || ""),
    datetime: String(p?.datetime || p?.date || ""),
    info: String(p?.info || ""),
    excerpt: String(p?.excerpt || ""),
    tags,
    hidden: !!p?.hidden
  };
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function renderCards(posts) {
  if (!posts.length) {
    return `<div class="card"><div class="sub">まだありません</div></div>`;
  }
  return posts.map((p) => {
    const meta = [
      p.datetime ? `<span>${esc(p.datetime)}</span>` : "",
      p.info ? `<span>・ ${esc(p.info)}</span>` : "",
      ...p.tags.map((t) => `<span class="tag">${esc(t)}</span>`)
    ].filter(Boolean).join("");
    return `
      <div class="card">
        <a href="/posts/${encodeURIComponent(p.slug)}"><strong>${esc(p.title || "(無題)")}</strong></a>
        <div class="meta">${meta}</div>
        ${p.excerpt ? `<p class="sub" style="margin-top:10px;">${esc(p.excerpt)}</p>` : ""}
      </div>
    `;
  }).join("");
}

function renderTagButtons(tags) {
  if (!tags.length) return "";
  const btns = [
    `<button class="btn primary" data-tag="">すべて</button>`,
    ...tags.map((t) => `<button class="btn" data-tag="${esc(t)}">${esc(t)}</button>`)
  ];
  return btns.join("");
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;

  let posts = [];
  try {
    const u = new URL("/posts/posts.json", request.url);
    const res = env?.ASSETS?.fetch
      ? await env.ASSETS.fetch(u)
      : await fetch(u.toString(), { cache: "no-store" });

    if (!res.ok) throw new Error(`posts.json HTTP ${res.status}`);
    const json = await res.json();
    posts = (Array.isArray(json) ? json : []).map(normalizePost)
      .filter((p) => p.slug && !p.hidden)
      .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
  } catch (e) {
    // 失敗しても「読み込み中…」ではなく、理由が分かるHTMLを返す
    const msg = esc(String(e?.message || e));
    const body = `<!doctype html><html lang="ja"><head><meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>メモ一覧 | 読売ジャイアンツ 良かったところメモ</title>
      <link rel="stylesheet" href="/assets/style.css" />
    </head><body>
      <header class="wrap"><a class="back" href="/">← トップへ</a><h1>メモ一覧</h1></header>
      <main class="wrap"><div class="card"><div class="sub">一覧を読み込めませんでした：${msg}</div></div></main>
    </body></html>`;
    return new Response(body, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  const tags = uniq(posts.flatMap((p) => p.tags)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
  const dataJson = JSON.stringify(posts).replace(/</g, "\\u003c");

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
        <p id="state" class="sub">全${posts.length}件</p>
      </div>
      <nav class="nav">
        <a href="/stats">成績・試合結果</a>
        <a href="/about">このサイトについて</a>
        <a href="/contact">お問い合わせ</a>
      </nav>
    </div>

    <div class="controls">
      <input id="q" class="input full" placeholder="検索（タイトル・タグ・本文抜粋）" />
      <div id="tags" class="row" style="gap:8px;">${renderTagButtons(tags)}</div>
    </div>
  </header>

  <main class="wrap">
    <div id="list" class="list">${renderCards(posts)}</div>
    <noscript><p class="hint">※検索やタグの絞り込みは JavaScript が必要です。</p></noscript>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ</small>
  </footer>

  <script id="posts-data" type="application/json">${dataJson}</script>
  <script>
  (() => {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

    let raw = [];
    try {
      raw = JSON.parse($("posts-data")?.textContent || "[]");
      if (!Array.isArray(raw)) raw = [];
    } catch { raw = []; }

    let activeTag = "";

    function getAllTags(posts) {
      return Array.from(new Set(posts.flatMap(p => Array.isArray(p.tags) ? p.tags : [])))
        .filter(Boolean)
        .sort((a,b) => String(a).localeCompare(String(b), "ja"));
    }

    function matchQuery(p, q) {
      if (!q) return true;
      const s = ((p.title||"") + " " + (p.excerpt||"") + " " + ((p.tags||[]).join(" "))).toLowerCase();
      return s.includes(q.toLowerCase());
    }

    function renderTags(allTags) {
      const el = $("tags");
      if (!el) return;
      if (!allTags.length) { el.innerHTML = ""; return; }
      const buttons = [
        `<button class="btn ${activeTag === "" ? "primary" : ""}" data-tag="">すべて</button>`,
        ...allTags.map(t => `<button class="btn ${activeTag === t ? "primary" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`)
      ];
      el.innerHTML = buttons.join("");
      el.querySelectorAll("button[data-tag]").forEach(b => {
        b.addEventListener("click", () => {
          activeTag = b.getAttribute("data-tag") || "";
          render();
        });
      });
    }

    function renderList(posts) {
      const list = $("list");
      const state = $("state");
      if (!list || !state) return;
      if (!posts.length) {
        state.textContent = "該当なし";
        list.innerHTML = `<div class="card"><div class="sub">該当するメモがありません</div></div>`;
        return;
      }
      state.textContent = `表示 ${posts.length} / 全 ${raw.length} 件`;
      list.innerHTML = posts.map(p => {
        const meta = [
          p.datetime ? `<span>${esc(p.datetime)}</span>` : "",
          p.info ? `<span>・ ${esc(p.info)}</span>` : "",
          ...(Array.isArray(p.tags) ? p.tags : []).map(t => `<span class="tag">${esc(t)}</span>`)
        ].filter(Boolean).join("");
        return `
          <div class="card">
            <a href="/posts/${encodeURIComponent(p.slug)}"><strong>${esc(p.title || "(無題)")}</strong></a>
            <div class="meta">${meta}</div>
            ${p.excerpt ? `<p class="sub" style="margin-top:10px;">${esc(p.excerpt)}</p>` : ""}
          </div>
        `;
      }).join("");
    }

    function render() {
      const q = $("q")?.value?.trim() || "";
      const filtered = raw
        .filter(p => activeTag ? (Array.isArray(p.tags) && p.tags.includes(activeTag)) : true)
        .filter(p => matchQuery(p, q));
      renderTags(getAllTags(raw));
      renderList(filtered);
    }

    $("q")?.addEventListener("input", render);
    render();
  })();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    }
  });
}

export const onRequest = onRequestGet;
