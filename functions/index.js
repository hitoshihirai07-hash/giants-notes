// SSR: トップ（JSが動かない環境でも最低限の一覧を出す）

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function parseCSV(text){
  const lines = text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>l.trim().length);
  if(!lines.length) return [];
  const head = splitCSVLine(lines[0]);
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cols = splitCSVLine(lines[i]);
    const obj = {};
    for(let j=0;j<head.length;j++) obj[head[j]] = cols[j] ?? "";
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line){
  const out=[]; let cur=""; let q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(q){
      if(ch==='"'){
        if(line[i+1]==='"'){ cur+='"'; i++; }
        else q=false;
      }else cur+=ch;
    }else{
      if(ch===','){ out.push(cur); cur=""; }
      else if(ch==='"') q=true;
      else cur+=ch;
    }
  }
  out.push(cur);
  return out;
}

function pickTags(tags){
  return String(tags??"").split(/[,\s]+/).map(s=>s.trim()).filter(Boolean);
}

function fmtDate(iso){
  const m = String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return esc(iso);
  return `${m[1]}/${m[2]}/${m[3]}`;
}

export async function onRequest({ env, request }){
  const url = new URL(request.url);
  const base = url.origin;

  let posts=[];
  try{
    const res = await fetch(`${base}/data/posts_index.json`, { headers: { "User-Agent": "cf-worker" } });
    if(res.ok){
      const idx = await res.json();
      const ids = Array.isArray(idx?.ids) ? idx.ids : [];
      const limited = ids.slice(0, 30);
      // posts/*.json をまとめて取得
      posts = (await Promise.all(limited.map(async id => {
        try{
          const r = await fetch(`${base}/data/posts/${id}.json`, { headers: { "User-Agent": "cf-worker" } });
          if(!r.ok) return null;
          const j = await r.json();
          return { id, ...(j||{}) };
        }catch(e){ return null; }
      }))).filter(Boolean);
    }
  }catch(e){ /* ignore */ }

  // 新しい順っぽく（idに日付が含まれる前提）
  posts.sort((a,b)=> String(b.id).localeCompare(String(a.id)));

  const tagSet = new Set();
  for(const p of posts){
    for(const t of pickTags(p.tags)) tagSet.add(t);
  }
  const tags = Array.from(tagSet).sort((a,b)=>a.localeCompare(b,'ja'));

  const listHtml = posts.length ? posts.map(p => {
    const title = esc(p.title || "(無題)");
    const date = fmtDate(p.date || p.id?.slice(0,10) || "");
    const excerpt = esc((p.body||"").replace(/\s+/g," ").trim()).slice(0, 120);
    const tagPills = pickTags(p.tags).slice(0, 6).map(t=>`<span class="pill">${esc(t)}</span>`).join(" ");
    return `
      <a class="card" href="/post?id=${encodeURIComponent(p.id)}">
        <div class="meta">${date}</div>
        <div class="h2">${title}</div>
        ${excerpt ? `<div class="sub">${excerpt}</div>` : ``}
        ${tagPills ? `<div class="pills">${tagPills}</div>` : ``}
      </a>
    `;
  }).join("") : `<div class="card"><div class="state">まだ投稿がありません。</div></div>`;

  const tagOpts = tags.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>読売ジャイアンツ 良かったところメモ</title>
  <meta name="description" content="読売ジャイアンツの良かった場面を記録する個人メモサイト。" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="theme-color" content="#f7f7f7" />
  <link rel="stylesheet" href="/assets/style.css" />
  <script src="/assets/seo.js" defer></script>
</head>
<body>
  <header class="wrap">
    <div class="head">
      <h1>読売ジャイアンツ 良かったところメモ</h1>
      <nav class="nav">
        <a href="/stats">成績・試合結果</a>
        <a href="/about">このサイトについて</a>
      </nav>
    </div>

    <div class="controls">
      <input id="q" class="input" placeholder="検索（選手名/用語/タイトル）" autocomplete="off" />
      <select id="tag" class="input">
        <option value="">タグ：全部</option>
        ${tagOpts}
      </select>
    </div>
  </header>

  <main class="wrap">
    <div id="state" class="state" hidden></div>
    <div id="list" class="list">${listHtml}</div>
  </main>

  <footer class="wrap foot">
    <small>© 読売ジャイアンツ 良かったところメモ ・ <a href="/about">このサイトについて</a></small>
  </footer>

  <script src="/assets/app.js"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 投稿更新を拾いやすく（ただし過度に短くしない）
      "Cache-Control": "public, max-age=60"
    }
  });
}
