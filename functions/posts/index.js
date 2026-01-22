function htmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(body, { ...init, headers });
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function norm(s) {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parsePosts(json) {
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
      hidden: !!p.hidden
    }))
    .filter((p) => !p.hidden)
    .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
}

function tagCounts(posts) {
  const m = new Map();
  for (const p of posts) {
    for (const t of p.tags) {
      const k = String(t || "").trim();
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "ja"));
}

function matches(p, q) {
  if (!q) return true;
  const s = norm([p.title, p.excerpt, ...(p.tags || [])].join(" "));
  return s.includes(q);
}

async function loadPosts(origin) {
  try {
    const res = await fetch(`${origin}/posts/posts.json?ts=${Date.now()}`, {
      headers: { "cache-control": "no-store" }
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return parsePosts(json);
  } catch {
    return [];
  }
}

function buildListHtml(posts) {
  if (!posts.length) {
    return '<p class="state">まだありません</p>';
  }

  return posts
    .map((p) => {
      const metaBits = [];
      if (p.datetime) metaBits.push(`<span>${esc(p.datetime)}</span>`);
      if (p.info) metaBits.push(`<span>・ ${esc(p.info)}</span>`);
      for (const t of p.tags) {
        const tt = String(t || "").trim();
        if (tt) metaBits.push(`<span class="tag">${esc(tt)}</span>`);
      }
      const meta = metaBits.join("");
      const excerpt = p.excerpt ? `<p class="sub" style="margin-top:10px;">${esc(p.excerpt)}</p>` : "";
      return `
        <div class="card">
          <a href="/posts/${encodeURIComponent(p.slug)}"><strong>${esc(p.title || "(無題)")}</strong></a>
          <div class="meta">${meta}</div>
          ${excerpt}
        </div>
      `;
    })
    .join("");
}

function buildTagsHtml(origin, tags, activeTag, q) {
  if (!tags.length) return "";

  const baseQ = q ? `&q=${encodeURIComponent(q)}` : "";
  const allCls = activeTag ? "btn" : "btn primary";
  const allHref = `/posts/?${q ? `q=${encodeURIComponent(q)}` : ""}`;

  const btns = [`<a class="${allCls}" href="${allHref}">すべて</a>`];

  for (const [t, count] of tags) {
    const cls = activeTag === t ? "btn primary" : "btn";
    const href = `/posts/?tag=${encodeURIComponent(t)}${baseQ}`;
    btns.push(`<a class="${cls}" href="${href}">${esc(t)}<span class="hint">（${count}）</span></a>`);
  }

  return `
    <div class="card" style="margin-top:10px;">
      <div class="meta" style="margin-bottom:8px;">タグ</div>
      <div class="row" style="flex-wrap:wrap; gap:8px;">${btns.join("")}</div>
    </div>
  `;
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return htmlResponse("", { status: 405 });
  }

  const reqUrl = new URL(context.request.url);
  const origin = reqUrl.origin;
  const qRaw = (reqUrl.searchParams.get("q") || "").trim();
  const q = norm(qRaw);
  const tag = (reqUrl.searchParams.get("tag") || "").trim();

  const all = await loadPosts(origin);
  const filtered = all
    .filter((p) => (tag ? (p.tags || []).includes(tag) : true))
    .filter((p) => matches(p, q));

  const tags = tagCounts(all);

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>メモ一覧 | 読売ジャイアンツ 良かったところメモ</title>
  <meta name="description" content="メモの一覧。キーワードやタグで絞り込みできます。" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="theme-color" content="#f7f7f7" />
  <link rel="stylesheet" href="/assets/style.css" />
  <script src="/assets/seo.js" defer></script>
  <script src="/assets/posts.js" defer></script>
</head>
<body>
  <header class="wrap">
    <div class="head">
      <h1>メモ一覧</h1>
      <nav class="nav">
        <a href="/">トップ</a>
        <a href="/stats">成績・試合結果</a>
        <a href="/about">このサイトについて</a>
      </nav>
    </div>

    <form class="controls" style="margin-top:10px;" method="get" action="/posts/">
      ${tag ? `<input type="hidden" name="tag" value="${esc(tag)}" />` : ""}
      <input id="q" name="q" class="input" placeholder="検索（タイトル・本文・タグ）" autocomplete="off" value="${esc(qRaw)}" />
      <button class="btn" type="submit">検索</button>
    </form>

    <div id="tags">${buildTagsHtml(origin, tags, tag, qRaw)}</div>
  </header>

  <main class="wrap">
    <p id="state" class="state"></p>
    <div id="list">${buildListHtml(filtered)}</div>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ ・ <a href="/about">このサイトについて</a> ・ <a href="/contact">お問い合わせ</a> ・ <a href="/policy">プライバシーポリシー</a> ・ <a href="/disclaimer">免責事項</a></small>
  </footer>
</body>
</html>`;

  return htmlResponse(html);
}
