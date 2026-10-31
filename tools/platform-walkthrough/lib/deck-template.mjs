/**
 * Dark, glass-style slide deck for the captured steps. One self-contained HTML file:
 * Space = play/pause, ←/→ = previous/next, F = fullscreen. `?record=1` autoplays and sets
 * window.__deckDone when finished (compose.mjs records that run into the video).
 */
export function deckHtml(manifest) {
  const frameHeight = Math.round(1340 * manifest.viewport.height / manifest.viewport.width) + 46;
  const data = {
    baseUrl: manifest.baseUrl, generatedAt: manifest.generatedAt, viewport: manifest.viewport,
    steps: manifest.steps.map(s => ({
      i: s.index, kind: s.kind, file: s.file, path: s.path, title: s.caption, text: s.description,
      heading: s.h1 || s.title, headings: s.headings.slice(0, 3), cursor: s.cursor, click: s.click,
      note: s.note, links: s.links, buttons: s.buttons,
    })),
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>جولة المنصة</title>
<style>
:root{--t900:#073c40;--t700:#0b5f63;--t500:#0e8c93;--t400:#2fa9ad;--t300:#63c4c6;--gold:#d4a72c;--ink:#e9f6f6;--mut:#9fc3c4}
*{box-sizing:border-box;margin:0}
html,body{height:100%;background:#020d0e;overflow:hidden;font-family:"Noto Naskh Arabic","Noto Sans Arabic","Cairo","Tajawal","Segoe UI","DejaVu Sans",Tahoma,sans-serif;color:var(--ink)}
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center;overflow:hidden;
  background:radial-gradient(1200px 800px at 85% -10%,#0d4a4f 0%,transparent 60%),radial-gradient(900px 700px at 0% 110%,#2a2410 0%,transparent 55%),linear-gradient(160deg,#03171a,#05262a 55%,#031214)}
.blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.38;will-change:transform}
.b1{width:620px;height:620px;background:var(--t500);left:-140px;top:-160px;animation:drift 22s ease-in-out infinite alternate}
.b2{width:520px;height:520px;background:var(--gold);right:-120px;bottom:-200px;opacity:.22;animation:drift 28s ease-in-out infinite alternate-reverse}
@keyframes drift{to{transform:translate(120px,90px) scale(1.15)}}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(99,196,198,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(99,196,198,.05) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(circle at 50% 40%,#000 20%,transparent 75%)}
.glass{background:linear-gradient(135deg,rgba(255,255,255,.10),rgba(255,255,255,.03));border:1px solid rgba(160,230,232,.22);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 30px 80px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.16)}
#top{position:absolute;inset:34px 70px auto 70px;display:flex;justify-content:space-between;align-items:center;direction:ltr}
.brand{padding:12px 24px;border-radius:999px;font-size:22px;letter-spacing:.14em;font-weight:700;color:var(--t300);display:flex;gap:14px;align-items:center}
.brand i{width:12px;height:12px;border-radius:50%;background:var(--gold);box-shadow:0 0 14px var(--gold)}
#count{padding:10px 22px;border-radius:999px;font-size:24px;color:var(--mut);font-variant-numeric:tabular-nums}
#frame{position:absolute;left:70px;top:112px;width:1340px;height:{{FH}}px;border-radius:22px;overflow:hidden}
#bar{height:46px;display:flex;align-items:center;gap:10px;padding:0 20px;direction:ltr;background:rgba(2,18,20,.55);border-bottom:1px solid rgba(160,230,232,.16)}
#bar b{width:13px;height:13px;border-radius:50%;display:block}
#addr{margin-left:18px;flex:1;height:28px;border-radius:14px;background:rgba(255,255,255,.07);color:var(--mut);font:15px/28px "DejaVu Sans Mono",monospace;padding:0 16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#shots{position:absolute;left:0;top:46px;width:1340px;height:{{SH}}px;overflow:hidden;background:#fff}
#shots img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .7s ease,transform 5s ease-out;transform:scale(1)}
#shots img.on{opacity:1;transform:scale(1.025)}
#cur{position:absolute;left:0;top:0;width:30px;height:30px;z-index:5;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5));pointer-events:none}
.rip{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid var(--gold);background:rgba(47,169,173,.35);animation:rip .8s ease-out forwards;z-index:4}
@keyframes rip{to{transform:scale(5.5);opacity:0}}
#panel{position:absolute;left:1450px;top:112px;width:400px;height:{{FH}}px;border-radius:22px;padding:34px 30px;display:flex;flex-direction:column;gap:16px}
#kind{align-self:flex-start;font-size:17px;padding:5px 16px;border-radius:999px;background:rgba(212,167,44,.16);color:var(--gold);border:1px solid rgba(212,167,44,.4)}
#ttl{font-size:40px;line-height:1.35;font-weight:800;color:#fff}
#txt{font-size:24px;line-height:1.75;color:var(--ink);opacity:.92}
#heads{font-size:19px;line-height:1.7;color:var(--mut);margin-top:auto}
#heads span{display:inline-block;margin:0 0 6px 8px;padding:2px 12px;border-radius:12px;background:rgba(99,196,198,.12)}
#path{direction:ltr;text-align:left;font:16px "DejaVu Sans Mono",monospace;color:var(--t300);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fade{animation:up .8s cubic-bezier(.2,.7,.2,1) both}@keyframes up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
#prog{position:absolute;left:70px;right:70px;bottom:46px;height:5px;border-radius:5px;background:rgba(255,255,255,.1);direction:ltr}
#prog div{height:100%;width:0;border-radius:5px;background:linear-gradient(90deg,var(--t400),var(--gold));transition:width .5s}
#hint{position:absolute;left:70px;bottom:62px;font-size:16px;color:var(--mut);opacity:.7;direction:ltr}
.card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:26px;text-align:center;z-index:20;background:radial-gradient(900px 600px at 50% 40%,rgba(14,140,147,.32),transparent 70%),linear-gradient(160deg,#03171a,#05262a 55%,#031214)}
.card.on{display:flex;animation:up 1s both}
.card h1{font-size:92px;font-weight:900;line-height:1.25;background:linear-gradient(90deg,#fff,var(--t300) 55%,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent}
.card p{font-size:34px;color:var(--mut)}
.stats{display:flex;gap:30px;margin-top:20px}.stats div{padding:22px 40px;border-radius:20px;font-size:26px}.stats b{display:block;font-size:56px;color:var(--gold)}
</style></head><body>
<div id="stage">
 <div class="blob b1"></div><div class="blob b2"></div><div class="grid"></div>
 <div id="top"><div class="brand glass"><i></i>DIGITAL LEADERSHIP</div><div id="count" class="glass"></div></div>
 <div id="frame" class="glass"><div id="bar"><b style="background:#ff5f57"></b><b style="background:#febc2e"></b><b style="background:#28c840"></b><div id="addr"></div></div>
  <div id="shots"><img id="i0" alt=""><img id="i1" alt=""><svg id="cur" viewBox="0 0 24 24" style="display:none"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#fff" stroke="#073c40" stroke-width="1.6" stroke-linejoin="round"/></svg></div></div>
 <div id="panel" class="glass"><div id="kind"></div><div id="ttl"></div><div id="txt"></div><div id="heads"></div><div id="path"></div></div>
 <div id="prog"><div></div></div><div id="hint">Space ⏯ · ← → · F</div>
 <div id="intro" class="card"><p>DIGITAL LEADERSHIP</p><h1>جولة في منصة القيادة الرقمية</h1><p id="introSub"></p></div>
 <div id="outro" class="card"><h1>شكراً للمشاهدة</h1><div class="stats" id="stats"></div><p id="outroSub"></p></div>
</div>
<script>
const D=${json};
const FW=1340,FH=Math.round(FW*D.viewport.height/D.viewport.width)+46,SH=FH-46,SC=FW/D.viewport.width;
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search),RECORD=q.has("record");
const KIND={page:"صفحة",scroll:"تمرير",tab:"تبويب"};
function fit(){const s=Math.min(innerWidth/1920,innerHeight/1080);$("stage").style.transform="translate(-50%,-50%) scale("+s+")"}
addEventListener("resize",fit);fit();
let cur=-1,layer=0,timer=null,playing=false,cpos={x:140*SC,y:140*SC},introDone=false;
const dur=s=>(s.kind==="page"?4300:3300)+(s.click?900:0);
function show(i,{move=true}={}){
  const s=D.steps[i];cur=i;
  const a=$("i"+layer),b=$("i"+(1-layer));layer=1-layer;
  const next=$("i"+layer);next.src="../shots/"+s.file;next.classList.add("on");a.classList.remove("on");b.classList.remove("on");
  next.style.transform="scale(1)";void next.offsetWidth;next.classList.add("on");
  $("addr").textContent=D.baseUrl.replace(/^https?:\\/\\//,"")+s.path;
  $("count").textContent=String(i+1).padStart(2,"0")+" / "+String(D.steps.length).padStart(2,"0");
  $("kind").textContent=KIND[s.kind]||s.kind;$("ttl").textContent=s.title;$("txt").textContent=s.text;
  $("heads").innerHTML=s.headings.map(h=>"<span>"+h.replace(/[<>&]/g,"")+"</span>").join("");
  $("path").textContent=s.path;
  for(const id of ["kind","ttl","txt","heads","path"]){const e=$(id);e.classList.remove("fade");void e.offsetWidth;e.classList.add("fade")}
  $("prog").firstElementChild.style.width=((i+1)/D.steps.length*100)+"%";
  // Replay the real cursor: glide to where the tour clicked/rested, then ripple on clicks.
  const cu=$("cur");cu.style.display="block";
  const to={x:(s.click?s.click.x:s.cursor.x)*SC,y:(s.click?s.click.y:s.cursor.y)*SC};
  if(move)cu.animate([{transform:"translate("+cpos.x+"px,"+cpos.y+"px)"},{transform:"translate("+to.x+"px,"+to.y+"px)"}],{duration:1100,easing:"cubic-bezier(.45,.05,.2,1)",fill:"forwards"});
  else cu.style.transform="translate("+to.x+"px,"+to.y+"px)";
  if(s.click)setTimeout(()=>{const r=document.createElement("div");r.className="rip";r.style.left=to.x+"px";r.style.top=to.y+"px";$("shots").appendChild(r);setTimeout(()=>r.remove(),900)},1150);
  cpos=to;
}
function schedule(){clearTimeout(timer);if(!playing)return;timer=setTimeout(()=>{if(cur<D.steps.length-1){show(cur+1);schedule()}else finish()},dur(D.steps[cur]))}
function finish(){playing=false;$("outro").classList.add("on");
  const pages=D.steps.filter(s=>s.kind==="page").length;
  $("stats").innerHTML=[[D.steps.length,"لقطة"],[pages,"صفحة"],[D.viewport.width+"×"+D.viewport.height,"الدقة"]].map(x=>'<div class="glass"><b>'+x[0]+'</b>'+x[1]+'</div>').join("");
  $("outroSub").textContent=D.baseUrl.replace(/^https?:\\/\\//,"");
  setTimeout(()=>{window.__deckDone=true},4200)}
function play(){playing=true;schedule()}
function pause(){playing=false;clearTimeout(timer)}
function toggle(){playing?pause():play()}
function go(d){pause();$("outro").classList.remove("on");show(Math.max(0,Math.min(D.steps.length-1,cur+d)))}
addEventListener("keydown",e=>{if(e.code==="Space"){e.preventDefault();toggle()}else if(e.key==="ArrowLeft")go(1);else if(e.key==="ArrowRight")go(-1);else if(e.key==="f"||e.key==="F")document.documentElement.requestFullscreen?.()});
$("stage").addEventListener("click",toggle);
$("introSub").textContent=D.steps.length+" لقطة · "+new Date(D.generatedAt).toLocaleDateString("ar");
$("intro").classList.add("on");
setTimeout(()=>{$("intro").classList.remove("on");show(0,{move:false});if(RECORD||q.has("autoplay"))play()},RECORD?3600:1800);
</script></body></html>`
  .replaceAll("{{FH}}", String(frameHeight)).replaceAll("{{SH}}", String(frameHeight - 46));
}
