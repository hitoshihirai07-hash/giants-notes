function xmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/xml; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(body, { ...init, headers });
}

function escXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toW3CDate(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return `${yyyyMmDd}T00:00:00Z`;
  return "";
}

async function loadStaticPosts(origin) {
  try {
    const res = await fetch(`${origin}/posts/posts.json?ts=${Date.now()}`, {
      headers: { "cache-control": "no-store" }
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  try {
    if (context.request.method !== "GET") {
      return xmlResponse("", { status: 405 });
    }

    const reqUrl = new URL(context.request.url);
    const origin = reqUrl.origin;

    const posts = await loadStaticPosts(origin);
    const newest = posts[0];
    const newestDate = String(newest?.datetime || "").slice(0, 10);
    const topLastmod = toW3CDate(newestDate) || new Date().toISOString();

    const urls = [];
    urls.push({ loc: `${origin}/`, lastmod: topLastmod });
    urls.push({ loc: `${origin}/posts/`, lastmod: topLastmod });
    urls.push({ loc: `${origin}/stats`, lastmod: topLastmod });
    urls.push({ loc: `${origin}/about`, lastmod: topLastmod });

    for (const p of posts) {
      const slug = String(p?.slug || "").trim();
      if (!slug) continue;
      const d = String(p?.datetime || "").slice(0, 10);
      const lastmod = toW3CDate(d) || "";
      urls.push({ loc: `${origin}/posts/${encodeURIComponent(slug)}`, lastmod });
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((u) => {
        const lm = u.lastmod ? `<lastmod>${escXml(u.lastmod)}</lastmod>` : "";
        return `  <url><loc>${escXml(u.loc)}</loc>${lm}</url>`;
      }),
      "</urlset>"
    ].join("\n");

    return xmlResponse(xml);
  } catch (e) {
    const msg = escXml(String(e?.message || e));
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      `  <!-- error: ${msg} -->`,
      "</urlset>"
    ].join("\n");
    return xmlResponse(xml, { status: 500 });
  }
}
