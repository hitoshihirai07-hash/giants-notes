(() => {
  const escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => escMap[c]);
  }

  function showMsg(type, text) {
    const el = $("contactMsg");
    if (!el) return;
    el.className = `msg ${type}`;
    el.innerHTML = esc(text);
    el.hidden = false;
  }

  function hideMsg() {
    const el = $("contactMsg");
    if (!el) return;
    el.hidden = true;
  }

  async function submit(ev) {
    ev.preventDefault();
    hideMsg();

    const name = $("cName")?.value?.trim() || "";
    const reply = $("cReply")?.value?.trim() || "";
    const body = $("cBody")?.value || "";
    const website = $("cWebsite")?.value?.trim() || ""; // honeypot

    if (!body.trim()) {
      showMsg("bad", "内容は必須です");
      return;
    }
    if (body.length > 8000) {
      showMsg("bad", "内容が長すぎます（8000文字以内）");
      return;
    }

    try {
      const res = await fetch("./api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, reply, body, website })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      showMsg("ok", "送信しました。内容は必ず採用とは限りませんが、参考にします。");
      $("cBody").value = "";
      $("cWebsite").value = "";
    } catch (e) {
      showMsg("bad", `送信失敗: ${e.message}`);
    }
  }

  function clearAll() {
    hideMsg();
    if ($("cName")) $("cName").value = "";
    if ($("cReply")) $("cReply").value = "";
    if ($("cBody")) $("cBody").value = "";
    if ($("cWebsite")) $("cWebsite").value = "";
  }

  function init() {
    const form = $("contactForm");
    if (!form) return;
    form.addEventListener("submit", submit);
    $("cClear")?.addEventListener("click", clearAll);
  }

  init();
})();
