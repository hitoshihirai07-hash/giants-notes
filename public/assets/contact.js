(() => {
  const escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const $ = (id) => document.getElementById(id);

  let tsWidgetId = null;
  let tsToken = "";
  let tsReady = false;
  let tsEnabled = true;

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

    // Turnstile（必須）
    if (tsEnabled) {
      if (!tsReady) {
        showMsg("bad", "現在フォームを利用できません（認証の準備中です）");
        return;
      }
      if (!tsToken) {
        showMsg("bad", "認証してください");
        return;
      }
    }

    try {
      const res = await fetch("./api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, reply, body, website, turnstile: tsToken })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      showMsg("ok", "送信しました。内容は必ず採用とは限りませんが、参考にします。");
      $("cBody").value = "";
      $("cWebsite").value = "";

      // Turnstile reset
      if (tsEnabled && window.turnstile && tsWidgetId !== null) {
        try { window.turnstile.reset(tsWidgetId); } catch {}
      }
      tsToken = "";
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

  // Turnstile onload callback (called by script tag)
  window.onTurnstileLoad = async function () {
    const host = $("turnstile");
    if (!host) {
      // フォーム側にTurnstile枠が無い場合は無効化
      tsEnabled = false;
      tsReady = true;
      return;
    }

    try {
      const res = await fetch("./api/config", { cache: "no-store" });
      const cfg = await res.json().catch(() => ({}));
      const sitekey = String(cfg?.turnstileSiteKey || "").trim();
      if (!sitekey) throw new Error("Turnstileのサイトキーが未設定です");

      // 明示描画
      tsWidgetId = window.turnstile.render(host, {
        sitekey,
        theme: "light",
        callback: (token) => {
          tsToken = String(token || "");
        },
        "expired-callback": () => {
          tsToken = "";
        },
        "error-callback": () => {
          tsToken = "";
        }
      });
      tsReady = true;
    } catch (e) {
      tsReady = false;
      showMsg("bad", `フォームの準備に失敗しました: ${e.message}`);
      // 送信ボタンを止める
      const btn = document.querySelector("#contactForm button[type='submit']");
      if (btn) btn.disabled = true;
    }
  };

  init();
})();
