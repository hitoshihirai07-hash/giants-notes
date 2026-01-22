(() => {
  const $ = (id) => document.getElementById(id);

  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const uniq = (arr) => Array.from(new Set(arr));

  let raw = [];
  let activeTag = "";

  function readParams() {
    try {
      const sp = new URLSearchParams(location.search);
      const qv = (sp.get("q") || "").trim();
      const tv = (sp.get("tag") || "").trim();
      const qEl = document.getElementById("q");
      if (qv && qEl) qEl.value = qv;
      if (tv) activeTag = tv;
    } catch {}
  }

  function parsePosts(json) {
    if (!Array.isArray(json)) return [];
    return json
      .filter(p => p && p.slug)
      .map(p => ({
        slug: String(p.slug),
        title: String(p.title || ""),
        datetime: String(p.datetime || p.date || ""),
        info: String(p.info || ""),
        excerpt: String(p.excerpt || ""),
        tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
        hidden: !!p.hidden
      }))
      .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
  }

  function getAllTags(posts) {
    return uniq(posts.flatMap(p => p.tags)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
  }

  function renderTags(allTags) {
    const el = $("tags");
    if (!el) return;
    if (!allTags.length) {
      el.innerHTML = "";
      return;
    }
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

  function matchQuery(p, q) {
    if (!q) return true;
    const s = (p.title + " " + p.excerpt + " " + p.tags.join(" ")).toLowerCase();
    return s.includes(q.toLowerCase());
  }

  function renderList(posts) {
    const list = $("list");
    const state = $("state");
    if (!list || !state) return;

    if (!posts.length) {
      state.textContent = "まだありません";
      list.innerHTML = "";
      return;
    }
    state.textContent = "";

    list.innerHTML = posts.map(p => {
      const meta = [
        p.datetime ? `<span>${esc(p.datetime)}</span>` : "",
        p.info ? `<span>・ ${esc(p.info)}</span>` : "",
        ...p.tags.map(t => `<span class="tag">${esc(t)}</span>`)
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
    const filtered = raw.filter(p => (activeTag ? p.tags.includes(activeTag) : true)).filter(p => matchQuery(p, q));
    renderTags(getAllTags(raw));
    renderList(filtered);
  }

  async function init() {
    const state = $("state");
    readParams();
    try {
      const res = await fetch("/posts/posts.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      raw = parsePosts(json).filter(p => !p.hidden);
      if (state) state.textContent = "";
    } catch (e) {
      raw = [];
      if (state) state.textContent = "一覧を読み込めませんでした。";
      console.error(e);
    }

    $("q")?.addEventListener("input", render);
    render();
  }

  init();
})();
