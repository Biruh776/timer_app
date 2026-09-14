/* still — core
 *
 * Utilities, timer state, canvas setup, audio, the render loop and the controls.
 * The drawing lives in scenes.js. Both files share one global scope on purpose:
 * it keeps the scene code short, and it means you can poke at the running app
 * from the browser console (try `S.scene = 'fuse'` or `S.minutes = 1`).
 *
 * Two rules the whole thing depends on — see README.md before changing them:
 *   1. Elapsed time comes from timestamps, never from counting frames.
 *   2. Every scene keeps something moving even when progress is standing still.
 */

'use strict';

/* ---------------------------------------------------------------- utils */
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const lerp  = (a,b,t)=>a+(b-a)*t;
const ease  = t=>t*t*(3-2*t);
const rnd   = (a,b)=>a+Math.random()*(b-a);
const rgb   = (c,a=1)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const mixc  = (a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];

const store = {
  get(k,d){ try{ const v=localStorage.getItem('still.'+k); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('still.'+k, JSON.stringify(v)); }catch(e){} }
};

/* ---------------------------------------------------------------- state */
const SCENES = ['water','candle','fuse','sunset','flood','trickle'];
const MINUTES = [5,10,15,20,25,30,45,60,90,120];

// Ten quiet, clean-reading type stacks — all system faces, so the app stays
// dependency-free and works straight off the filesystem. Each is a fallback
// chain, since no single face ships on every platform.
const FONTS = [
  { id:'serif',     label:'serif',     stack:'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif' },
  { id:'book',       label:'book',      stack:'Georgia, Cambria, "Times New Roman", Times, serif' },
  { id:'garamond',   label:'garamond',  stack:'"EB Garamond", Garamond, "Apple Garamond", Baskerville, "Book Antiqua", "Palatino Linotype", serif' },
  { id:'literary',   label:'literary',  stack:'"New York", ui-serif, Charter, "Bitstream Charter", Cambria, Georgia, serif' },
  { id:'didone',     label:'didone',    stack:'Didot, "Bodoni MT", "Bodoni 72", "Hoefler Text", Georgia, serif' },
  { id:'sans',       label:'sans',      stack:'"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id:'native',     label:'native',    stack:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id:'geometric',  label:'geometric', stack:'"Century Gothic", "Avenir Next", Avenir, Futura, "Segoe UI", sans-serif' },
  { id:'rounded',    label:'rounded',   stack:'ui-rounded, "SF Pro Rounded", "Segoe UI Rounded", "Segoe UI", sans-serif' },
  { id:'mono',       label:'mono',      stack:'ui-monospace, "SF Mono", "Cascadia Code", "Cascadia Mono", Consolas, "Roboto Mono", monospace' }
];

const S = {
  scene:    store.get('scene','water'),
  font:     store.get('font','serif'),
  minutes:  store.get('minutes',15),
  autoZen:  store.get('autoZen',true),
  running:false,
  preview:false,
  elapsed:0,        // ms banked while paused
  startedAt:0,      // epoch ms of virtual start
  finishedAt:null,  // epoch ms the timer completed
  zen:false
};
if(!SCENES.includes(S.scene)) S.scene='water';
if(!FONTS.some(f=>f.id===S.font)) S.font='serif';
if(!MINUTES.includes(S.minutes)) S.minutes=15;

function applyFont(id){
  const f = FONTS.find(x=>x.id===id) || FONTS[0];
  document.documentElement.style.setProperty('--font', f.stack);
}
applyFont(S.font);

const durationMs = () => S.preview ? 30000 : S.minutes*60000;
const elapsedMs  = () => S.running ? (Date.now()-S.startedAt) : S.elapsed;
const progress   = () => clamp(elapsedMs()/durationMs(),0,1);

/* ---------------------------------------------------------------- canvas */
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let W=0,H=0;

function resize(){
  const d = Math.min(window.devicePixelRatio||1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W*d); cv.height = Math.round(H*d);
  ctx.setTransform(d,0,0,d,0,0);
  buildGeometry();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize,120));

/* ---------------------------------------------------------------- audio */
let AC=null, scheduled=[];

function audio(){
  if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
  if(AC.state==='suspended') AC.resume();
  return AC;
}

