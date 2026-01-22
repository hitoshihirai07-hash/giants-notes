function htmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/html; charset=utf-8");
  // 一覧は頻繁に変えない想定。更新時は posts.json を上げ直す運用なので短めにキャッシュ。
  headers.set("cache-control", "public, max-age=300");
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

function renderCards(posts) {
  return posts
    .map((p) => {
      const metaParts = [];
      if (p.datetime) metaParts.push(`<span>${esc(p.datetime)}</span>`);
      if (p.info) metaParts.push(`<span>・ ${esc(p.info)}</span>`);
      if (Array.isArray(p.tags)) {
        for (const t of p.tags) metaParts.push(`<span class="tag">${esc(t)}</span>`);
      }

      const meta = metaParts.join("");
      const excerpt = p.excerpt ? `<p class="sub" style="margin-top:10px;">${esc(p.excerpt)}</p>` : "";
      const slug = encodeURIComponent(p.slug);
      const title = esc(p.title || "(無題)");
      return `
        <div class="card">
          <a href="/posts/${slug}"><strong>${title}</strong></a>
          <div class="meta">${meta}</div>
          ${excerpt}
        </div>
      `;
    })
    .join("");
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

export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    // ベースは静的な /posts/ (public/posts/index.html)
    const baseRes = await env.ASSETS.fetch(new Request(new URL("/posts/", request.url)));
    const baseHtml = await baseRes.text();

    // posts.json から一覧を生成（/posts/index.html を更新しなくても反映される）
    let posts = [];
    try {
      const jsonRes = await env.ASSETS.fetch(new Request(new URL("/posts/posts.json", request.url)));
      if (jsonRes.ok) {
        const json = await jsonRes.json().catch(() => null);
        posts = normalizePosts(json);
      }
    } catch {
      // 無視
    }

    const listHtml = posts.length ? renderCards(posts) : "";
    const stateText = posts.length ? "" : "まだありません";

    // list 部分を差し替え
    let out = baseHtml;
    out = out.replace(
      /<div class="list" id="list">[\s\S]*?<\/div>\s*(<noscript>)/,
      `<div class="list" id="list">\n${listHtml}\n</div>\n$1`
    );

    // state を差し替え
    out = out.replace(
      /<p class="state" id="state">[\s\S]*?<\/p>/,
      `<p class="state" id="state">${esc(stateText)}</p>`
    );

    return htmlResponse(out);
  } catch (e) {
    return htmlResponse("<h1>エラー</h1>", { status: 500 });
  }
}
