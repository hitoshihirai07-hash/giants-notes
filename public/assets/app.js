const Util = (() => {
  const escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => escMap[c]);
  }
  function normalize(s) {
    return String(s ?? "").toLowerCase();
  }
  function qs(id) { return document.getElementById(id); }
  function splitTags(tags) {
    if (Array.isArray(tags)) return tags;
    return String(tags || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }
  function paragraphs(text) {
    return String(text || "")
      .split(/\n\s*\n/g)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return { esc, normalize, qs, splitTags, paragraphs };
})();

const SITE_NAME = "読売ジャイアンツ 良かった点メモ";

function ensureMetaName(name) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  return el;
}

function ensureMetaProperty(prop) {
  let el = document.querySelector(`meta[property="${prop}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", prop);
    document.head.appendChild(el);
  }
  return el;
}

function setJsonLd(id, obj) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(obj);
}

function toIsoDate(dateStr) {
  const s = String(dateStr || "").trim();
  // 期待: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

function shortDescFromBody(body) {
  const ps = Util.paragraphs(body);
  const first = ps[0] || "";
  // だいたい検索結果向けの長さ
  const trimmed = first.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 140) return trimmed;
  return trimmed.slice(0, 140).trimEnd() + "…";
}

async function apiGet(url) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

const PublicApp = (() => {
  async function renderIndex() {
    const stateEl = Util.qs("state");
    const listEl = Util.qs("list");
    const qEl = Util.qs("q");
    const tagEl = Util.qs("tag");

    // ページ側のHTMLを後から手でいじって
    // 検索欄・タグ欄を消しても落ちないようにする。
    const hasSearch = !!qEl;
    const hasTag = !!tagEl;

    try {
      const data = await apiGet("./api/posts");
      const posts = (Array.isArray(data.posts) ? data.posts : [])
        .slice()
        .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));

      // build tags (タグ欄がある時だけ)
      if (hasTag) {
        const tagSet = new Set();
        for (const p of posts) for (const t of (p.tags || [])) tagSet.add(t);
        [...tagSet].sort().forEach(t => {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          tagEl.appendChild(opt);
        });
      }

      function render() {
        const q = hasSearch ? Util.normalize(qEl.value) : "";
        const t = hasTag ? tagEl.value : "";

        const filtered = posts.filter(p => {
          const hay = Util.normalize([
            p.title,
            p.info,
            ...(p.tags || [])
          ].join(" "));
          const okQ = !q || hay.includes(q);
          const okT = !t || (p.tags || []).includes(t);
          return okQ && okT;
        });

        listEl.innerHTML = "";
        if (!filtered.length) {
          listEl.innerHTML = `<div class="card">該当なし</div>`;
          return;
        }

        for (const p of filtered) {
          const div = document.createElement("div");
          div.className = "card";
          div.innerHTML = `
            <a href="./post?id=${encodeURIComponent(p.id)}"><strong>${Util.esc(p.title)}</strong></a>
            <div class="meta">
              <span>${Util.esc(p.date || "")}</span>
              ${p.info ? `<span>・ ${Util.esc(p.info)}</span>` : ""}
              ${(p.tags || []).map(t => `<span class="tag">${Util.esc(t)}</span>`).join("")}
            </div>
          `;
          listEl.appendChild(div);
        }
      }

      if (hasSearch) qEl.addEventListener("input", render);
      if (hasTag) tagEl.addEventListener("change", render);

      stateEl.hidden = true;
      listEl.hidden = false;
      render();
    } catch (e) {
      stateEl.textContent = `読み込み失敗: ${e.message}`;
    }
  }

  async function renderPost() {
    const stateEl = Util.qs("state");
    const titleEl = Util.qs("title");
    const metaEl = Util.qs("meta");
    const bodyEl = Util.qs("body");

    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    if (!id) {
      stateEl.textContent = "記事IDがありません";
      titleEl.textContent = "記事IDがありません";
      return;
    }

    try {
      const data = await apiGet(`./api/post?id=${encodeURIComponent(id)}`);
      const p = data.post;
      if (!p) throw new Error("記事が見つかりません");

      // --- タイトル / メタ（検索結果・SNS向け） ---
      document.title = `${p.title} | ${SITE_NAME}`;
      const origin = location.origin;
      const pageUrl = (() => {
        try {
          const u = new URL(location.href);
          // /post.html -> /post へ寄せる（canonicalと揃える）
          u.pathname = u.pathname.replace(/\/post\.html$/, "/post");
          return u.toString();
        } catch {
          return location.href;
        }
      })();

      const desc = shortDescFromBody(p.body) || "読売ジャイアンツの良かった点を短く残すメモ。";

      // description
      ensureMetaName("description").setAttribute("content", desc);

      // Open Graph
      ensureMetaProperty("og:title").setAttribute("content", `${p.title} | ${SITE_NAME}`);
      ensureMetaProperty("og:description").setAttribute("content", desc);
      ensureMetaProperty("og:type").setAttribute("content", "article");
      ensureMetaProperty("og:site_name").setAttribute("content", SITE_NAME);
      ensureMetaProperty("og:image").setAttribute("content", `${origin}/android-chrome-512x512.png`);
      ensureMetaProperty("og:url").setAttribute("content", pageUrl);

      // Twitter（最低限）
      ensureMetaName("twitter:card").setAttribute("content", "summary");
      ensureMetaName("twitter:title").setAttribute("content", `${p.title} | ${SITE_NAME}`);
      ensureMetaName("twitter:description").setAttribute("content", desc);

      // --- 構造化データ（サイト名/パンくず/記事） ---
      const iso = toIsoDate(p.date);
      const graph = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "@id": `${origin}/#website`,
            "name": SITE_NAME,
            "url": `${origin}/`,
            "inLanguage": "ja-JP"
          },
          {
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "ホーム",
                "item": `${origin}/`
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": p.title,
                "item": pageUrl
              }
            ]
          },
          {
            "@type": "Article",
            "headline": p.title,
            "description": desc,
            "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
            "datePublished": iso || undefined,
            "dateModified": iso || undefined,
            "inLanguage": "ja-JP",
            "keywords": Array.isArray(p.tags) ? p.tags.join(", ") : "",
            "author": { "@type": "Person", "name": "管理者" },
            "publisher": {
              "@type": "Organization",
              "name": SITE_NAME,
              "logo": { "@type": "ImageObject", "url": `${origin}/android-chrome-512x512.png` }
            }
          }
        ]
      };
      // undefined を落とす
      graph["@graph"][2] = JSON.parse(JSON.stringify(graph["@graph"][2]));
      setJsonLd("ldjson-article", graph);
      titleEl.textContent = p.title;

      metaEl.innerHTML = `
        <span>${Util.esc(p.date || "")}</span>
        ${p.info ? `<span>・ ${Util.esc(p.info)}</span>` : ""}
        ${(p.tags || []).map(t => `<span class="tag">${Util.esc(t)}</span>`).join("")}
      `;

      const ps = Util.paragraphs(p.body);
      bodyEl.innerHTML = ps.map(x => `<p>${Util.esc(x)}</p>`).join("");

      stateEl.hidden = true;
      bodyEl.hidden = false;
    } catch (e) {
      stateEl.textContent = `読み込み失敗: ${e.message}`;
      titleEl.textContent = "読み込み失敗";
    }
  }

  return {
    init() {
      // Cloudflare Pages の「クリーンURL（.html省略）」で
      // /post.html が /post にリダイレクトされる場合がある。
      // そのときも個別記事として動くように両方対応。
      const p = location.pathname.replace(/\/+$/, "");
      const last = p.split("/").pop();
      if (last === "post" || last === "post.html") return renderPost();
      return renderIndex();
    }
  };
})();

PublicApp.init();
