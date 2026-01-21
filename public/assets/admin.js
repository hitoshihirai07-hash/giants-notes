const Admin = (() => {
  const escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => escMap[c]);
  }

  function nowDate() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function nowTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function splitTags(raw) {
    return String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function paragraphs(text) {
    return String(text || "")
      .split(/\n\s*\n/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function showMsg(type, text, extraHtml = "") {
    const msg = $("msg");
    if (!msg) return;
    msg.className = `msg ${type}`;
    msg.innerHTML = `${esc(text)}${extraHtml}`;
    msg.hidden = false;
  }

  function showStMsg(type, text, extraHtml = "") {
    const msg = $("stMsg");
    if (!msg) return;
    msg.className = `msg ${type}`;
    msg.innerHTML = `${esc(text)}${extraHtml}`;
    msg.hidden = false;
  }

  function hideStMsg() {
    const msg = $("stMsg");
    if (msg) msg.hidden = true;
  }

  function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function stripForDesc(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function firstDesc(body) {
    const ps = paragraphs(body);
    const raw = stripForDesc(ps[0] || "");
    return raw.slice(0, 140);
  }

  function toHtmlParas(text) {
    return paragraphs(text)
      .map((p) => `<p>${esc(p)}</p>`)
      .join("");
  }

  function buildFileName(date, time) {
    const hhmm = String(time || "").replace(":", "");
    return `${date}-${hhmm}.html`;
  }

  function toEntry({ fileName, title, date, time, info, tags, body }) {
    const dt = `${date} ${time}`;
    return {
      slug: fileName,
      title,
      datetime: dt,
      info: info || "",
      tags: tags || [],
      excerpt: firstDesc(body)
    };
  }

  function upsertEntry(arr, entry) {
    const next = Array.isArray(arr)
      ? arr.filter((e) => String(e?.slug || "") !== String(entry.slug))
      : [];
    next.unshift(entry);
    next.sort((a, b) => String(b?.datetime || "").localeCompare(String(a?.datetime || "")));
    return next;
  }

  let postsIndex = [];
  async function loadPostsIndex() {
    try {
      const res = await fetch("/posts/posts.json", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      if (Array.isArray(json)) postsIndex = json;
    } catch {
      // ignore
    }
  }

  function buildStaticPostHtml({ title, date, time, info, tags, body, fileName }) {
    const dt = `${date} ${time}`;
    const desc = firstDesc(body) || "読売ジャイアンツのメモ。";
    const canonical = `https://giants-notes.pages.dev/posts/${encodeURIComponent(fileName)}`;
    const metaTags = (tags || []).map((t) => `<span class=\"tag\">${esc(t)}</span>`).join("");
    const infoSpan = info ? `<span>・ ${esc(info)}</span>` : "";
    const ps = toHtmlParas(body);

    return `<!doctype html>
<html lang=\"ja\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
  <title>${esc(title)} | 読売ジャイアンツ 良かったところメモ</title>
  <meta name=\"description\" content=\"${esc(desc)}\" />
  <link rel=\"canonical\" href=\"${esc(canonical)}\" />
  <link rel=\"icon\" href=\"/favicon.ico\" sizes=\"any\" />
  <link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/favicon-32x32.png\" />
  <link rel=\"icon\" type=\"image/png\" sizes=\"16x16\" href=\"/favicon-16x16.png\" />
  <link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\" />
  <link rel=\"manifest\" href=\"/site.webmanifest\" />
  <meta name=\"theme-color\" content=\"#f7f7f7\" />
  <meta name=\"robots\" content=\"index,follow\" />
  <link rel=\"stylesheet\" href=\"/assets/style.css\" />
  <script src=\"/assets/seo.js\" defer></script>
</head>
<body>
  <header class=\"wrap\">
    <a class=\"back\" href=\"/posts/\">← メモ一覧へ</a>
    <h1>${esc(title)}</h1>
    <div class=\"meta\">
      <span>${esc(dt)}</span>
      ${infoSpan}
      ${metaTags}
    </div>
    <nav class=\"nav\" style=\"margin-top:8px;\">
      <a href=\"/stats\">成績・試合結果</a>
      <a href=\"/about\">このサイトについて</a>
    </nav>
  </header>

  <main class=\"wrap\">
    <article class=\"article\">${ps}</article>
  </main>

  <footer class=\"wrap foot\">
    <small>© 読売ジャイアンツ 良かったところメモ ・ <a href=\"/about\">このサイトについて</a></small>
  </footer>
</body>
</html>`;
  }

  function renderStaticPreview() {
    const title = $("st_title")?.value?.trim() || "";
    const date = $("st_date")?.value || "";
    const time = $("st_time")?.value || "";
    const info = $("st_info")?.value?.trim() || "";
    const tags = splitTags($("st_tags")?.value || "");
    const body = $("st_body")?.value || "";

    const area = $("stPreviewArea");
    if (!area) return;

    const dt = date && time ? `${date} ${time}` : date || "";
    area.innerHTML = `
      <div class=\"meta\">
        <span>${esc(dt)}</span>
        ${info ? `<span>・ ${esc(info)}</span>` : ""}
        ${tags.map((t) => `<span class=\"tag\">${esc(t)}</span>`).join("")}
      </div>
      <div style=\"margin-top:10px;\"><strong>${esc(title || "(タイトル未入力)")}</strong></div>
      <div style=\"margin-top:10px;\">${toHtmlParas(body)}</div>
    `;
  }

  async function stDownloadPost() {
    hideStMsg();
    const title = $("st_title")?.value?.trim() || "";
    const date = $("st_date")?.value || "";
    const time = $("st_time")?.value || "";
    const info = $("st_info")?.value?.trim() || "";
    const tags = splitTags($("st_tags")?.value || "");
    const body = $("st_body")?.value || "";

    if (!title || !date || !time || !body.trim()) {
      return showStMsg("bad", "タイトル・日付・時間・本文は必須です");
    }

    const fileName = buildFileName(date, time);
    const html = buildStaticPostHtml({ title, date, time, info, tags, body, fileName });
    downloadText(fileName, html, "text/html;charset=utf-8");
    showStMsg("ok", `記事HTMLをダウンロードしました（${esc(fileName)}）`);
  }

  async function stDownloadIndex() {
    hideStMsg();
    const title = $("st_title")?.value?.trim() || "";
    const date = $("st_date")?.value || "";
    const time = $("st_time")?.value || "";
    const info = $("st_info")?.value?.trim() || "";
    const tags = splitTags($("st_tags")?.value || "");
    const body = $("st_body")?.value || "";

    if (!title || !date || !time || !body.trim()) {
      return showStMsg("bad", "タイトル・日付・時間・本文は必須です");
    }

    await loadPostsIndex();
    const fileName = buildFileName(date, time);
    const entry = toEntry({ fileName, title, date, time, info, tags, body });
    postsIndex = upsertEntry(postsIndex, entry);

    downloadText("posts.json", JSON.stringify(postsIndex, null, 2), "application/json;charset=utf-8");
    showStMsg("ok", "posts.json をダウンロードしました（記事一覧用）");
  }

  function saveToken() {
    const input = $("token");
    const t = input?.value?.trim() || "";
    if (!t) return showMsg("bad", "トークンが空です");
    localStorage.setItem("ADMIN_TOKEN", t);
    showMsg("ok", "トークンを保存しました");
  }

  function loadToken() {
    const input = $("token");
    if (!input) return;
    input.value = localStorage.getItem("ADMIN_TOKEN") || "";
  }

  function clearToken() {
    localStorage.removeItem("ADMIN_TOKEN");
    const input = $("token");
    if (input) input.value = "";
    showMsg("ok", "トークンを消しました");
  }

  function formatJst(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return String(iso);
    }
  }

  async function loadInbox() {
    const inboxEl = $("inbox");
    if (!inboxEl) return;

    const token = $("token")?.value?.trim() || "";
    if (!token) {
      inboxEl.innerHTML = `<div class=\"card\">トークンを入力すると表示できます</div>`;
      return;
    }

    inboxEl.innerHTML = `<div class=\"card\">読み込み中...</div>`;

    try {
      const res = await fetch("./api/inbox?limit=50", {
        headers: { authorization: `Bearer ${token}` }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      const msgs = Array.isArray(json?.messages) ? json.messages : [];
      if (!msgs.length) {
        inboxEl.innerHTML = `<div class=\"card\">まだ届いていません</div>`;
        return;
      }

      inboxEl.innerHTML = "";
      for (const m of msgs) {
        const id = esc(m?.id || "");
        const createdAt = esc(formatJst(m?.createdAt || ""));
        const name = esc(m?.name || "");
        const reply = esc(m?.reply || "");
        const body = String(m?.body || "");
        const ps = paragraphs(body).map((p) => `<p>${esc(p)}</p>`).join("");

        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `
          <div class=\"meta\">
            <span>${createdAt}</span>
            ${name ? `<span>・ ${name}</span>` : ""}
            ${reply ? `<span>・ ${reply}</span>` : ""}
          </div>
          <div style=\"margin-top:10px;\">${ps}</div>
          <div class=\"row\" style=\"margin-top:10px; gap:8px;\">
            <button class=\"btn ghost\" data-del=\"${id}\">削除</button>
            <button class=\"btn\" data-copy=\"${id}\">本文コピー</button>
          </div>
        `;
        inboxEl.appendChild(div);
      }

      inboxEl.querySelectorAll("button[data-copy]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const targetId = btn.getAttribute("data-copy");
          const msg = msgs.find((x) => String(x.id) === String(targetId));
          if (!msg) return;
          try {
            await navigator.clipboard.writeText(String(msg.body || ""));
            showMsg("ok", "コピーしました");
          } catch {
            showMsg("bad", "コピーに失敗しました（ブラウザの権限を確認）");
          }
        });
      });

      inboxEl.querySelectorAll("button[data-del]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const targetId = btn.getAttribute("data-del");
          if (!targetId) return;
          try {
            const del = await fetch("./api/inbox-delete", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ id: targetId })
            });
            const j = await del.json().catch(() => ({}));
            if (!del.ok) throw new Error(j?.error || `HTTP ${del.status}`);
            showMsg("ok", "削除しました");
            loadInbox();
          } catch (e) {
            showMsg("bad", `削除失敗: ${e.message}`);
          }
        });
      });
    } catch (e) {
      inboxEl.innerHTML = `<div class=\"card\">読み込み失敗: ${esc(e.message)}</div>`;
    }
  }

  function init() {
    loadToken();

    // token
    on("saveToken", "click", () => saveToken());
    on("clearToken", "click", () => clearToken());

    // static tool defaults
    if ($("st_date")) {
      $("st_date").value = nowDate();
    }
    if ($("st_time")) {
      $("st_time").value = nowTime();
    }

    ["st_title", "st_date", "st_time", "st_info", "st_tags", "st_body"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", () => renderStaticPreview());
    });

    on("stPreview", "click", () => renderStaticPreview());
    on("stDownloadPost", "click", () => stDownloadPost());
    on("stDownloadIndex", "click", () => stDownloadIndex());

    // inbox
    on("inboxReload", "click", () => loadInbox());

    loadPostsIndex().then(() => renderStaticPreview());
    loadInbox();
  }

  return { init };
})();

Admin.init();
