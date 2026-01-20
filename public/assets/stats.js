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

// 規定（NPBの一般的な基準）
// 打者：規定打席 = チーム試合数 × 3.1
// 投手：規定投球回 = チーム試合数
// ※batters.csv に「打席」が無い場合は、安打/打率 から概算（打数近似）

function parseInnings(v) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return NaN;
  const parts = s.split(".");
  const inn = Number(parts[0] || 0);
  const frac = parts[1];
  if (!frac) return inn;
  if (frac === "1") return inn + 1 / 3;
  if (frac === "2") return inn + 2 / 3;
  // それ以外は普通の小数として扱う（念のため）
  return inn + Number("0." + frac);
}

function numberOrNaN(v) {
  const c = toComparable(String(v ?? "").trim());
  return c.type === "num" ? c.n : NaN;
}

function estimatePA(row) {
  // 優先：打席 → 次点：PA → 次点：打数 → 最後：安打/打率 で概算
  const pa = numberOrNaN(row["打席"] ?? row["PA"]);
  if (!isNaN(pa)) return pa;
  const ab = numberOrNaN(row["打数"] ?? row["AB"]);
  if (!isNaN(ab)) return ab;

  const hits = numberOrNaN(row["安打"] ?? row["H"]);
  const avg = numberOrNaN(row["打率"] ?? row["AVG"]);
  if (!isNaN(hits) && !isNaN(avg) && avg > 0) {
    return hits / avg; // 打数近似
  }
  return NaN;
}

function isProbablyNumericColumn(rows, col) {
  let seen = 0;
  let nums = 0;
  for (const r of rows) {
    const s = String(r[col] ?? "").trim();
    if (!s) continue;
    seen++;
    if (col === "投球回") {
      if (!isNaN(parseInnings(s))) nums++;
    } else {
      const c = toComparable(s);
      if (c.type === "num") nums++;
    }
    if (seen >= 20) break;
  }
  return seen > 0 && nums / seen >= 0.6;
}

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

  // 規定フィルタ
  if (state.qualifiedOnly) {
    if (key === "pitchers") {
      const minIP = state.qualIP || 0;
      rows = rows.filter(r => {
        const ip = parseInnings(r["投球回"]);
        return !isNaN(ip) && ip >= minIP;
      });
    }
    if (key === "batters") {
      const minPA = state.qualPA || 0;
      rows = rows.filter(r => {
        const pa = estimatePA(r);
        return !isNaN(pa) && pa >= minPA;
      });
    }
  }

  // sort
  const { sortKey, sortDir } = state;
  if (sortKey) {
    const dir = sortDir === "desc" ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      // 投球回だけは 7.1=7回1/3 の扱いにする
      const aRaw = String(a[sortKey] ?? "").replace(/\n/g, " ").trim();
      const bRaw = String(b[sortKey] ?? "").replace(/\n/g, " ").trim();
      const A = sortKey === "投球回" ? ({ type: "num", n: parseInnings(aRaw), s: aRaw }) : toComparable(aRaw);
      const B = sortKey === "投球回" ? ({ type: "num", n: parseInnings(bRaw), s: bRaw }) : toComparable(bRaw);

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
        // 初回クリックは「数値なら大きい順」（防御率だけ小さい順）
        if (k === "防御率") state.sortDir = "asc";
        else state.sortDir = isProbablyNumericColumn(rows, k) ? "desc" : "asc";
      }
      renderTable({ key, header, data }, state);
    });
  });
}

