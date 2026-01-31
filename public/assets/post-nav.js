(() => {
  async function loadPosts() {
    const res = await fetch("/posts/posts.json", { cache: "no-store" });
    if (!res.ok) throw new Error("posts.json を取得できません");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  function getCurrentSlug() {
    const p = location.pathname.replace(/\/+$/, "");
    const last = p.split("/").pop() || "";
    // /posts/xxxxx(.html)
    if (p.includes("/posts/") && last) {
      return last.endsWith(".html") ? last : `${last}.html`;
    }
    // /post?id=xxxx -> xxxxx.html
    if (last === "post" || last === "post.html") {
      const id = new URLSearchParams(location.search).get("id");
      if (!id) return "";
      const s = id.trim();
      if (!s) return "";
      return s.endsWith(".html") ? s : `${s}.html`;
    }
    return "";
  }

  function ensureNavContainer() {
    // If already exists, reuse
    let nav = document.getElementById("postnav");
    if (nav) return nav;

    const main = document.querySelector("main.wrap");
    if (!main) return null;

    nav = document.createElement("nav");
    nav.id = "postnav";
    nav.className = "postnav";
    nav.setAttribute("aria-label", "前後のメモ");

    // Insert before footer if possible, otherwise at end of main
    const article = main.querySelector(".article");
    if (article && article.parentNode === main) {
      main.insertBefore(nav, article.nextSibling);
    } else {
      main.appendChild(nav);
    }
    return nav;
  }

  function btn(label, href, rel) {
    if (!href) {
      const span = document.createElement("span");
      span.className = "btn ghost disabled";
      span.textContent = label;
      return span;
    }
    const a = document.createElement("a");
    a.className = "btn ghost";
    a.href = href;
    a.textContent = label;
    if (rel) a.rel = rel;
    return a;
  }

  async function init() {
    const slug = getCurrentSlug();
    if (!slug) return;

    let posts = [];
    try {
      posts = await loadPosts();
    } catch (e) {
      // fail silently
      return;
    }

    const idx = posts.findIndex(p => String(p?.slug || "").trim() === slug);
    if (idx < 0) return;

    const prev = posts[idx - 1]; // newer (list is newest first)
    const next = posts[idx + 1]; // older

    const nav = ensureNavContainer();
    if (!nav) return;

    const prevHref = prev?.slug ? `/posts/${encodeURIComponent(prev.slug)}` : "";
    const nextHref = next?.slug ? `/posts/${encodeURIComponent(next.slug)}` : "";

    // Build
    nav.innerHTML = "";
    nav.appendChild(btn("← 前へ", prevHref, "prev"));
    const index = document.createElement("a");
    index.className = "btn ghost";
    index.href = "/posts/";
    index.textContent = "一覧へ";
    nav.appendChild(index);
    nav.appendChild(btn("次へ →", nextHref, "next"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();