// SSR: /posts/ (render list server-side)

function esc(s){
  return String(s??"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

function normalizePosts(json){
  if(!Array.isArray(json)) return [];
  return json
    .filter(p=>p && p.slug)
    .map(p=>({
      slug:String(p.slug),
      title:String(p.title||""),
      datetime:String(p.datetime||p.date||""),
      info:String(p.info||""),
      excerpt:String(p.excerpt||""),
      tags:Array.isArray(p.tags)?p.tags.map(String):[],
      hidden:!!p.hidden,
    }))
    .filter(p=>!p.hidden)
    .sort((a,b)=>String(b.datetime).localeCompare(String(a.datetime)));
}

function metaLine(p){
  const parts=[];
  if(p.datetime) parts.push(`<span>${esc(p.datetime)}</span>`);
  if(p.info) parts.push(`<span>\u30fb ${esc(p.info)}</span>`);
  for(const t of (p.tags||[]).slice(0,8)) parts.push(`<span class="tag">${esc(t)}</span>`);
  return parts.join("");
}

function renderList(posts){
  if(!posts.length){
    return `<div class="card"><div class="state">\u307e\u3060\u3042\u308a\u307e\u305b\u3093</div></div>`;
  }
  return posts.map(p=>{
    const href = "/posts/"+encodeURIComponent(p.slug);
    const title = esc(p.title||"(\u7121\u984c)");
    const meta = metaLine(p);
    const excerpt = p.excerpt ? `<p class="sub" style="margin-top:10px;">${esc(p.excerpt)}</p>` : "";
    return `\n<div class="card">\n  <a href="${href}"><strong>${title}</strong></a>\n  <div class="meta">${meta}</div>\n  ${excerpt}\n</div>`;
  }).join("\n");
}

async function loadText(context, path, origin){
  const u = new URL(path, origin);
  const res = await context.env.ASSETS.fetch(u.toString(), { headers: { "cache-control": "no-store" } });
  if(!res.ok) throw new Error("asset fetch failed: "+path);
  return await res.text();
}

async function loadJson(context, path, origin){
  const u = new URL(path, origin);
  const res = await context.env.ASSETS.fetch(u.toString(), { headers: { "cache-control": "no-store" } });
  if(!res.ok) throw new Error("asset fetch failed: "+path);
  return await res.json();
}

function inject(html, stateText, listHtml){
  // state: <p id="state" class="sub">...</p>
  html = html.replace(/<p\s+id="state"\s+class="sub">[\s\S]*?<\/p>/, `<p id="state" class="sub">${stateText}</p>`);
  // list: <div id="list" class="list">...</div>
  html = html.replace(/<div\s+id="list"\s+class="list">[\s\S]*?<\/div>/, `<div id="list" class="list">${listHtml}</div>`);
  return html;
}

export async function onRequestGet(context){
  const url = new URL(context.request.url);
  let tpl;
  let posts=[];
  try{
    tpl = await loadText(context, "/posts/index.html", url.origin);
  }catch(_e){
    tpl = "<!doctype html><meta charset=\"utf-8\"><title>posts</title><body><div id=\"list\"></div>";
  }
  try{
    const json = await loadJson(context, "/posts/posts.json", url.origin);
    posts = normalizePosts(json);
  }catch(_e){
    posts = [];
  }
  const listHtml = renderList(posts);
  const html = inject(tpl, "", listHtml);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } });
}

export async function onRequest(context){
  if(context.request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  return onRequestGet(context);
}
