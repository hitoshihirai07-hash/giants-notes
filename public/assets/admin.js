const Admin = (() => {
  const escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const $ = (id) => document.getElementById(id);

  // id で要素を取ってイベントを張る（存在しない場合は無視）
  function on(id, evt, handler, opts) {
    const el = $(id);
    if (!el) return;
    el.addEventListener(evt, handler, opts);
  }

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

  // 一覧の管理UI（非表示／削除）
  function renderPostsManage() {
    const box = id("stManage");
    if (!box) return;

    box.innerHTML = "";
    const arr = Array.isArray(postsIndex) ? postsIndex.slice() : [];
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.className = "card";
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "まだありません";
      empty.appendChild(p);
      box.appendChild(empty);
      return;
    }

    arr.sort((a, b) => String(b.datetime || "").localeCompare(String(a.datetime || "")));

    for (const it of arr) {
      const card = document.createElement("div");
      card.className = "card";

      const top = document.createElement("div");
      top.className = "row";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";
      top.style.gap = "10px";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.style.fontWeight = "800";
      title.textContent = it.title || "(無題)";

      if (it.hidden) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.style.marginLeft = "8px";
        badge.textContent = "非表示";
        title.appendChild(badge);
      }

      const meta = document.createElement("div");
      meta.className = "muted";
      const tagText = Array.isArray(it.tags) && it.tags.length ? ` / ${it.tags.join(",")}` : "";
      meta.textContent = `${it.datetime || ""}${tagText}`.trim();

      const slug = document.createElement("div");
      slug.className = "muted";
      slug.style.marginTop = "6px";
      slug.textContent = it.slug || "";

      left.appendChild(title);
      left.appendChild(meta);
      left.appendChild(slug);

      const right = document.createElement("div");
      right.className = "row";
      right.style.gap = "8px";

      const btnHide = document.createElement("button");
      btnHide.type = "button";
      btnHide.className = "btn ghost";
      btnHide.textContent = it.hidden ? "表示する" : "非表示にする";
      btnHide.addEventListener("click", () => {
        postsIndex = postsIndex.map(p => (p.slug === it.slug ? { ...p, hidden: !p.hidden } : p));
        renderPostsManage();
        showStMsg("ok", "一覧を更新しました。必要なら posts.json をダウンロードしてアップロードしてください。", 3000);
      });

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn ghost";
      btnDel.textContent = "削除";
      btnDel.addEventListener("click", () => {
        const ok = window.confirm("このメモを一覧から削除します（記事HTMLファイル自体は消しません）。続けますか？");
        if (!ok) return;
        postsIndex = postsIndex.filter(p => p.slug !== it.slug);
        renderPostsManage();
        showStMsg("ok", "一覧から削除しました。必要なら posts.json をダウンロードしてアップロードしてください。", 4000);
      });

      right.appendChild(btnHide);
      right.appendChild(btnDel);

      top.appendChild(left);
      top.appendChild(right);
      card.appendChild(top);
      box.appendChild(card);
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

  function buildPostsIndexHtml(posts) {
    const arr = Array.isArray(posts) ? posts : [];
    const tags = Array.from(
      new Set(
        arr
          .flatMap((p) => (Array.isArray(p?.tags) ? p.tags : []))
          .map((t) => String(t || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));

    const itemsHtml = arr
      .map((p) => {
        const slug = String(p?.slug || "").trim();
        if (!slug) return "";
        const title = String(p?.title || "").trim() || "(無題)";
        const datetime = String(p?.datetime || "").trim();
        const info = String(p?.info || "").trim();
        const excerpt = String(p?.excerpt || "").trim();
        const ptags = Array.isArray(p?.tags) ? p.tags.map((t) => String(t || "").trim()).filter(Boolean) : [];
        const tagStr = ptags.join(",");
        const q = [title, info, excerpt, tagStr].filter(Boolean).join(" ");
        const tagSpans = ptags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
        const infoSpan = info ? `<span>・ ${esc(info)}</span>` : "";
        const href = `/posts/${encodeURIComponent(slug)}`;
        const sub = excerpt ? `<div class="sub">${esc(excerpt)}</div>` : "";

        return `
<article class="card post" data-tags="${esc(tagStr)}" data-q="${esc(q)}">
  <a href="${esc(href)}"><strong>${esc(title)}</strong></a>
  <div class="meta">
    <span>${esc(datetime)}</span>
    ${infoSpan}
    ${tagSpans}
  </div>
  ${sub}
</article>`;
      })
      .filter(Boolean)
      .join("\n");

    const tagBtns = tags
      .map((t) => `<button type="button" class="tabbtn" data-tag="${esc(t)}">${esc(t)}</button>`)
      .join("");

    const desc = "読売ジャイアンツのメモ一覧。検索やタグで過去ログを見返せます。";

    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>メモ一覧 | 読売ジャイアンツ 良かったところメモ</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="https://giants-notes.pages.dev/posts/" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="stylesheet" href="/assets/style.css" />
  <script src="/assets/seo.js" defer></script>
</head>
<body>
  <header class="wrap">
    <a class="back" href="/">← トップへ</a>
    <div class="head">
      <div>
        <h1>メモ一覧</h1>
        <p id="count" class="sub"></p>
      </div>
      <nav class="nav">
        <a href="/stats">成績・試合結果</a>
        <a href="/about">このサイトについて</a>
      </nav>
    </div>

    <div class="controls">
      <input id="q" class="input full" placeholder="検索（タイトル・タグ・本文抜粋）" />
      <button id="clear" class="btn ghost" type="button">クリア</button>
    </div>

    <div id="tags" class="tabs">${tagBtns}</div>
  </header>

  <main class="wrap">
    <div id="list" class="list">${itemsHtml || `<div class="card">まだありません</div>`}</div>
    <noscript><p class="hint">※検索やタグの絞り込みは JavaScript が必要です。</p></noscript>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ</small>
  </footer>

  <script>
  (() => {
    const q = document.getElementById('q');
    const clear = document.getElementById('clear');
    const count = document.getElementById('count');
    const items = Array.from(document.querySelectorAll('.post'));
    const tagBtns = Array.from(document.querySelectorAll('[data-tag]'));
    let activeTag = '';

    function apply() {
      const kw = (q?.value || '').trim().toLowerCase();
      let visible = 0;
      for (const it of items) {
        const text = (it.getAttribute('data-q') || '').toLowerCase();
        const tags = it.getAttribute('data-tags') || '';
        const okKw = !kw || text.includes(kw);
        const okTag = !activeTag || ((',' + tags + ',').includes(',' + activeTag + ','));
        const ok = okKw && okTag;
        it.style.display = ok ? '' : 'none';
        if (ok) visible++;
      }
      if (count) count.textContent = visible ? (String(visible) + '件') : '';
      for (const b of tagBtns) {
        b.classList.toggle('active', (b.getAttribute('data-tag') || '') === activeTag);
      }
    }

    for (const b of tagBtns) {
      b.addEventListener('click', () => {
        const t = b.getAttribute('data-tag') || '';
        activeTag = (activeTag === t) ? '' : t;
        apply();
      });
    }
    q?.addEventListener('input', apply);
    clear?.addEventListener('click', () => { if (q) q.value = ''; activeTag = ''; apply(); });

    apply();
  })();
  </script>
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

    // 一覧データ（posts.json）にも追加しておく（既存一覧があれば自動で取り込んで追記）
    await loadPostsIndex();
    const entry = toEntry({ fileName, title, date, time, info, tags, body });
    postsIndex = upsertEntry(postsIndex, entry);
    renderPostsManage();

    // ここで posts.json も一緒に落とす（忘れがちで「更新されない」原因になりやすい）
    const jsonText = JSON.stringify(postsIndex, null, 2) + "\n";
    downloadText("posts.json", jsonText, "application/json;charset=utf-8");

    showStMsg(
      "ok",
      `記事HTMLとposts.jsonをダウンロードしました（${esc(fileName)}）\n` +
        `この2つをまとめて public/posts/ にアップロードしてください。`
    );
  }

  async function stDownloadIndex() {
    hideStMsg();
    await loadPostsIndex();

    // 並びを揃える（新しい順）
    postsIndex = (Array.isArray(postsIndex) ? postsIndex : []).slice().sort((a, b) =>
      String(b?.datetime || "").localeCompare(String(a?.datetime || ""))
    );

    const jsonText = JSON.stringify(postsIndex, null, 2) + "\n";
    downloadText("posts.json", jsonText, "application/json;charset=utf-8");
    showStMsg("ok", "posts.jsonをダウンロードしました。public/posts/posts.json にアップロードしてください");
  }

  function initTabs() {
    const btns = Array.from(document.querySelectorAll("[data-admin-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-admin-panel]"));
    if (!btns.length || !panels.length) return;

    const show = (tab) => {
      for (const p of panels) {
        p.style.display = p.getAttribute("data-admin-panel") === tab ? "" : "none";
      }
      for (const b of btns) {
        b.classList.toggle("active", b.getAttribute("data-admin-tab") === tab);
      }
    };

    for (const b of btns) {
      b.addEventListener("click", () => show(b.getAttribute("data-admin-tab") || ""));
    }
    show(btns[0].getAttribute("data-admin-tab") || "");
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

    initTabs();

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
    on("stLoadIndex", "click", async () => {
      hideStMsg();
      await loadPostsIndex();
      renderPostsManage();
      showStMsg("ok", "既存の一覧を読み込みました");
    });
    on("stDownloadIndex", "click", () => stDownloadIndex());

    // inbox
    on("inboxReload", "click", () => loadInbox());

    loadPostsIndex().then(() => {
      renderPostsManage();
      renderStaticPreview();
    });
    loadInbox();
  }

  return { init };
})();

Admin.init();
