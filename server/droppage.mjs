// The drag-and-drop page at http://localhost:<port>/drop: send files to the phone,
// see what the phone has sent to this computer.
export function dropPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent Bridge Transfer</title>
<style>
:root{--bg:#0a0b0d;--card:#15171c;--card2:#1c1f25;--line:#262a31;--fg:#f2f4f7;--muted:#9aa3af;--faint:#6b7380;--acc:#3ddc97;--on:#06140e;--err:#f87171}
@media (prefers-color-scheme:light){:root{--bg:#f6f7f9;--card:#fff;--card2:#f0f2f5;--line:#e3e6eb;--fg:#111418;--muted:#5b6370;--faint:#8a919c;--acc:#0f9d63;--on:#fff;--err:#c0392b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}
header{display:flex;align-items:center;gap:12px}
.mark{width:36px;height:36px;border-radius:10px;background:var(--card);border:1px solid var(--line);display:grid;place-items:center;font:600 15px ui-monospace,Consolas,monospace;color:var(--acc)}
h1{font-size:20px;margin:0}
.sub{color:var(--muted);font-size:13px}
#phone{margin-left:auto;font-size:13px;color:var(--muted);display:flex;align-items:center;gap:8px}
#phone i{width:8px;height:8px;border-radius:50%;background:var(--faint)}
#phone.on i{background:var(--acc);box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 25%,transparent)}
.zone{display:block;margin-top:24px;border:1.5px dashed var(--line);border-radius:16px;background:var(--card);padding:48px 16px;text-align:center;cursor:pointer;transition:.15s}
.zone.over{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 8%,var(--card))}
.zone b{display:block;font-size:17px}
.zone span{color:var(--muted);font-size:13px}
.btn{display:inline-block;margin-top:14px;background:var(--acc);color:var(--on);border:0;border-radius:10px;padding:9px 16px;font-weight:600;font-size:14px;cursor:pointer}
h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:32px 4px 10px}
.list{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid var(--line)}
.row:first-child{border-top:0}
.row .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .m{color:var(--muted);font-size:13px;white-space:nowrap}
.bar{height:3px;background:var(--card2);border-radius:2px;overflow:hidden;margin-top:6px}
.bar i{display:block;height:100%;width:0;background:var(--acc);transition:width .2s}
.empty{padding:16px;color:var(--muted);font-size:14px}
.ok{color:var(--acc)}.bad{color:var(--err)}
code{font:13px ui-monospace,Consolas,monospace;color:var(--muted);word-break:break-all}
</style></head><body><main>
<header><div class="mark">&gt;_</div><div><h1>Transfer</h1><div class="sub">Between this computer and your phone</div></div>
<div id="phone"><i></i><span>Checking…</span></div></header>

<label class="zone" id="zone"><input type="file" id="pick" multiple hidden>
<b>Drop files to send to your phone</b><span>They land in Downloads / Agent Bridge on the phone</span><br><span class="btn">Choose files</span></label>

<h2>Sending</h2><div class="list" id="out"><div class="empty">Nothing sent yet.</div></div>
<h2>Received from the phone</h2><div class="list" id="in"><div class="empty">Loading…</div></div>
<p class="sub" style="margin:10px 4px">Saved in <code id="folder"></code>. On the phone: Agent Bridge → Transfer → Send to computer, or Share → Agent Bridge from any app.</p>
</main><script>
const fmt=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':n<1073741824?(n/1048576).toFixed(1)+' MB':(n/1073741824).toFixed(2)+' GB';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const out=document.getElementById('out'),zone=document.getElementById('zone');
function send(file){
  if(out.querySelector('.empty'))out.innerHTML='';
  const row=document.createElement('div');row.className='row';
  row.innerHTML='<div class="n">'+esc(file.name)+'<div class="bar"><i></i></div></div><div class="m">'+fmt(file.size)+'</div>';
  out.prepend(row);
  const bar=row.querySelector('.bar i'),m=row.querySelector('.m');
  const x=new XMLHttpRequest();x.open('POST','/files/drop?name='+encodeURIComponent(file.name));
  x.upload.onprogress=e=>{if(e.lengthComputable)bar.style.width=(e.loaded/e.total*90)+'%'};
  x.onload=()=>{let r={};try{r=JSON.parse(x.responseText)}catch{}
    if(r.ok){bar.style.width='100%';m.innerHTML='<span class="ok">On phone</span>';m.title=r.result&&r.result.saved||''}
    else{m.innerHTML='<span class="bad">'+esc(r.error||'Failed')+'</span>'}};
  x.onerror=()=>{m.innerHTML='<span class="bad">Failed</span>'};
  x.send(file);
}
const many=fs=>[...fs].forEach(send);
document.getElementById('pick').onchange=e=>many(e.target.files);
['dragenter','dragover'].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.add('over')}));
['dragleave','drop'].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.remove('over')}));
zone.addEventListener('drop',e=>many(e.dataTransfer.files));
async function poll(){
  try{const s=(await (await fetch('/status')).json()).result,p=s.phones[0],el=document.getElementById('phone');
    el.className=p?'on':'';el.querySelector('span').textContent=p?(p.deviceName||p.model)+' · '+p.via:'No phone connected';}catch{}
  try{const r=(await (await fetch('/files/received')).json()).result;document.getElementById('folder').textContent=r.folder;
    document.getElementById('in').innerHTML=r.files.length?r.files.map(f=>'<div class="row"><div class="n">'+esc(f.name)+'</div><div class="m">'+fmt(f.size)+' · '+new Date(f.time).toLocaleTimeString()+'</div></div>').join(''):'<div class="empty">Nothing yet.</div>';}catch{}
  setTimeout(poll,2000)}
poll();
</script></body></html>`;
}
