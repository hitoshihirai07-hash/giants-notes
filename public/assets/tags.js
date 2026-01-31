(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  const stateEl = $("#state");
  const tagQEl = $("#tagQ");
  const pickedEl = $("#picked");
  const tagListEl = $("#tagList");
  const postsWrapEl = $("#postsWrap");

  const params = new URLSearchParams(location.search);
  const picked = (params.get("tag") || "").trim();

  // 特殊タグ（タグなし）
  const NONE = "__none__";

  function normTag(t) {
    return String(t ?? "").trim();
  }

  function fmtCount(n) {
    return `${n}件`;
  }

  function toTagUrl(tag) {
    return `/tags/?tag=${encodeURIComponent(tag)}`;
  }

  function renderTagCard(tag, count) {
    const label = tag === NONE ? "タグなし" : tag;
    return `
      <div class="card">
        <a href="${toTagUrl(tag)}"><strong>${esc(label)}</strong></a>
        <div class="meta"><span>${esc(fmtCount(count))}</span></div>
      </div>
    `.trim();
  }

  function renderPostCard(p) {
    const slug = String(p?.slug || "").trim();
    const title = String(p?.title || "").trim() || slug;
    const dt = String(p?.datetime || "").trim();
    const excerpt = String(p?.excerpt || "").trim();
    const tags = Array.isArray(p?.tags) ? p.tags.map(normTag).filter(Boolean) : [];

    const tagHtml = tags.map((t) => `<a class="tag" href="${toTagUrl(t)}">${esc(t)}</a>`).join(" ");
    return `
      <div class="card">
        <a href="/posts/${encodeURIComponent(slug)}"><strong>${esc(title)}</strong></a>
        <div class="meta">
          ${dt ? `<span>${esc(dt)}</span>` : ""}
          ${tagHtml}
        </div>
        ${excerpt ? `<p class="sub" style="margin-top:10px;">${esc(excerpt)}</p>` : ""}
      </div>
    `.trim();
  }

  async function loadPosts() {
    const url = `/posts/posts.json?ts=${Date.now()}`;
    const res = await fetch(url, { headers: { "cache-control": "no-store" } });
    if (!res.ok) throw new Error("posts.json を読み込めませんでした");
    const json = await res.json().catch(() => null);
    return Array.isArray(json) ? json : [];
  }

  function buildTagMap(posts) {
    const map = new Map();
    let noneCount = 0;

    for (const p of posts) {
      if (!p || p.hidden) continue;
      const tagsRaw = Array.isArray(p.tags) ? p.tags.map(normTag).filter(Boolean) : [];
      const tags = Array.from(new Set(tagsRaw));
      if (!tags.length) {
        noneCount++;
        continue;
      }
      for (const t of tags) {
        map.set(t, (map.get(t) || 0) + 1);
      }
    }

    if (noneCount > 0) map.set(NONE, noneCount);
    return map;
  }

  function sortTags(map) {
    return Array.from(map.entries())
      .sort((a, b) => {
        // 件数 desc → 文字 asc（ただし NONE は最後）
        if (a[0] === NONE && b[0] !== NONE) return 1;
        if (b[0] === NONE && a[0] !== NONE) return -1;
        if (b[1] !== a[1]) return b[1] - a[1];
        return String(a[0]).localeCompare(String(b[0]), "ja");
      });
  }

  function filterTags(tagEntries, q) {
    const kw = String(q || "").trim();
    if (!kw) return tagEntries;
    return tagEntries.filter(([t]) => {
      if (t === NONE) return "タグなし".includes(kw);
      return String(t).includes(kw);
    });
  }

  function pickLabel(t) {
    return t === NONE ? "タグなし" : t;
  }

  function renderPickedBox(tag, count) {
    const label = pickLabel(tag);
    const clearUrl = "/tags/";
    pickedEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
        <div>
          <div class="meta" style="margin-top:0;"><span>選択中</span></div>
          <div style="font-size:18px; font-weight:700; margin-top:4px;">${esc(label)} <span class="tag">${esc(fmtCount(count))}</span></div>
        </div>
        <a class="btn" href="${clearUrl}" style="text-decoration:none;">タグを外す</a>
      </div>
    `.trim();
    pickedEl.hidden = false;
  }

  function renderTagList(tagEntries) {
    tagListEl.innerHTML = tagEntries.map(([t, c]) => renderTagCard(t, c)).join("\n");
  }

  function renderPosts(posts) {
    postsWrapEl.innerHTML = posts.map(renderPostCard).join("\n");
    postsWrapEl.hidden = posts.length === 0;
  }

  function applyPicked(posts, tagMap) {
    if (!picked) {
      pickedEl.hidden = true;
      postsWrapEl.hidden = true;
      stateEl.textContent = "タグを選ぶと、そのタグのメモだけ一覧表示します。";
      return;
    }

    const count = tagMap.get(picked) || 0;
    renderPickedBox(picked, count);

    const filtered = posts.filter((p) => {
      if (!p || p.hidden) return false;
      const tags = Array.isArray(p.tags) ? p.tags.map(normTag).filter(Boolean) : [];
      if (picked === NONE) return tags.length === 0;
      return tags.includes(picked);
    });

    stateEl.textContent = `タグ「${pickLabel(picked)}」のメモ一覧です。`;
    renderPosts(filtered);
  }

  async function main() {
    try {
      stateEl.textContent = "読み込み中…";
      const posts = await loadPosts();
      const tagMap = buildTagMap(posts);
      const sorted = sortTags(tagMap);

      // 初回表示
      renderTagList(sorted);
      applyPicked(posts, tagMap);

      // タグ検索
      tagQEl.addEventListener("input", () => {
        const q = tagQEl.value;
        renderTagList(filterTags(sorted, q));
      });

      stateEl.textContent = picked
        ? `タグ「${pickLabel(picked)}」のメモ一覧です。`
        : "タグを選ぶと、そのタグのメモだけ一覧表示します。";
    } catch (e) {
      console.error(e);
      stateEl.textContent = "読み込みに失敗しました。";
      tagListEl.innerHTML = `<div class="card"><p class="sub" style="margin:0;">タグ一覧を表示できませんでした。時間をおいて再読み込みしてください。</p></div>`;
    }
  }

  main();
})();
