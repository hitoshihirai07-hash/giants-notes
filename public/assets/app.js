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

      document.title = `${p.title} | 読売ジャイアンツ 良かったところメモ`;
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
