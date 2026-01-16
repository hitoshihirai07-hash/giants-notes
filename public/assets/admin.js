const A = (() => {
  const escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => escMap[c]);
  }

  function nowDate() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function splitTags(raw) {
    return String(raw || "")
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

  function showMsg(type, text, extraHtml = "") {
    const msg = $("msg");
    msg.className = `msg ${type}`;
    msg.innerHTML = `${esc(text)}${extraHtml}`;
    msg.hidden = false;
  }

  function hideMsg() {
    const msg = $("msg");
    msg.hidden = true;
  }

  function saveToken() {
    const t = $("token").value.trim();
    if (!t) return showMsg("bad", "トークンが空です");
    localStorage.setItem("ADMIN_TOKEN", t);
    showMsg("ok", "トークンを保存しました");
  }

  function loadToken() {
    const t = localStorage.getItem("ADMIN_TOKEN") || "";
    $("token").value = t;
  }

  function clearToken() {
    localStorage.removeItem("ADMIN_TOKEN");
    $("token").value = "";
    showMsg("ok", "トークンを消しました");
  }

  function renderPreview() {
    const title = $("title").value.trim();
    const date = $("date").value;
    const info = $("info").value.trim();
    const tags = splitTags($("tags").value);
    const body = $("body").value;

    const area = $("previewArea");
    const ps = paragraphs(body);

    area.innerHTML = `
      <div class="meta">
        <span>${esc(date || "")}</span>
        ${info ? `<span>・ ${esc(info)}</span>` : ""}
        ${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}
      </div>
      <div style="margin-top:10px;"><strong>${esc(title || "(タイトル未入力)")}</strong></div>
      <div style="margin-top:10px;">${ps.map(p => `<p>${esc(p)}</p>`).join("")}</div>
    `;
  }

  async function submitPost(ev) {
    ev.preventDefault();
    hideMsg();

    const token = $("token").value.trim();
    if (!token) return showMsg("bad", "トークンが必要です（上で保存してください）");

    const payload = {
      title: $("title").value.trim(),
      date: $("date").value,
      info: $("info").value.trim(),
      tags: splitTags($("tags").value),
      body: $("body").value
    };

    if (!payload.title || !payload.date || !payload.body.trim()) {
      return showMsg("bad", "タイトル・日付・本文は必須です");
    }

    try {
      const res = await fetch("./api/post", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      const url = json?.url ? json.url : "";
      const extra = url ? `<div style="margin-top:8px;"><a href="${esc(url)}">公開ページを開く</a></div>` : "";
      showMsg("ok", "投稿しました", extra);

      // clear body for next post (keep date/tags)
      $("body").value = "";
      renderPreview();
    } catch (e) {
      showMsg("bad", `投稿失敗: ${e.message}`);
    }
  }

  function formatJst(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      // ブラウザのローカル時間（日本ならJST）で表示
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return iso;
    }
  }

  async function loadInbox() {
    const inboxEl = $("inbox");
    if (!inboxEl) return; // 古いadmin.html対策

    const token = $("token")?.value?.trim() || "";
    if (!token) {
      inboxEl.innerHTML = `<div class="card">トークンを入力すると表示できます</div>`;
      return;
    }

    inboxEl.innerHTML = `<div class="card">読み込み中...</div>`;

    try {
      const res = await fetch("./api/inbox?limit=50", {
        headers: {
          "authorization": `Bearer ${token}`
        }
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      const msgs = Array.isArray(json?.messages) ? json.messages : [];
      if (!msgs.length) {
        inboxEl.innerHTML = `<div class="card">まだ届いていません</div>`;
        return;
      }

      inboxEl.innerHTML = "";
      for (const m of msgs) {
        const id = esc(m?.id || "");
        const createdAt = esc(formatJst(m?.createdAt || ""));
        const name = esc(m?.name || "");
        const reply = esc(m?.reply || "");

        const body = String(m?.body || "");
        const ps = paragraphs(body).map(p => `<p>${esc(p)}</p>`).join("");

        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `
          <div class="meta">
            <span>${createdAt}</span>
            ${name ? `<span>・ ${name}</span>` : ""}
            ${reply ? `<span>・ ${reply}</span>` : ""}
          </div>
          <div style="margin-top:10px;">${ps}</div>
          <div class="row" style="margin-top:10px; gap:8px;">
            <button class="btn ghost" data-del="${id}">削除</button>
            <button class="btn" data-copy="${id}">本文コピー</button>
          </div>
        `;
        inboxEl.appendChild(div);
      }

      // handlers
      inboxEl.querySelectorAll("button[data-copy]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const targetId = btn.getAttribute("data-copy");
          const msg = msgs.find(x => String(x.id) === String(targetId));
          if (!msg) return;
          const text = String(msg.body || "");
          try {
            await navigator.clipboard.writeText(text);
            showMsg("ok", "コピーしました");
          } catch {
            showMsg("bad", "コピーに失敗しました（ブラウザの権限を確認）");
          }
        });
      });

      inboxEl.querySelectorAll("button[data-del]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const targetId = btn.getAttribute("data-del");
          if (!targetId) return;
          try {
            const del = await fetch("./api/inbox-delete", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "authorization": `Bearer ${token}`
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
      inboxEl.innerHTML = `<div class="card">読み込み失敗: ${esc(e.message)}</div>`;
    }
  }

  function init() {
    loadToken();
    $("date").value = nowDate();

    $("saveToken").addEventListener("click", (e) => { e.preventDefault(); saveToken(); });
    $("clearToken").addEventListener("click", (e) => { e.preventDefault(); clearToken(); });

    $("preview").addEventListener("click", renderPreview);
    $("form").addEventListener("submit", submitPost);

    ["title","date","info","tags","body"].forEach(id => {
      $(id).addEventListener("input", () => {
        // lightweight live preview (no spam)
        renderPreview();
      });
    });

    renderPreview();
    // inbox
    $("inboxReload")?.addEventListener("click", loadInbox);
    loadInbox();
  }

  return { init };
})();

A.init();
