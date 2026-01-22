function htmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=60");
  return new Response(body, { ...init, headers });
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { header: [], rows: [] };

  const split = (line) => {
    // 簡易CSV（このサイトのデータはカンマ区切り＋クォート無し前提）
    // クォートを使う場合は csv.js 側に寄せる
    return line.split(",").map(s => s.trim());
  };

  const header = split(lines[0]);
  const rows = lines.slice(1).map(split);
  return { header, rows };
}

function pickRecentAndNext(rows) {
  // columns: 年月日,曜日,対戦球団,スコア,先発投手
  const played = rows.filter(r => (r[2] || "").trim() && (r[3] || "").trim());
  const planned = rows.filter(r => (r[2] || "").trim() && !(r[3] || "").trim());

  const recent = played.slice(-7).reverse();
  const next = planned.slice(0, 7);
  return { recent, next };
}

function table(title, rows) {
  if (!rows.length) return `<div class="card"><div class="h2">${esc(title)}</div><div class="sub">該当データがありません。</div></div>`;
  const trs = rows.map(r => {
    const date = esc(r[0] || "");
    const opp = esc(r[2] || "");
    const score = esc(r[3] || "");
    const sp = esc(r[4] || "");
    return `<tr><td>${date}</td><td>${opp}</td><td>${score}</td><td>${sp}</td></tr>`;
  }).join("");
  return `
    <div class="card">
      <div class="h2">${esc(title)}</div>
      <table class="tbl">
        <thead><tr><th>年月日</th><th>対戦相手</th><th>結果</th><th>先発</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  `;
}

export async function onRequest(context) {
  try {
    if (context.request.method !== "GET") return htmlResponse("", { status: 405 });

    // games.csv を静的アセットから取得
    const reqUrl = new URL(context.request.url);
    const csvRes = await context.env.ASSETS.fetch(new Request(reqUrl.origin + "/data/games.csv"));
    const csvText = await csvRes.text();

    const { rows } = parseCsv(csvText);
    const { recent, next } = pickRecentAndNext(rows);

    const body = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>成績・試合結果 | 読売ジャイアンツ 良かったところメモ</title>
  <meta name="description" content="試合結果・順位・個人成績をまとめて確認できます。" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="theme-color" content="#f7f7f7" />
  <link rel="stylesheet" href="/assets/style.css" />
</head>
<body>
  <header class="wrap">
    <div class="nav">
      <div>
        <h1>成績・試合結果</h1>
      </div>
      <div class="nav-links">
        <a class="btn" href="/">メモ一覧</a>
        <a class="btn" href="/about">このサイトについて</a>
      </div>
    </div>

    <div class="tabs">
      <a class="tab on" href="#games">試合結果</a>
      <a class="tab" href="#calendar">カレンダー</a>
      <a class="tab" href="#standings">順位</a>
      <a class="tab" href="#batters">打者</a>
      <a class="tab" href="#pitchers">投手</a>
    </div>
  </header>

  <main class="wrap">
    <section id="games">
      ${table("最近7試合", recent)}
      ${table("今後1週間", next)}
    </section>

    <div id="state" class="state" hidden></div>

    <!-- 既存のJSで、カレンダー/順位/個人成績などを表示 -->
    <div id="appStats" class="card" style="margin-top: 12px;">
      <div class="sub">詳細表示は読み込み後に反映されます。</div>
    </div>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ ・ <a href="/">メモ一覧</a></small>
  </footer>

  <script src="/assets/stats.js" defer></script>
</body>
</html>`;
    return htmlResponse(body);
  } catch (e) {
    const msg = esc(String(e?.message || e));
    const body = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>成績・試合結果</title><link rel="stylesheet" href="/assets/style.css">
<body class="wrap"><h1>成績・試合結果</h1><div class="card"><div class="sub">表示に失敗しました：${msg}</div></div><p><a class="btn" href="/">メモ一覧へ</a></p></body></html>`;
    return htmlResponse(body, { status: 500 });
  }
}