// A struck bowl: a fundamental plus inharmonic partials, long exponential decay.
function bowl(at, freq, gain, decay){
  const ac = AC; if(!ac) return;
  const partials=[[1,1],[2.74,0.42],[5.38,0.18],[8.9,0.07]];
  for(const [mult,amp] of partials){
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(freq*mult, at);
    // a touch of downward drift, the way a real bowl sags as it rings out
    o.frequency.exponentialRampToValueAtTime(freq*mult*0.995, at+decay);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain*amp, at+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at+decay*(1-0.09*mult/8.9));
    o.connect(g).connect(ac.destination);
    o.start(at); o.stop(at+decay+0.2);
    scheduled.push(o);
  }
}

function clearScheduled(){
  for(const o of scheduled){ try{ o.stop(); }catch(e){} }
  scheduled = [];
}

/* The audio clock is what makes the chime survive a hidden tab, but handing it a
   two-hour appointment is asking a lot of it. So we wait until the end is close,
   then schedule precisely. */
let armed=false, armTimer=null;
const ARM_LEAD=600000;   // ten minutes of chances, even if the tab is throttled to one tick a minute

function armLoop(){
  if(!S.running || armed) return;
  const rem=durationMs()-(Date.now()-S.startedAt);
  if(rem>0 && rem<=ARM_LEAD){ scheduleEndChime(rem/1000); armed=true; }
}
function startArming(){
  armed=false; clearInterval(armTimer); clearScheduled();
  armLoop();
  armTimer=setInterval(armLoop, 15000);
}
function stopArming(){ armed=false; clearInterval(armTimer); clearScheduled(); }

// Scheduled on the audio clock, so it still rings if the tab is hidden.
function scheduleEndChime(secondsFromNow){
  const ac = audio(); if(!ac) return;
  const t0 = ac.currentTime + Math.max(0.05, secondsFromNow);
  bowl(t0,        174, 0.26, 7.5);
  bowl(t0+2.9,    174, 0.19, 7.0);
  bowl(t0+6.0,    116, 0.16, 9.0);
}
function startTone(){
  const ac = audio(); if(!ac) return;
  bowl(ac.currentTime+0.02, 116, 0.13, 4.5);
}

/* ---------------------------------------------------------------- wake lock */
let wakeLock=null;
async function acquireWake(){
  try{ if('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }catch(e){}
}
function releaseWake(){ try{ wakeLock && wakeLock.release(); }catch(e){} wakeLock=null; }
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && S.running){ acquireWake(); armLoop(); }
});

/* ---------------------------------------------------------------- loop */
let last=performance.now();
function frame(now){
  let dt=(now-last)/1000; last=now;
  dt=clamp(dt,0,0.05);
  const t=now/1000;

  // completion is decided by the clock, never by frame count
  if(S.running && Date.now()-S.startedAt >= durationMs()) finish();

  const p=progress();
  const fin = S.finishedAt===null ? null : (Date.now()-S.finishedAt)/1000;

  switch(S.scene){
    case 'water':   drawWater(p,t,fin); break;
    case 'candle':  drawCandle(p,t,fin,dt); break;
    case 'fuse':    drawFuse(p,t,fin,dt); break;
    case 'sunset':  drawSunset(p,t,fin); break;
    case 'flood':   drawFlood(p,t,fin); break;
    case 'trickle': drawTrickle(p,t,fin); break;
  }

  // vignette everywhere but the sunset, which has its own light
  if(S.scene!=='sunset'){
    const v=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.30,W/2,H/2,Math.max(W,H)*0.78);
    v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,0.55)');
    ctx.fillStyle=v; ctx.fillRect(0,0,W,H);
  }

  paintClock();
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- clock ui */
const clockEl=document.getElementById('clock');
function paintClock(){
  const rem=Math.max(0, durationMs()-elapsedMs());
  const s=Math.ceil(rem/1000);
  const txt=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  if(clockEl.textContent!==txt) clockEl.textContent=txt;
  clockEl.classList.toggle('idle', !S.running);
}

/* ---------------------------------------------------------------- controls */
const btnStart=document.getElementById('start');
const btnReset=document.getElementById('reset');
const btnZen=document.getElementById('zen');
const btnAuto=document.getElementById('autozen');
let zenTimer=null;

