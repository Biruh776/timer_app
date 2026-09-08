/* still — scenes
 *
 * Geometry that needs rebuilding on resize, then one draw function per scene.
 *
 * Every draw function has the same signature:
 *   draw(p, t, fin, dt)
 *     p   0..1  how far through the session — drives the thing that depletes
 *     t   sec   a free-running clock — drives idle motion, never progress
 *     fin sec   seconds since the timer finished, or null while it runs
 *     dt  sec   time since the last frame, capped at 50ms — for particles
 *
 * Use p for anything that must survive the tab being hidden, and t or dt for
 * anything that just needs to keep moving.
 */

/* ---------------------------------------------------------------- geometry & scene memory */
let spiral=null, stars=null, clouds=null, bubbles=null, sparks=[], flakes=[], puffs=[];
const flick = {x:0, vx:0, s:1, vs:0, g:1};

function buildGeometry(){
  // spiral fuse
  const cx=W/2, cy=H/2, R=Math.min(W,H)*0.40, turns=4.2, N=1500;
  const pts=[], cum=[0];
  for(let i=0;i<=N;i++){
    const s=i/N, th=s*turns*Math.PI*2;
    let r = Math.max(R*Math.pow(1-s,0.92), 2.5);
    r *= 1 + 0.016*Math.sin(th*2.3);
    pts.push([cx+r*Math.cos(th), cy+r*Math.sin(th)]);
    if(i>0){
      const dx=pts[i][0]-pts[i-1][0], dy=pts[i][1]-pts[i-1][1];
      cum.push(cum[i-1]+Math.hypot(dx,dy));
    }
  }
  spiral={pts,cum,total:cum[cum.length-1],cx,cy};

  // stars
  stars=[];
  for(let i=0;i<170;i++){
    stars.push({x:Math.random()*W, y:Math.random()*H*0.66, r:rnd(0.4,1.4), p:Math.random()*7, tw:rnd(0.5,1.9)});
  }

  // clouds
  clouds=[];
  for(let i=0;i<5;i++){
    clouds.push({x:Math.random()*W, y:H*rnd(0.20,0.52), w:rnd(W*0.16,W*0.42), h:rnd(9,22), v:rnd(2.5,7), a:rnd(0.18,0.42)});
  }

  // bubbles
  bubbles=[];
  for(let i=0;i<26;i++){
    bubbles.push({fx:Math.random(), y:Math.random(), r:rnd(0.9,3.0), v:rnd(0.012,0.045), ph:Math.random()*7});
  }

  sparks=[]; flakes=[]; puffs=[];
  ash.len=0; ash.last=0;
}
const ash = {len:0, last:0};

function resetSceneMemory(){ sparks=[]; flakes=[]; puffs=[]; ash.len=0; ash.last=0; }

/* ================================================================ SCENES */
/* Every scene keeps something moving at all times — at 30 minutes the
   progress-driven part crawls, so idle motion is what keeps it alive. */

/* ---------------------------------------------- shared: smoke ribbon */
function smoke(x0,y0,t,{height,amp,alpha,seed,speed=0.6,width=13,tint=[210,210,215]}){
  const N=34;
  for(let layer=0; layer<3; layer++){
    const ph = seed + layer*2.1, off=(layer-1)*2.2;
    let px=null,py=null;
    for(let i=0;i<=N;i++){
      const f=i/N;
      const y = y0 - f*height;
      const a = amp*Math.pow(f,1.45);
      const x = x0 + off*f
              + a*Math.sin(f*3.0 - t*speed + ph)
              + a*0.45*Math.sin(f*7.1 - t*speed*1.9 + ph*1.7)
              + a*0.2*Math.sin(t*0.31 + ph);
      if(px!==null){
        ctx.beginPath();
        ctx.moveTo(px,py); ctx.lineTo(x,y);
        ctx.lineWidth = 1 + width*Math.pow(f,0.85);
        ctx.strokeStyle = rgb(tint, alpha*(1-f)*(1-f)*0.9);
        ctx.lineCap='round';
        ctx.stroke();
      }
      px=x; py=y;
    }
  }
}

