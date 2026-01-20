import { fetchCSV, toComparable } from "./csv.js";

const $ = (id) => document.getElementById(id);

const TOKEN_KEY = "ADMIN_TOKEN";

const DS = {
  batters_open: { label: "オープン戦（打者）", path: "./data/batters_open.csv" },
  pitchers_open: { label: "オープン戦（投手）", path: "./data/pitchers_open.csv" }
};

const cache = new Map();

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalize(s) {
  return String(s ?? "").replace(/\r\n?/g, "\n").replace(/\n/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

async function loadObjects(key) {
  if (cache.has(key)) return cache.get(key);
  const rows = await fetchCSV(DS[key].path);
  const header = rows[0] || [];
  const data = rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => (o[h] = r[i] ?? ""));
    return o;
  });
  const payload = { header, data };
  cache.set(key, payload);
  return payload;
}

async function verifyToken(token) {
  if (!token) return { ok: false, msg: "トークンを入力してください" };
  try {
    const res = await fetch(`./api/inbox?limit=1`, {
      headers: { "authorization": `Bearer ${token}` },
      cache: "no-store"
    });
    if (res.status === 401) return { ok: false, msg: "トークンが違います" };
    if (!res.ok) return { ok: false, msg: `確認失敗: HTTP ${res.status}` };
    return { ok: true, msg: "OK" };
  } catch (e) {
    return { ok: false, msg: `確認失敗: ${e.message}` };
  }
}

function renderTable({ key, header, data }, state) {
  const q = normalize(state.q || "");

  let rows = data;
  if (q) {
    rows = rows.filter(r => {
      for (const h of Object.keys(r)) {
        if (normalize(r[h]).includes(q)) return true;
      }
      return false;
    });
  }

  // sort
  if (state.sortKey) {
    const dir = state.sortDir === "desc" ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const A = toComparable(normalize(a[state.sortKey]));
      const B = toComparable(normalize(b[state.sortKey]));
      if (A.type === "empty" && B.type !== "empty") return 1;
      if (B.type === "empty" && A.type !== "empty") return -1;
      if (A.type === "num" && B.type === "num") return dir * (A.n - B.n);
      return dir * String(a[state.sortKey] ?? "").localeCompare(String(b[state.sortKey] ?? ""), "ja");
    });
  }

  const cols = header;
  const tbl = $("tbl");

  const ths = cols.map(c => {
    const mark = state.sortKey === c ? (state.sortDir === "desc" ? " ▼" : " ▲") : "";
    return `<th class="th" data-key="${esc(c)}">${esc(c)}${mark}</th>`;
  }).join("");

  const trs = rows.map(r => {
    const tds = cols.map(c => `<td class="td">${esc(String(r[c] ?? "").replace(/\n/g, " "))}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  tbl.innerHTML = `<thead><tr>${ths}</tr></thead><tbody>${trs}</tbody>`;

  const info = $("info");
  info.innerHTML = `<span>${esc(DS[key].label)}</span><span>・ ${rows.length}件</span>`;
  info.hidden = false;

  tbl.querySelectorAll("th[data-key]").forEach(th => {
    th.addEventListener("click", () => {
      const k = th.getAttribute("data-key");
      if (!k) return;
      if (state.sortKey === k) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = k;
        // 初回クリックは「数値なら大きい順」（防御率だけ小さい順）
        if (k === "防御率") state.sortDir = "asc";
        else {
          const sample = rows.slice(0, 20);
          const isNum = sample.some(r => {
            const c = toComparable(String(r[k] ?? "").trim());
            return c.type === "num";
          });
          state.sortDir = isNum ? "desc" : "asc";
        }
      }
      renderTable({ key, header, data }, state);
    });
  });
}

async function main() {
  const tokenInput = $("token");
  const authState = $("authState");
  const stateEl = $("state");
  const wrap = $("tableWrap");

  const state = {
    tab: "batters_open",
    q: "",
    sortKey: "",
    sortDir: "asc",
    authed: false
  };

  function setActiveTab(tab) {
    state.tab = tab;
    state.sortKey = "";
    state.sortDir = "asc";
    document.querySelectorAll(".tabbtn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
  }

  async function refresh(showLoading = true) {
    if (!state.authed) {
      stateEl.textContent = "トークンが必要です";
      stateEl.hidden = false;
      wrap.hidden = true;
      $("info").hidden = true;
      return;
    }

    try {
      if (showLoading) {
        stateEl.textContent = "読み込み中…";
        stateEl.hidden = false;
        wrap.hidden = true;
      }

      const payload = await loadObjects(state.tab);
      stateEl.hidden = true;
      wrap.hidden = false;
      renderTable({ key: state.tab, ...payload }, state);
    } catch (e) {
      stateEl.textContent = `読み込み失敗: ${e.message}`;
      stateEl.hidden = false;
      wrap.hidden = true;
      $("info").hidden = true;
    }
  }

  async function applyToken(token) {
    const r = await verifyToken(token);
    state.authed = r.ok;
    authState.textContent = r.msg;
    authState.style.color = r.ok ? "var(--ok)" : "var(--bad)";
    await refresh(true);
  }

  // init token
  const saved = localStorage.getItem(TOKEN_KEY) || "";
  tokenInput.value = saved;
  await applyToken(saved);

  $("save").addEventListener("click", async () => {
    const t = tokenInput.value.trim();
    localStorage.setItem(TOKEN_KEY, t);
    await applyToken(t);
  });

  $("clear").addEventListener("click", async () => {
    localStorage.removeItem(TOKEN_KEY);
    tokenInput.value = "";
    await applyToken("");
  });

    const qInput = $("q");
  qInput.addEventListener("input", async () => {
    state.q = qInput.value || "";
    await refresh(false);
  });

  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");
      if (!tab || !DS[tab]) return;
      setActiveTab(tab);
      await refresh(true);
    });
  });

  // 見た目だけ先に反映
  setActiveTab(state.tab);
}

main();
