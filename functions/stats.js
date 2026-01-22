// SSR: /stats（JSが動かない環境でも最低限の試合結果を見せる）

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function parseCSV(text){
  const lines = text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>l.trim().length);
  if(!lines.length) return [];

  const head = lines[0].split(",").map(h=>h.trim());
  const rows = [];

  for(let i=1;i<lines.length;i++){
    const line = lines[i];
    // シンプルにCSV（このプロジェクトの書き出し想定）
    const cols = line.split(",");
    const obj = {};
    for(let c=0;c<head.length;c++) obj[head[c]] = (cols[c] ?? "").trim();
    rows.push(obj);
  }
  return rows;
}

function toISODate(s){
  // games.csv: date は YYYY-MM-DD 想定。念のため軽く補正
  const m = String(s ?? "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(!m) return "";
  const y = m[1];
  const mo = m[2].padStart(2,"0");
  const d = m[3].padStart(2,"0");
  return `${y}-${mo}-${d}`;
}

function fmtMD(iso){
  const m = String(iso).match(/\d{4}-(\d{2})-(\d{2})/);
  if(!m) return "";
  return `${m[1]}/${m[2]}`;
}

function buildRecent7(games){
  const played = games
    .map(g=>({ ...g, _d: toISODate(g.date) }))
    .filter(g=>g._d && (g.result || g.giants || g.opp))
    .sort((a,b)=>a._d.localeCompare(b._d));
  return played.slice(-7).reverse();
}

function buildNextWeek(games){
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const t7 = new Date(t0); t7.setDate(t0.getDate()+7);

  const upcoming = games
    .map(g=>({ ...g, _d: toISODate(g.date) }))
    .filter(g=>g._d && !g.result && (!g.giants && !g.opp))
    .filter(g=>{
      const d = new Date(g._d+"T00:00:00");
      return d >= t0 && d < t7;
    })
    .sort((a,b)=>a._d.localeCompare(b._d));

  return upcoming;
}

function resultText(g){
  if(g.result) return esc(g.result);
  if(g.giants && g.opp){
    const gi = String(g.giants).trim();
    const op = String(g.opp).trim();
    return `${esc(gi)}-${esc(op)}`;
  }
  return "";
}

function gamesTable(rows){
  if(!rows.length){
    return `<div class="state">該当データがありません。</div>`;
  }
  const body = rows.map(g=>`
    <tr>
      <td>${esc(fmtMD(g._d || g.date))}</td>
      <td>${esc(g.opponent || "")}</td>
      <td>${esc(resultText(g))}</td>
      <td>${esc(g.starter || "")}</td>
    </tr>
  `).join("");
  return `
  <div class="tableScroll">
    <table class="tbl">
      <thead>
        <tr>
          <th>年月日</th>
          <th>対戦相手</th>
          <th>結果</th>
          <th>先発</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

export async function onRequestGet(context){
  // データ読み込み（無ければ空でOK）
  let games = [];
  try{
    const url = new URL(context.request.url);
    const csvUrl = new URL("/data/games.csv", url.origin);
    const res = await context.env.ASSETS.fetch(csvUrl.toString());
    if(res.ok){
      const text = await res.text();
      games = parseCSV(text);
    }
  }catch(_e){
    games = [];
  }

  const recent7 = buildRecent7(games);
  const nextWeek = buildNextWeek(games);

  const recentHtml = gamesTable(recent7);
  const nextHtml = gamesTable(nextWeek);

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>成績・試合結果 | 読売ジャイアンツ 良かったところメモ</title>
  <meta name="description" content="読売ジャイアンツの試合結果・順位・個人成績をまとめて確認できます。" />
  <link rel="icon" href="/assets/icon-512.png" />
  <link rel="stylesheet" href="/assets/style.css" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="/stats" />
  <script src="/assets/seo.js" defer></script>
</head>
<body>
  <header class="wrap">
    <div class="head">
      <h1>成績・試合結果</h1>
      <nav class="nav">
        <a href="/">メモ一覧</a>
        <a href="/about">このサイトについて</a>
      </nav>
    </div>

    <div class="tabs" role="tablist" aria-label="成績タブ">
      <button class="tabbtn active" data-tab="games" type="button">試合結果</button>
      <button class="tabbtn" data-tab="calendar" type="button">カレンダー</button>
      <button class="tabbtn" data-tab="standings" type="button">順位</button>
      <button class="tabbtn" data-tab="batters" type="button">打者</button>
      <button class="tabbtn" data-tab="pitchers" type="button">投手</button>
    </div>

    <div class="controls">
      <input id="statsQ" class="input" placeholder="検索（名前/内容）" autocomplete="off" />
      <select id="opp" class="input">
        <option value="">対戦相手：全部</option>
      </select>
      <div id="statsExtra" class="row">
        <button id="qualBtn" class="btn" type="button" title="規定到達者だけ表示">規定だけ</button>
        <select id="sortSel" class="input" title="並び替え">
          <option value="">並び替え：なし</option>
        </select>
        <button id="sortDirBtn" class="btn" type="button">大きい順</button>
        <button id="sortClearBtn" class="btn ghost" type="button">解除</button>
      </div>
    </div>
  </header>

  <main class="wrap">
    <div id="ssrCards" class="grid2">
      <section class="card">
        <div class="h2">最近7試合</div>
        ${recentHtml}
      </section>
      <section class="card">
        <div class="h2">今後1週間</div>
        ${nextHtml}
        <div class="sub" style="margin-top:10px">※順位・個人成績などの詳細は、読み込み後に反映されます。</div>
      </section>
    </div>

    <div id="statsState" class="state" hidden></div>

    <div id="tableWrap" class="card tableScroll" hidden>
      <div id="statsInfo" class="sub" style="margin-bottom:10px"></div>
      <table id="tbl" class="tbl" aria-label="成績テーブル"></table>
    </div>

    <div id="calendarWrap" class="card" hidden>
      <div class="calTop">
        <button id="calPrev" class="btn" type="button">前の月</button>
        <div id="calMonth" class="h2" style="margin:0"></div>
        <button id="calNext" class="btn" type="button">次の月</button>
      </div>
      <div id="calHint" class="sub" style="margin-top:10px"></div>
      <div id="calGrid" class="calGrid"></div>
    </div>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ ・ <a href="/about">このサイトについて</a></small>
  </footer>

  <script type="module" src="/assets/stats.js"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    }
  });
}