/* ---------------------------------------------- 1. water */
function drawWater(p,t,fin){
  ctx.fillStyle='#06070a'; ctx.fillRect(0,0,W,H);

  const vw = Math.min(W*0.40, H*0.30);
  const vh = Math.min(vw*1.62, H*0.62);
  const cx = W/2, botY = H/2 + vh/2, topY = botY - vh;
  const wTop = vw, wBot = vw*0.87;

  const level = 0.035 + 0.945*p;                 // never quite empty
  const inTop = topY + 12, inBot = botY - 8;
  const surfY = inBot - level*(inBot-inTop);

  const deep=[14,48,66], shal=[46,132,150];

  // ambient glow behind the glass, growing as it fills
  const g0 = ctx.createRadialGradient(cx, H/2, 0, cx, H/2, vh*1.15);
  g0.addColorStop(0, rgb(shal, 0.10+0.16*p));
  g0.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle=g0; ctx.fillRect(0,0,W,H);

  const path = ()=>{
    const r=20;
    ctx.beginPath();
    ctx.moveTo(cx-wTop/2, topY);
    ctx.lineTo(cx-wBot/2, botY-r);
    ctx.quadraticCurveTo(cx-wBot/2, botY, cx-wBot/2+r, botY);
    ctx.lineTo(cx+wBot/2-r, botY);
    ctx.quadraticCurveTo(cx+wBot/2, botY, cx+wBot/2, botY-r);
    ctx.lineTo(cx+wTop/2, topY);
    ctx.closePath();
  };

  // glass body
  path();
  ctx.fillStyle='rgba(255,255,255,0.022)';
  ctx.fill();

  // two sine waves at different speeds — the interference is what sells it
  const A1 = 3.4+1.6*Math.sin(t*0.23), A2 = 2.1;
  const waveY = x => surfY
    + A1*Math.sin(x*0.019 + t*0.9)
    + A2*Math.sin(x*0.041 - t*1.37)
    + 1.1*Math.sin(x*0.008 + t*0.41);

  ctx.save();
  path(); ctx.clip();

  const L=cx-wTop/2-14, R=cx+wTop/2+14;
  ctx.beginPath();
  ctx.moveTo(L, waveY(L));
  for(let x=L; x<=R; x+=4) ctx.lineTo(x, waveY(x));
  ctx.lineTo(R, botY+4); ctx.lineTo(L, botY+4); ctx.closePath();

  const gw = ctx.createLinearGradient(0, surfY, 0, botY);
  gw.addColorStop(0, rgb(shal,0.92));
  gw.addColorStop(0.35, rgb(mixc(shal,deep,0.55),0.94));
  gw.addColorStop(1, rgb(deep,0.97));
  ctx.fillStyle=gw; ctx.fill();

  // light band riding just under the surface
  ctx.beginPath();
  ctx.moveTo(L, waveY(L));
  for(let x=L; x<=R; x+=4) ctx.lineTo(x, waveY(x));
  ctx.strokeStyle='rgba(190,240,250,0.55)'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(L, waveY(L)+7);
  for(let x=L; x<=R; x+=4) ctx.lineTo(x, waveY(x)+7);
  ctx.strokeStyle='rgba(190,240,250,0.13)'; ctx.lineWidth=7; ctx.stroke();

  // bubbles
  for(const b of bubbles){
    b.y -= b.v*0.006;
    if(b.y<0) { b.y=1; b.fx=Math.random(); }
    const bx = cx-wBot/2 + b.fx*wBot + Math.sin(t*0.9+b.ph)*3;
    const by = botY - b.y*(botY-surfY);
    if(by>waveY(bx)+3){
      ctx.beginPath();
      ctx.arc(bx,by,b.r,0,7);
      ctx.fillStyle='rgba(215,245,255,0.30)'; ctx.fill();
    }
  }

  // caustic ripple on the floor
  ctx.globalAlpha=0.10;
  for(let i=0;i<5;i++){
    const rr = 12+i*11 + Math.sin(t*0.7+i)*4;
    ctx.beginPath(); ctx.ellipse(cx, botY-10, rr, rr*0.22, 0, 0, 7);
    ctx.strokeStyle='rgba(200,245,255,1)'; ctx.lineWidth=1.2; ctx.stroke();
  }
  ctx.globalAlpha=1;
  ctx.restore();

  // glass edges
  path();
  ctx.strokeStyle='rgba(233,244,248,0.20)'; ctx.lineWidth=2.2; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx-wTop/2+9, topY+16); ctx.lineTo(cx-wBot/2+11, botY-34);
  ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=4; ctx.lineCap='round'; ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, topY, wTop/2, 7, 0, 0, 7);
  ctx.strokeStyle='rgba(233,244,248,0.26)'; ctx.lineWidth=1.6; ctx.stroke();

  // pool of light on the table
  const gp = ctx.createRadialGradient(cx,botY+8,4,cx,botY+8,vw*1.1);
  gp.addColorStop(0, rgb(shal, 0.14+0.12*p));
  gp.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gp;
  ctx.beginPath(); ctx.ellipse(cx,botY+10,vw*1.05,20,0,0,7); ctx.fill();

  if(fin!==null){
    const k = clamp(fin/3.2,0,1);
    ctx.fillStyle = `rgba(190,240,250,${0.16*(1-k)*Math.max(0,Math.sin(fin*2.2))})`;
    ctx.fillRect(0,0,W,H);
  }
}

