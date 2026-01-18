function xmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/xml; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(body, { ...init, headers });
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

function toW3CDateTime(isoOrDate) {
  if (!isoOrDate) return "";
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}T/.test(isoOrDate)) return isoOrDate;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return `${isoOrDate}T00:00:00Z`;
  try {
    const d = new Date(isoOrDate);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return "";
}

function escXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function onRequest(context) {
  try {
    if (context.request.method !== "GET") {
      return xmlResponse("", { status: 405 });
    }

    const kv = getKvOrThrow(context.env);
    const reqUrl = new URL(context.request.url);
    const origin = reqUrl.origin;

    const index = await getIndex(kv);

    // トップや /about の lastmod は「最新記事の更新日時」を採用（無い場合は現在）
    const newest = index.find(Boolean);
    const topLastmod = toW3CDateTime(newest?.updatedAt || newest?.createdAt || new Date().toISOString());

    const urls = [];
    urls.push({ loc: `${origin}/`, lastmod: topLastmod });
    urls.push({ loc: `${origin}/about`, lastmod: topLastmod });

    for (const p of index) {
      if (!p?.id) continue;
      const lastmod = toW3CDateTime(p?.updatedAt || p?.createdAt || p?.date);
      const loc = `${origin}/post?id=${encodeURIComponent(p.id)}`;
      urls.push({ loc, lastmod });
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map(u => {
        const lm = u.lastmod ? `<lastmod>${escXml(u.lastmod)}</lastmod>` : "";
        return `  <url><loc>${escXml(u.loc)}</loc>${lm}</url>`;
      }),
      "</urlset>"
    ].join("\n");

    return xmlResponse(xml);
  } catch (e) {
    // 失敗してもXMLとして返す（Search Consoleにエラーが見えるように）
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
