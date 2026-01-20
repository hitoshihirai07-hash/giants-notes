import { fetchCSV, toComparable } from "./csv.js";

const $ = (id) => document.getElementById(id);

const DS = {
  games: {
    label: "試合結果",
    path: "./data/games.csv",
    // 表示順を固定
    cols: ["年月日","曜日","対戦球団","スコア","先発投手"],
    hideIfEmpty: ["対戦球団"],
    withOppFilter: true
  },
  standings: {
    label: "順位",
    path: "./data/standings.csv"
  },
  batters: {
    label: "打者",
    path: "./data/batters.csv"
  },
  pitchers: {
    label: "投手",
    path: "./data/pitchers.csv"
  }
};

const cache = new Map();

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

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeForSearch(s) {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildOppOptions(rows) {
  const opp = $("opp");
  if (!opp) return;
  const set = new Set();
  for (const r of rows) {
    const v = String(r["対戦球団"] || "").trim();
    if (v) set.add(v.replace(/\s+/g, ""));
  }
  const arr = Array.from(set);
  arr.sort((a, b) => a.localeCompare(b, "ja"));

  // reset
  opp.innerHTML = '<option value="">対戦相手：全部</option>';
  for (const v of arr) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    opp.appendChild(opt);
  }
}

function pickColumns(key, header) {
  const def = DS[key];
  if (def?.cols?.length) return def.cols;
  return header;
}

function shouldHideRow(key, row) {
  const def = DS[key];
  if (!def?.hideIfEmpty) return false;
  for (const col of def.hideIfEmpty) {
    if (!String(row[col] || "").trim()) return true;
  }
  return false;
}

function renderTable({ key, header, data }, state) {
  const q = normalizeForSearch(state.q || "");
  const oppFilter = state.opp || "";

  // filter
  let rows = data.filter(r => !shouldHideRow(key, r));
  if (key === "games" && oppFilter) {
    rows = rows.filter(r => String(r["対戦球団"] || "").replace(/\s+/g, "") === oppFilter);
  }
  if (q) {
    rows = rows.filter(r => {
      for (const h of Object.keys(r)) {
        if (normalizeForSearch(r[h]).includes(q)) return true;
      }
      return false;
    });
  }

  // sort
  const { sortKey, sortDir } = state;
  if (sortKey) {
    const dir = sortDir === "desc" ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const A = toComparable(String(a[sortKey] ?? "").replace(/\n/g, " ").trim());
      const B = toComparable(String(b[sortKey] ?? "").replace(/\n/g, " ").trim());

      // empty last
      if (A.type === "empty" && B.type !== "empty") return 1;
      if (B.type === "empty" && A.type !== "empty") return -1;

      if (A.type === "num" && B.type === "num") return dir * (A.n - B.n);
      return dir * A.s.localeCompare(B.s, "ja");
    });
  }

  const cols = pickColumns(key, header);
  const tbl = $("tbl");

  const ths = cols.map(c => {
    const active = sortKey === c ? ` data-sort="${esc(sortDir)}"` : "";
    const mark = sortKey === c ? (sortDir === "desc" ? " ▼" : " ▲") : "";
    return `<th class="th" data-key="${esc(c)}"${active}>${esc(c)}${mark}</th>`;
  }).join("");

  const trs = rows.map(r => {
    const tds = cols.map(c => {
      let v = String(r[c] ?? "");
      // standings等の改行は見やすく
      v = v.replace(/\r\n?/g, "\n");
      const html = esc(v).replace(/\n/g, "<br>");
      return `<td class="td">${html}</td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  tbl.innerHTML = `<thead><tr>${ths}</tr></thead><tbody>${trs}</tbody>`;

  // info
  const info = $("statsInfo");
  info.innerHTML = `<span>${esc(DS[key].label)}</span><span>・ ${rows.length}件</span>`;
  info.hidden = false;

  // sort handlers
  tbl.querySelectorAll("th[data-key]").forEach(th => {
    th.addEventListener("click", () => {
      const k = th.getAttribute("data-key");
      if (!k) return;
      if (state.sortKey === k) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = k;
        state.sortDir = "asc";
      }
      renderTable({ key, header, data }, state);
    });
  });
}

async function main() {
  const stateEl = $("statsState");
  const wrap = $("tableWrap");
  const opp = $("opp");

  const state = {
    tab: "games",
    q: "",
    opp: "",
    sortKey: "",
    sortDir: "asc"
  };

  function setActiveTab(tab) {
    state.tab = tab;
    state.q = $("statsQ")?.value || "";
    state.opp = opp?.value || "";
    state.sortKey = "";
    state.sortDir = "asc";

    document.querySelectorAll(".tabbtn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });

    if (opp) {
      const show = !!DS[tab]?.withOppFilter;
      opp.hidden = !show;
    }
  }

  // tab handlers
  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");
      if (!tab || !DS[tab]) return;
      setActiveTab(tab);
      await refresh();
    });
  });

  // search handlers
  $("statsQ")?.addEventListener("input", async () => {
    state.q = $("statsQ")?.value || "";
    await refresh(false);
  });

  opp?.addEventListener("change", async () => {
    state.opp = opp.value || "";
    await refresh(false);
  });

  async function refresh(showLoading = true) {
    try {
      if (showLoading) {
        stateEl.textContent = "読み込み中…";
        stateEl.hidden = false;
        wrap.hidden = true;
      }

      const payload = await loadObjects(state.tab);
      if (state.tab === "games") buildOppOptions(payload.data);

      stateEl.hidden = true;
      wrap.hidden = false;

      renderTable({ key: state.tab, ...payload }, state);
    } catch (e) {
      stateEl.textContent = `読み込み失敗: ${e.message}`;
      stateEl.hidden = false;
      wrap.hidden = true;
      $("statsInfo").hidden = true;
    }
  }

  // init
  setActiveTab("games");
  // first button active
  document.querySelector('.tabbtn[data-tab="games"]')?.classList.add("active");

  await refresh(true);
}

main();