/* ---------------------------------------------- 2. candle */
function drawCandle(p,t,fin,dt){
  ctx.fillStyle='#06070a'; ctx.fillRect(0,0,W,H);

  const cw = Math.min(W*0.15, 120);
  const full = Math.min(H*0.40, 340);
  const botY = H*0.74;
  const curH = full*(1-0.70*p);
  const topY = botY - curH;
  const cx = W/2;

  // flicker: a damped random walk, not a sine — sine reads as mechanical
  flick.vx += (rnd(-1,1)*0.9 - flick.x*0.16)*dt*8;
  flick.vx *= 0.90; flick.x += flick.vx*dt*8; flick.x = clamp(flick.x,-4.5,4.5);
  flick.vs += (rnd(-1,1)*0.05 - (flick.s-1)*0.30)*dt*9;
  flick.vs *= 0.88; flick.s += flick.vs*dt*9; flick.s = clamp(flick.s,0.78,1.24);
  flick.g += ((0.85+Math.random()*0.3) - flick.g)*dt*4;

  const alive = fin===null ? 1 : clamp(1-fin/1.9,0,1);
  const wickY = topY - 3;
  const fh = 62*flick.s*alive, fw = 17*flick.s;

  // room glow
  const gr = ctx.createRadialGradient(cx,wickY-fh*0.4,0,cx,wickY-fh*0.4,Math.max(W,H)*0.62);
  gr.addColorStop(0, `rgba(255,178,86,${0.16*flick.g*alive})`);
  gr.addColorStop(0.35, `rgba(200,110,40,${0.05*flick.g*alive})`);
  gr.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);

  // table
  const gt = ctx.createRadialGradient(cx,botY+6,6,cx,botY+6,cw*3.4);
  gt.addColorStop(0, `rgba(255,170,80,${0.20*flick.g*alive})`);
  gt.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gt;
  ctx.beginPath(); ctx.ellipse(cx,botY+8,cw*3.2,26,0,0,7); ctx.fill();

  // body
  const gb = ctx.createLinearGradient(cx-cw/2,0,cx+cw/2,0);
  gb.addColorStop(0,'#6b5c48'); gb.addColorStop(0.30,'#e6d8bd');
  gb.addColorStop(0.55,'#f2e8d2'); gb.addColorStop(1,'#7a6a53');
  ctx.fillStyle=gb;
  ctx.beginPath();
  ctx.moveTo(cx-cw/2, topY); ctx.lineTo(cx-cw/2, botY-6);
  ctx.quadraticCurveTo(cx-cw/2, botY, cx-cw/2+8, botY);
  ctx.lineTo(cx+cw/2-8, botY);
  ctx.quadraticCurveTo(cx+cw/2, botY, cx+cw/2, botY-6);
  ctx.lineTo(cx+cw/2, topY); ctx.closePath(); ctx.fill();

  // warm light thrown on the upper body
  const gu = ctx.createLinearGradient(0,topY,0,topY+90);
  gu.addColorStop(0, `rgba(255,186,110,${0.55*alive})`);
  gu.addColorStop(1,'rgba(255,186,110,0)');
  ctx.fillStyle=gu; ctx.fillRect(cx-cw/2, topY, cw, 90);

  // drips down the side, lengthening
  ctx.fillStyle='rgba(246,236,214,0.92)';
  const drips=[[-0.30,0.9],[0.26,1.25],[-0.09,0.6]];
  for(let i=0;i<drips.length;i++){
    const [ox,sp]=drips[i];
    const len = clamp((p*curH*0.75*sp)-i*8, 0, curH*0.7);
    if(len<=2) continue;
    const dx = cx+ox*cw;
    ctx.beginPath();
    ctx.moveTo(dx-4, topY+2);
    ctx.quadraticCurveTo(dx-6, topY+len*0.6, dx, topY+len);
    ctx.quadraticCurveTo(dx+6, topY+len*0.6, dx+4, topY+2);
    ctx.fill();
  }

  // melted well at the top
  ctx.beginPath(); ctx.ellipse(cx, topY, cw/2, 9, 0,0,7);
  ctx.fillStyle='#f6ecd6'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, topY+1.5, cw/2-7, 5.5, 0,0,7);
  ctx.fillStyle=`rgba(214,166,104,${0.5+0.35*alive})`; ctx.fill();

  // wick
  ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(cx+flick.x*0.25, wickY-6);
  ctx.strokeStyle='#3a2a1c'; ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.stroke();

  if(alive>0.02){
    const tip = flick.x;
    const flame=(w,h,col,al)=>{
      ctx.beginPath();
      ctx.moveTo(cx, wickY);
      ctx.bezierCurveTo(cx-w, wickY-h*0.18, cx-w*0.85, wickY-h*0.62, cx+tip*0.7, wickY-h);
      ctx.bezierCurveTo(cx+w*0.85, wickY-h*0.62, cx+w, wickY-h*0.18, cx, wickY);
      ctx.closePath();
      ctx.fillStyle=`rgba(${col},${al*alive})`; ctx.fill();
    };
    const gl = ctx.createRadialGradient(cx,wickY-fh*0.42,0,cx,wickY-fh*0.42,fh*1.5);
    gl.addColorStop(0,`rgba(255,190,105,${0.34*flick.g*alive})`);
    gl.addColorStop(1,'rgba(255,150,60,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(cx,wickY-fh*0.42,fh*1.5,0,7); ctx.fill();

    flame(fw*1.35, fh*1.16, '255,140,40', 0.30);
    flame(fw,      fh,      '255,178,64', 0.85);
    flame(fw*0.55, fh*0.62, '255,238,180', 0.95);
    flame(fw*0.30, fh*0.20, '120,170,255', 0.55);
  }

  // smoke: a thread while lit, a full curl once it's out
  const sAmp = fin===null ? 5 : 5+22*clamp(fin/2.5,0,1);
  const sAl  = fin===null ? 0.06 : 0.06+0.30*Math.max(0,1-fin/9);
  smoke(cx+flick.x*0.7, wickY-fh-4, t, {height:H*0.30, amp:sAmp, alpha:sAl, seed:1.2, speed:0.55, width:11});
}

