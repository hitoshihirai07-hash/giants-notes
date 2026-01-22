function htmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=300");
  return new Response(body, { ...init, headers });
}

// RFC4180寄り（ダブルクォート、改行混在対応）
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = "";
    } else if (c === '\r') {
      // ignore
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);

  while (rows.length && rows[rows.length - 1].every(v => String(v || "") === "")) {
    rows.pop();
  }
  return rows;
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildGamesTable(rows) {
  const header = rows[0] || [];
  const idx = (name) => header.indexOf(name);
  const iDate = idx("年月日");
  const iOpp = idx("対戦球団");
  const iScore = idx("スコア");
  const iStarter = idx("先発投手");

  const headHtml = `
    <thead>
      <tr>
        <th>日付</th>
        <th>対戦相手</th>
        <th>結果</th>
        <th>先発</th>
      </tr>
    </thead>
  `;

  const bodyRows = [];
  for (const r of rows.slice(1)) {
    const date = iDate >= 0 ? String(r[iDate] ?? "").trim() : "";
    const opp = iOpp >= 0 ? String(r[iOpp] ?? "").trim().replace(/\s+/g, "") : "";
    const score = iScore >= 0 ? String(r[iScore] ?? "").trim() : "";
    const starter = iStarter >= 0 ? String(r[iStarter] ?? "").trim() : "";

    if (!opp) continue; // 空行や休み行は省略

    bodyRows.push(
      `<tr>` +
      `<td>${esc(date)}</td>` +
      `<td>${esc(opp)}</td>` +
      `<td>${esc(score)}</td>` +
      `<td>${esc(starter)}</td>` +
      `</tr>`
    );
  }

  const bodyHtml = `<tbody>${bodyRows.join("")}</tbody>`;
  return headHtml + bodyHtml;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    // ベース HTML
    const baseRes = await env.ASSETS.fetch(new Request(new URL("/stats.html", request.url)));
    let html = await baseRes.text();

    // games.csv から最低限のテーブルを静的生成（JSが止まっても画面が空にならない）
    let gamesTable = "";
    try {
      const csvRes = await env.ASSETS.fetch(new Request(new URL("/data/games.csv", request.url)));
      if (csvRes.ok) {
        const text = await csvRes.text();
        const rows = parseCSV(text);
        gamesTable = buildGamesTable(rows);
      }
    } catch {
      // 無視
    }

    // 「読み込み中…」を消す（止まって見えるのが一番うざい）
    html = html.replace(
      /<div class="state"[^>]*id="statsState"[^>]*>[\s\S]*?<\/div>/,
      '<div class="state" hidden id="statsState"></div>'
    );

    // テーブル枠を表示状態にしておく（JSが動けば上書きされる）
    html = html.replace(/<div class="card"\s+hidden=""\s+id="tableWrap">/, '<div class="card" id="tableWrap">');
    html = html.replace(/<div class="card"\s+hidden\s+id="tableWrap">/, '<div class="card" id="tableWrap">');

    // games テーブルを初期表示として差し込む
    if (gamesTable) {
      html = html.replace(
        /<table class="tbl" id="tbl"><\/table>/,
        `<table class="tbl" id="tbl">${gamesTable}</table>`
      );
    }

    return htmlResponse(html);
  } catch (e) {
    return htmlResponse("<h1>エラー</h1>", { status: 500 });
  }
}