function begin(){
  if(S.running) return;
  if(S.finishedAt!==null){ S.elapsed=0; S.finishedAt=null; S.preview=false; resetSceneMemory(); }
  audio(); startTone();
  S.startedAt=Date.now()-S.elapsed;
  S.running=true;
  btnStart.textContent='pause';
  acquireWake();
  startArming();
  if(S.autoZen){ clearTimeout(zenTimer); zenTimer=setTimeout(()=>setZen(true), 2400); }
}
function pause(){
  if(!S.running) return;
  S.elapsed=Date.now()-S.startedAt;
  S.running=false;
  btnStart.textContent='resume';
  stopArming(); releaseWake(); clearTimeout(zenTimer);
}
function reset(){
  clearTimeout(zenTimer); stopArming(); releaseWake();
  S.running=false; S.preview=false; S.elapsed=0; S.finishedAt=null;
  btnStart.textContent='begin';
  resetSceneMemory();
  setZen(false);
}
function finish(){
  S.elapsed=durationMs();
  S.running=false;
  S.finishedAt=S.startedAt+durationMs();
  btnStart.textContent='begin';
  if(!armed){ audio(); scheduleEndChime(0); }   // last resort if arming never ran
  clearInterval(armTimer); armed=false;
  releaseWake();
  // let the ending play out in full, then bring the controls back;
  // the finished scene stays on screen until you begin or reset
  clearTimeout(zenTimer);
  zenTimer=setTimeout(()=>setZen(false), 12000);
}
function setZen(on){
  S.zen=on;
  document.body.classList.toggle('zen', on);
  btnZen.classList.toggle('on', on);
}

btnStart.addEventListener('click', ()=> S.running?pause():begin());
btnReset.addEventListener('click', reset);
btnZen.addEventListener('click', ()=>setZen(!S.zen));
btnAuto.addEventListener('click', ()=>{
  S.autoZen=!S.autoZen;
  btnAuto.setAttribute('aria-pressed', String(S.autoZen));
  store.set('autoZen',S.autoZen);
});
btnAuto.setAttribute('aria-pressed', String(S.autoZen));

// leaving zen: a tap anywhere, or a key
document.getElementById('wake').addEventListener('pointerdown', e=>{ e.preventDefault(); setZen(false); });

// scene buttons
const scenesEl=document.getElementById('scenes');
SCENES.forEach(name=>{
  const b=document.createElement('button');
  b.textContent=name; b.setAttribute('aria-pressed', String(name===S.scene));
  b.addEventListener('click',()=>{
    S.scene=name; store.set('scene',name);       // swapping scenes never touches the clock
    resetSceneMemory();
    [...scenesEl.children].forEach(x=>x.setAttribute('aria-pressed', String(x.textContent===name)));
  });
  scenesEl.appendChild(b);
});

// font buttons — each one previews live in its own face
const fontsEl=document.getElementById('fonts');
FONTS.forEach(f=>{
  const b=document.createElement('button');
  b.textContent=f.label; b.style.fontFamily=f.stack;
  b.setAttribute('aria-pressed', String(f.id===S.font));
  b.addEventListener('click',()=>{
    S.font=f.id; store.set('font',f.id); applyFont(f.id);
    [...fontsEl.children].forEach(x=>x.setAttribute('aria-pressed', String(x===b)));
  });
  fontsEl.appendChild(b);
});

// minute buttons
const minsEl=document.getElementById('mins');
MINUTES.forEach(m=>{
  const b=document.createElement('button');
  b.textContent=m; b.setAttribute('aria-pressed', String(m===S.minutes));
  b.addEventListener('click',()=>{
    S.minutes=m; store.set('minutes',m);
    if(!S.running){ S.elapsed=0; S.finishedAt=null; S.preview=false; btnStart.textContent='begin'; }
    [...minsEl.children].forEach(x=>x.setAttribute('aria-pressed', String(+x.textContent===m)));
  });
  minsEl.appendChild(b);
});

// keys
window.addEventListener('keydown', e=>{
  if(e.target.tagName==='BUTTON' && (e.key===' '||e.key==='Enter')) return;
  const k=e.key.toLowerCase();
  if(k===' '||e.code==='Space'){ e.preventDefault(); S.running?pause():begin(); }
  else if(k==='z'){ setZen(!S.zen); }
  else if(k==='escape'){ setZen(false); }
  else if(k==='r'){ reset(); }
  else if(k==='p'){ reset(); S.preview=true; begin(); }
  else if(k==='f'){ fontsEl.children[(FONTS.findIndex(x=>x.id===S.font)+1)%FONTS.length].click(); }
  else if(k>='1'&&k<='6'){ scenesEl.children[+k-1].click(); }
});

/* ---------------------------------------------------------------- boot */
function start(){
  resize();
  requestAnimationFrame(frame);
}