/* ---------------------------------------------- 3. fuse */
function drawFuse(p,t,fin,dt){
  ctx.fillStyle='#07060a'; ctx.fillRect(0,0,W,H);
  if(!spiral) return;
  const {pts,cum,total,cx,cy}=spiral;

  const burn = fin===null ? p : 1;
  const at = i => pts[clamp(i,0,pts.length-1)];
  const idxAt = len => {              // arc-length lookup: constant burn speed
    let lo=0, hi=cum.length-1;
    while(lo<hi){ const m=(lo+hi)>>1; if(cum[m]<len) lo=m+1; else hi=m; }
    return lo;
  };
  const head = idxAt(burn*total);
  const [hx,hy] = at(head);

  ctx.save();
  ctx.translate(cx,cy); ctx.rotate(t*0.011); ctx.translate(-cx,-cy);

  // cord still to burn
  ctx.beginPath();
  ctx.moveTo(...at(head));
  for(let i=head; i<pts.length; i+=3) ctx.lineTo(...pts[i]);
  ctx.strokeStyle='#8a7554'; ctx.lineWidth=5; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke();
  ctx.strokeStyle='rgba(40,30,18,0.45)'; ctx.lineWidth=1.6;
  ctx.setLineDash([5,7]); ctx.stroke(); ctx.setLineDash([]);

  // ash behind
  if(head>2){
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    for(let i=0;i<=head;i+=3) ctx.lineTo(...pts[i]);
    ctx.strokeStyle='#221d1a'; ctx.lineWidth=4.4; ctx.stroke();
    ctx.strokeStyle='rgba(120,110,104,0.20)'; ctx.lineWidth=1.4; ctx.stroke();

    // embers still cooling just behind the head
    const tail = idxAt(Math.max(0, burn*total - Math.min(150, total*0.06)));
    for(let i=tail;i<head;i+=2){
      const f=(i-tail)/Math.max(1,head-tail);
      ctx.beginPath(); ctx.moveTo(...pts[i]); ctx.lineTo(...pts[Math.min(i+2,head)]);
      ctx.strokeStyle=`rgba(255,${110+90*f|0},40,${0.55*f*f})`;
      ctx.lineWidth=4.4; ctx.stroke();
    }
  }

  // sparks
  const emit = fin===null ? 3 : Math.max(0, 3-Math.floor(fin*2));
  for(let i=0;i<emit;i++){
    const a=Math.random()*Math.PI*2, sp=rnd(14,68);
    sparks.push({x:hx,y:hy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-26,life:rnd(0.35,1.1),age:0,r:rnd(0.7,1.9)});
  }
  for(let i=sparks.length-1;i>=0;i--){
    const s=sparks[i];
    s.age+=dt; if(s.age>s.life){ sparks.splice(i,1); continue; }
    s.vy += 42*dt; s.vx*=0.985; s.vy*=0.985;
    s.x+=s.vx*dt; s.y+=s.vy*dt;
    const k=1-s.age/s.life;
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r*k,0,7);
    ctx.fillStyle=`rgba(255,${150+80*k|0},70,${k*0.9})`; ctx.fill();
  }

  // the burning head
  if(fin===null || fin<1.2){
    const pulse = 0.85+0.15*Math.sin(t*11)+0.1*Math.random();
    const gh=ctx.createRadialGradient(hx,hy,0,hx,hy,34*pulse);
    gh.addColorStop(0,'rgba(255,235,190,0.95)');
    gh.addColorStop(0.18,'rgba(255,160,60,0.65)');
    gh.addColorStop(1,'rgba(255,110,30,0)');
    ctx.fillStyle=gh; ctx.beginPath(); ctx.arc(hx,hy,34*pulse,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(hx,hy,2.6,0,7); ctx.fillStyle='#fff6e0'; ctx.fill();
  }
  ctx.restore();

  // a last bloom at the centre
  if(fin!==null && fin<3.0){
    const k=1-fin/3.0;
    const gb=ctx.createRadialGradient(cx,cy,0,cx,cy,180*(1-k)+30);
    gb.addColorStop(0,`rgba(255,200,130,${0.45*k*k})`);
    gb.addColorStop(1,'rgba(255,140,50,0)');
    ctx.fillStyle=gb; ctx.fillRect(0,0,W,H);
  }
  if(fin!==null){
    smoke(cx,cy,t,{height:H*0.28, amp:16, alpha:0.16*Math.max(0,1-fin/12), seed:0.4, speed:0.5, width:14});
  }
}