async function main() {
  const stateEl = $("statsState");
  const wrap = $("tableWrap");
  const opp = $("opp");
  const qualBtn = $("qualBtn");
  const sortSel = $("sortSel");
  const sortDirBtn = $("sortDirBtn");
  const sortClearBtn = $("sortClearBtn");

  const state = {
    tab: "games",
    q: "",
    opp: "",
    sortKey: "",
    sortDir: "asc",
    qualifiedOnly: false,
    qualPA: 0,
    qualIP: 0
  };

  // 規定値を計算（games.csv の試合数を使う）
  async function ensureQualThresholds() {
    try {
      // 優先：試合結果（スコアが入っている行）だけを「消化試合」として数える
      // （ユーザーCSVでは、未実施日の行だけ日付があり、対戦球団/スコアが空のケースがあるため）
      const g = await loadObjects("games");

      const isPlayedGame = (r) => {
        const opp = String(r["対戦球団"] || "").trim();
        const score = String(r["スコア"] || "").trim();
        if (!opp || !score) return false;
        // 例: ○6-5 / ●2-3 / △3-3 など
        return /\d+\s*-\s*\d+/.test(score);
      };

      let n = g.data.filter(isPlayedGame).length;

      // フォールバック：standings.csv から「試合」列 or 勝敗引分の合計
      if (!n) {
        const s = await loadObjects("standings");
        const giantsRow = s.data.find(r => {
          const t = String(r["チーム"] || r["球団"] || "").trim();
          return t === "読売ジャイアンツ" || t.endsWith("ジャイアンツ") || t.includes("巨人");
        });
        if (giantsRow) {
          const games = numberOrNaN(giantsRow["試合"]);
          if (!isNaN(games)) n = games;
          else {
            const w = numberOrNaN(giantsRow["勝利"] ?? giantsRow["勝"]);
            const l = numberOrNaN(giantsRow["敗北"] ?? giantsRow["敗"]);
            const d = numberOrNaN(giantsRow["引分"] ?? giantsRow["分"]);
            if (![w,l,d].some(isNaN)) n = w + l + d;
          }
        }
      }

      // 0 のときは固定値にしない（ボタンだけ動く）
      state.qualIP = n || 0;
      state.qualPA = n ? Math.ceil(n * 3.1) : 0;
    } catch {
      state.qualIP = 0;
      state.qualPA = 0;
    }
  }

  function recommendedSortColumns(tab, header) {
    const pick = (arr) => arr.filter(c => header.includes(c));
    if (tab === "batters") {
      const base = pick(["打率","本塁打","打点","安打","盗塁","出塁率","OPS","打席","打数"]);
      return base.length ? base : header;
    }
    if (tab === "pitchers") {
      const base = pick(["防御率","勝利","敗北","セーブ","HP","投球回","三振"]);
      return base.length ? base : header;
    }
    return header;
  }

  function syncExtraControls(tab, header, rowsForTypeHint) {
    // 規定ボタン
    if (qualBtn) {
      const show = tab === "batters" || tab === "pitchers";
      qualBtn.hidden = !show;
      if (show) {
        const label = tab === "pitchers" ? "規定投球回以上のみ" : "規定打席以上のみ";
        qualBtn.textContent = `${label}：${state.qualifiedOnly ? "ON" : "OFF"}`;
      }
    }

    // 並び替え
    const showSort = tab === "batters" || tab === "pitchers";
    if (sortSel) sortSel.hidden = !showSort;
    if (sortDirBtn) sortDirBtn.hidden = !showSort;
    if (sortClearBtn) sortClearBtn.hidden = !showSort;

    if (showSort && sortSel) {
      const cols = recommendedSortColumns(tab, header);
      sortSel.innerHTML = '<option value="">並び替え：なし</option>';
      // 数値っぽい列だけ載せる
      for (const c of cols) {
        if (c === "選手") continue;
        if (c === "対戦球団") continue;
        // 投球回は数値扱い
        const numeric = c === "投球回" ? true : isProbablyNumericColumn(rowsForTypeHint, c);
        if (!numeric) continue;
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        sortSel.appendChild(opt);
      }
      // 既存選択の維持
      sortSel.value = state.sortKey || "";
      if (sortDirBtn) {
        sortDirBtn.textContent = state.sortDir === "desc" ? "大きい順" : "小さい順";
      }
    }
  }

  function setActiveTab(tab) {
    state.tab = tab;
    state.q = $("statsQ")?.value || "";
    state.opp = opp?.value || "";
    state.sortKey = "";
    state.sortDir = "asc";
    state.qualifiedOnly = false;

    document.querySelectorAll(".tabbtn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });

    if (opp) {
      const show = !!DS[tab]?.withOppFilter;
      opp.hidden = !show;
    }

    // タブ切替時点では controls の文言だけ先に更新
    if (tab === "pitchers") {
      if (qualBtn) qualBtn.textContent = `規定投球回以上のみ：OFF`;
    } else if (tab === "batters") {
      if (qualBtn) qualBtn.textContent = `規定打席以上のみ：OFF`;
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

      // extra controls
      syncExtraControls(state.tab, payload.header, payload.data);

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

  // extra controls handlers
  qualBtn?.addEventListener("click", async () => {
    state.qualifiedOnly = !state.qualifiedOnly;
    // 文言更新
    if (state.tab === "pitchers") {
      qualBtn.textContent = `規定投球回以上のみ：${state.qualifiedOnly ? "ON" : "OFF"}`;
    } else if (state.tab === "batters") {
      qualBtn.textContent = `規定打席以上のみ：${state.qualifiedOnly ? "ON" : "OFF"}`;
    }
    await refresh(false);
  });

  sortSel?.addEventListener("change", async () => {
    const k = sortSel.value || "";
    state.sortKey = k;
    if (!k) {
      state.sortDir = "asc";
    } else {
      // 防御率は小さい順が自然
      state.sortDir = k === "防御率" ? "asc" : "desc";
    }
    if (sortDirBtn) sortDirBtn.textContent = state.sortDir === "desc" ? "大きい順" : "小さい順";
    await refresh(false);
  });

  sortDirBtn?.addEventListener("click", async () => {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    sortDirBtn.textContent = state.sortDir === "desc" ? "大きい順" : "小さい順";
    await refresh(false);
  });

  sortClearBtn?.addEventListener("click", async () => {
    state.sortKey = "";
    state.sortDir = "asc";
    if (sortSel) sortSel.value = "";
    if (sortDirBtn) sortDirBtn.textContent = "大きい順";
    await refresh(false);
  });

  // init
  setActiveTab("games");
  // first button active
  document.querySelector('.tabbtn[data-tab="games"]')?.classList.add("active");

  // 規定値を準備（失敗しても表示は動く）
  await ensureQualThresholds();

  await refresh(true);
}

main();
