(() => {
  // canonical を統一して、/post と /post.html などで評価が割れるのを防ぐ。
  function cleanPath(pathname) {
    // 末尾の / を除去して扱いやすく
    const p = pathname.replace(/\/+$/, "");
    if (p === "" || p === "/index.html") return "/";
    if (p === "/about.html") return "/about";
    if (p === "/post.html") return "/post";
    if (p === "/admin.html") return "/admin";
    if (p === "/stats.html") return "/stats";
    if (p === "/admin-open.html") return "/admin-open";
    return p || "/";
  }

  try {
    const u = new URL(location.href);
    u.pathname = cleanPath(u.pathname);

    // /post 以外はクエリを落として canonical を安定させる
    if (u.pathname !== "/post") u.search = "";

    // ルートは必ず / に
    if (!u.pathname) u.pathname = "/";

    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", u.toString());

    // OG URL（表示が崩れない範囲で）
    let og = document.querySelector('meta[property="og:url"]');
    if (!og) {
      og = document.createElement("meta");
      og.setAttribute("property", "og:url");
      document.head.appendChild(og);
    }
    og.setAttribute("content", u.toString());
  } catch {
    // 失敗してもページ表示に影響させない
  }
})();
