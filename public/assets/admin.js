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
  }

  return { init };
})();

A.init();