/* ---------------------------------------------- 4. sunset */
const SKY=[
  {p:0.00, top:[ 38,102,158], mid:[130,178,208], low:[244,203,142]},
  {p:0.42, top:[ 39, 74,120], mid:[184,105,122], low:[244,145, 90]},
  {p:0.72, top:[ 27, 36, 80], mid:[ 74, 52,101], low:[160, 90, 95]},
  {p:1.00, top:[  6, 10, 28], mid:[ 13, 18, 48], low:[ 26, 28, 56]}
];
function skyAt(p){
  let i=0; while(i<SKY.length-2 && p>SKY[i+1].p) i++;
  const a=SKY[i], b=SKY[i+1];
  const t=ease(clamp((p-a.p)/(b.p-a.p),0,1));
  return {top:mixc(a.top,b.top,t), mid:mixc(a.mid,b.mid,t), low:mixc(a.low,b.low,t)};
}
function drawSunset(p,t,fin){
  const hz = H*0.66;
  const k = skyAt(p);

  const gs=ctx.createLinearGradient(0,0,0,hz);
  gs.addColorStop(0,rgb(k.top)); gs.addColorStop(0.55,rgb(k.mid)); gs.addColorStop(1,rgb(k.low));
  ctx.fillStyle=gs; ctx.fillRect(0,0,W,hz+1);

  // stars fade in through the second half
  const sa = ease(clamp((p-0.52)/0.44,0,1));
  if(sa>0.01){
    for(const s of stars){
      const tw=0.55+0.45*Math.sin(t*s.tw+s.p);
      ctx.globalAlpha=sa*tw*0.9;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,7);
      ctx.fillStyle='#eef2ff'; ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  // sun
  const R=Math.min(W,H)*0.072;
  const sunX=W*0.5;
  const sunY=lerp(H*0.17, hz+R*1.7, ease(p));
  const warm=mixc([255,226,160],[236,92,60],ease(clamp(p/0.85,0,1)));
  const vis=clamp((hz+R-sunY)/(2*R),0,1);
  if(vis>0){
    const gg=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,R*7);
    gg.addColorStop(0,rgb(warm,0.34*vis)); gg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gg; ctx.fillRect(0,0,W,hz);
    ctx.beginPath(); ctx.arc(sunX,sunY,R,0,7); ctx.fillStyle=rgb(warm,0.98); ctx.fill();
  }

  // clouds, lit from beneath
  for(const c of clouds){
    c.x += c.v*0.016; if(c.x>W+c.w) c.x=-c.w;
    const lit=mixc(k.low,[255,255,255],0.25);
    for(let i=0;i<4;i++){
      ctx.globalAlpha=c.a*(1-0.15*i)*(0.55+0.45*vis);
      ctx.beginPath();
      ctx.ellipse(c.x+i*c.w*0.19-c.w*0.28, c.y+Math.sin(t*0.12+i)*1.6, c.w*0.34, c.h*(1-0.13*i), 0,0,7);
      ctx.fillStyle=rgb(mixc(lit,k.mid,i/5), 1); ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  // sea
  const sea=ctx.createLinearGradient(0,hz,0,H);
  sea.addColorStop(0,rgb(mixc(k.low,[8,12,26],0.42)));
  sea.addColorStop(1,rgb(mixc(k.top,[3,5,14],0.72)));
  ctx.fillStyle=sea; ctx.fillRect(0,hz,W,H-hz);

  // shimmering reflection column
  if(vis>0.02){
    for(let i=0;i<70;i++){
      const f=i/70, y=hz+f*(H-hz)*0.95;
      const spread=8+f*W*0.10;
      const wob=Math.sin(f*24-t*2.1)*spread*0.4;
      const w=spread*(0.45+0.55*Math.abs(Math.sin(f*11+t*1.25)));
      ctx.globalAlpha=(1-f)*0.45*vis;
      ctx.fillStyle=rgb(warm);
      ctx.fillRect(sunX-w/2+wob, y, w, 2.2);
    }
    ctx.globalAlpha=1;
  }

  // haze on the horizon line
  const hzg=ctx.createLinearGradient(0,hz-26,0,hz+16);
  hzg.addColorStop(0,'rgba(0,0,0,0)');
  hzg.addColorStop(0.6,rgb(k.low,0.30*vis+0.06));
  hzg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=hzg; ctx.fillRect(0,hz-26,W,42);

  if(fin!==null){
    const mo=clamp(fin/6,0,1), mx=W*0.74, my=H*0.20;
    const gm=ctx.createRadialGradient(mx,my,0,mx,my,110);
    gm.addColorStop(0,`rgba(226,232,255,${0.20*mo})`); gm.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gm; ctx.fillRect(0,0,W,hz);
    ctx.beginPath(); ctx.arc(mx,my,15,0,7);
    ctx.fillStyle=`rgba(232,236,255,${0.9*mo})`; ctx.fill();
  }
}

/* ---------------------------------------------- 5. incense */
function drawIncense(p,t,fin,dt){
  ctx.fillStyle='#08080b'; ctx.fillRect(0,0,W,H);

  const baseX=W*0.44, baseY=H*0.80;
  const L=Math.min(H*0.42, 330);
  const ang=-Math.PI/2 + 0.20;
  const dx=Math.cos(ang), dy=Math.sin(ang);

  const burnFrac = fin===null ? p : 1;
  const consumed = L*0.62*burnFrac;
  const tipD = L - consumed;
  const tx = baseX + dx*tipD, ty = baseY + dy*tipD;

  // ash builds at the tip, then breaks off
  ash.len = consumed - ash.last;
  if(ash.len > 26){
    flakes.push({x:tx,y:ty,vx:rnd(-6,6),vy:rnd(2,10),r:rnd(1,2.6),age:0,life:rnd(2.4,4.2),rot:Math.random()*7});
    ash.last = consumed; ash.len = 0;
  }

  // dish
  ctx.beginPath(); ctx.ellipse(baseX,baseY+4,52,13,0,0,7);
  ctx.fillStyle='#181a20'; ctx.fill();
  ctx.strokeStyle='rgba(200,200,215,0.13)'; ctx.lineWidth=1.4; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(baseX,baseY-1,52,12,0,Math.PI,0);
  ctx.fillStyle='#23262e'; ctx.fill();

  // stick
  ctx.beginPath(); ctx.moveTo(baseX,baseY); ctx.lineTo(tx,ty);
  ctx.strokeStyle='#5d4530'; ctx.lineWidth=4; ctx.lineCap='round'; ctx.stroke();

  // ash cap
  const al=Math.max(2,ash.len);
  const ax=tx-dx*al, ay=ty-dy*al;
  ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(tx,ty);
  ctx.strokeStyle='#8d8a86'; ctx.lineWidth=4.8; ctx.stroke();
  ctx.strokeStyle='rgba(40,38,36,0.35)'; ctx.lineWidth=1; ctx.setLineDash([2,5]); ctx.stroke(); ctx.setLineDash([]);

  // ember — breathes as if air is moving over it
  const alive = fin===null ? 1 : clamp(1-fin/5,0,1);
  const glow = (0.62+0.38*Math.sin(t*1.5)+0.12*Math.sin(t*7.3))*alive;
  if(alive>0.01){
    const ge=ctx.createRadialGradient(ax,ay,0,ax,ay,26);
    ge.addColorStop(0,`rgba(255,150,60,${0.55*glow})`);
    ge.addColorStop(1,'rgba(255,90,20,0)');
    ctx.fillStyle=ge; ctx.beginPath(); ctx.arc(ax,ay,26,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(ax,ay,2.4,0,7);
    ctx.fillStyle=`rgba(255,${180+50*glow|0},120,${0.95*alive})`; ctx.fill();
  }

  // falling ash
  for(let i=flakes.length-1;i>=0;i--){
    const f=flakes[i];
    f.age+=dt; if(f.age>f.life){ flakes.splice(i,1); continue; }
    f.vy+=18*dt; f.vx+=Math.sin(t*2+f.rot)*4*dt;
    f.x+=f.vx*dt; f.y+=f.vy*dt;
    if(f.y>baseY+2){ f.y=baseY+2; f.vy=0; f.vx*=0.7; }
    ctx.globalAlpha=clamp(1-f.age/f.life,0,1)*0.7;
    ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,7);
    ctx.fillStyle='#b9b5ad'; ctx.fill();
  }
  ctx.globalAlpha=1;

  // the smoke is the point
  const sAl = fin===null ? 0.30 : 0.30*Math.max(0,1-fin/8);
  smoke(ax,ay-3,t,{height:H*0.62, amp:34, alpha:sAl, seed:2.6, speed:0.42, width:15, tint:[206,204,210]});

  // occasional slow puffs
  if(fin===null && Math.random()<dt*1.4){
    puffs.push({x:ax,y:ay,r:rnd(4,9),age:0,life:rnd(5,9),sw:Math.random()*7});
  }
  for(let i=puffs.length-1;i>=0;i--){
    const q=puffs[i];
    q.age+=dt; if(q.age>q.life){ puffs.splice(i,1); continue; }
    const f=q.age/q.life;
    const qy=q.y-f*H*0.55;
    const qx=q.x+Math.sin(f*3.4+q.sw)*38*f;
    ctx.beginPath(); ctx.arc(qx,qy,q.r+f*46,0,7);
    ctx.fillStyle=`rgba(200,200,208,${0.055*(1-f)*(1-f)})`; ctx.fill();
  }

  const gp=ctx.createRadialGradient(baseX,baseY,0,baseX,baseY,W*0.5);
  gp.addColorStop(0,`rgba(255,140,60,${0.05*alive})`); gp.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gp; ctx.fillRect(0,0,W,H);
}
