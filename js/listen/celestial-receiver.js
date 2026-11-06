import {createCelestialLayout, orbitalPosition, groupPosition, wordSignature} from './celestial-layout.js';
const PI2 = 2 * Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = n => n - Math.floor(n);
const hash = (a, b = 0) => fract(Math.sin((a + 3) * 72.91 + b * 91.31) * 48611.72);
const ringTypes = [
  {r:1.05,w:.055,h:.013,phase:.35,axes:[.19,.13,.105],spin:.42},
  {r:.96,w:.026,h:.011,phase:1.35,axes:[-.17,.23,-.085],spin:-.57},
  {r:.85,w:.078,h:.019,phase:2.15,axes:[.24,-.18,.13],spin:.64},
  {r:.73,w:.029,h:.012,phase:3.4,axes:[-.26,-.14,.17],spin:-.71},
  {r:.61,w:.064,h:.015,phase:4.25,axes:[.16,.29,-.11],spin:.53},
  {r:.49,w:.031,h:.011,phase:5.3,axes:[-.2,.21,.16],spin:-.82}
];
function turn3(v, angles) {
  let [x,y,z] = v; const [ax,ay,az] = angles;
  let yy=y*Math.cos(ax)-z*Math.sin(ax), zz=y*Math.sin(ax)+z*Math.cos(ax); y=yy; z=zz;
  let xx=x*Math.cos(ay)+z*Math.sin(ay); zz=-x*Math.sin(ay)+z*Math.cos(ay); x=xx; z=zz;
  xx=x*Math.cos(az)-y*Math.sin(az); yy=x*Math.sin(az)+y*Math.cos(az);
  return [xx,yy,z];
}
function quad(ctx,p,color) {
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);
  for(let k=1;k<4;k++)ctx.lineTo(p[k][0],p[k][1]);ctx.closePath();ctx.fill();
}
function toneLevel(time, tones, playing) {
  if(!playing || !tones.length)return 0;
  let lo=0,hi=tones.length-1;
  while(lo<=hi){const m=(lo+hi)>>1,e=tones[m];if(time<e.start)hi=m-1;else if(time>=e.end)lo=m+1;
    else return clamp(Math.min((time-e.start)/.018,(e.end-time)/.035),0,1);}
  return 0;
}
function drawFullArmillary(ctx,cx,cy,S,t,signature,bright,quality=60) {
  const project=v=>{const f=3.8/(3.8+v[2]*.37);return[cx+v[0]*S*f,cy+v[1]*S*f]};
  const quads=[];
  const ringCount=clamp(signature.ringCount || 4,3,8);
  for(let i=0;i<ringCount;i++){
    const ring=ringTypes[i % ringTypes.length],phase=ring.phase + Math.floor(i / ringTypes.length)*.87,angles=[.56+i*.43+t*ring.axes[0]+Math.sin(t*.091+phase)*.32,
      .35+i*.69+t*ring.axes[1]+Math.cos(t*.083+phase)*.36,
      phase*.7+t*ring.axes[2]+Math.sin(t*.064+phase)*.24];
    const spin=t*ring.spin+phase;
    const band=ring.w*(1+(signature.ratio-.38)*(i%2?-.17:.32)+signature.density*.05);
    const radiusOffset = i >= ringTypes.length ? .12 + (i-ringTypes.length)*.09 : 0;
    const points=[];
    for(let j=0;j<=quality;j++){
      const theta=j/quality*PI2+spin,co=Math.cos(theta),si=Math.sin(theta),r0=ring.r-radiusOffset-band/2,r1=ring.r-radiusOffset+band/2;
      points.push({li:turn3([co*r0,si*r0,-ring.h],angles),lo:turn3([co*r1,si*r1,-ring.h],angles),
        ui:turn3([co*r0,si*r0,ring.h],angles),uo:turn3([co*r1,si*r1,ring.h],angles),
        inner:turn3([-co,-si,0],angles),outer:turn3([co,si,0],angles),up:turn3([0,0,1],angles),down:turn3([0,0,-1],angles),theta});
    }
    for(let j=0;j<quality;j++){
      const a=points[j],b=points[j+1];
      for(const [surface,keys,normKey] of [['inner',['li','ui','ui','li'],'inner'],['outer',['lo','uo','uo','lo'],'outer'],['face',['ui','uo','uo','ui'],'up'],['shadow',['li','lo','lo','li'],'down']]){
        const vertices=keys.map((key,index)=>index<2?a[key]:b[key]);
        const meanZ=vertices.reduce((sum,v)=>sum+v[2],0)/4,normal=a[normKey];
        const inward=surface==='inner', outward=surface==='outer'||surface==='shadow';
        // Inward surfaces catch light from the pearl; outward surfaces remain dark.
        const base=inward?[185,151,96]:outward?[76,64,45]:[151,123,80];
        const directional=.5+.5*clamp(normal[0]*-.29+normal[1]*-.51+normal[2]*-.55,-1,1);
        const glint=Math.pow(Math.max(0,.5+.5*Math.sin(a.theta*2+spin*1.35)),8);
        const light=(inward?.55:outward?.20:.38)+directional*(inward?.35:outward?.14:.27)+glint*(inward?.25:.12);
        const multiplier=.58+light+(inward?.22:outward?.06:.12)*bright;
        const rgb=base.map(n=>Math.round(clamp(n*multiplier,0,255)));
        quads.push({z:meanZ,p:vertices.map(project),color:`rgb(${rgb.join(',')})`});
      }
    }
  }
  quads.sort((a,b)=>b.z-a.z);
  for(const p of quads)if(p.z>=0)quad(ctx,p.p,p.color);
  drawPearl(ctx,cx,cy,S,bright);
  for(const p of quads)if(p.z<0)quad(ctx,p.p,p.color);
}
function drawPearl(ctx,cx,cy,S,bright) {
  const halo=ctx.createRadialGradient(cx,cy,1,cx,cy,S*(.54+.13*bright));
  halo.addColorStop(0,`rgba(252,222,164,${.25+.26*bright})`);
  halo.addColorStop(.32,`rgba(219,174,106,${.085+.14*bright})`);
  halo.addColorStop(1,'rgba(205,158,85,0)');
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(cx,cy,S*(.54+.13*bright),0,PI2);ctx.fill();
  const r=S*(.112+.007*bright),orb=ctx.createRadialGradient(cx-r*.32,cy-r*.38,1,cx,cy,r);
  orb.addColorStop(0,'#fff2d5');orb.addColorStop(.37,'#f4deae');orb.addColorStop(.75,'#dbb977');orb.addColorStop(1,'#a88149');
  ctx.fillStyle=orb;ctx.beginPath();ctx.arc(cx,cy,r,0,PI2);ctx.fill();
  ctx.fillStyle=`rgba(255,239,207,${.055+.25*bright})`;
  ctx.beginPath();ctx.arc(cx,cy,r*.93,0,PI2);ctx.fill();
}
function drawMini(ctx,x,y,r,t,seed,bright) {
  const glow=ctx.createRadialGradient(x,y,0,x,y,r*1.27);
  glow.addColorStop(0,`rgba(225,196,137,${.06+.20*bright})`);glow.addColorStop(1,'rgba(225,196,137,0)');
  ctx.fillStyle=glow;ctx.fillRect(x-r*1.27,y-r*1.27,r*2.54,r*2.54);
  for(let k=0;k<3;k++){
    ctx.save();ctx.translate(x,y);ctx.rotate(seed*2.8+k*1.3+t*(k%2?-.17:.12));
    const fac=.19+.78*Math.abs(Math.cos(t*(k%2?-.13:.14)+seed+k));
    ctx.scale(1,fac);ctx.beginPath();ctx.arc(0,0,r*(.95-k*.17),0,PI2);
    ctx.lineWidth=Math.max(.75,r*(k===0?.08:.04));ctx.strokeStyle=k===0?'#c7a66c':k===1?'#765f41':'#dbbd83';ctx.stroke();ctx.restore();
  }
  const orb=ctx.createRadialGradient(x-2,y-2,0,x,y,Math.max(3,r*.22));
  orb.addColorStop(0,'#fff0c9');orb.addColorStop(1,'#c39b5e');ctx.fillStyle=orb;
  ctx.beginPath();ctx.arc(x,y,Math.max(1.7,r*.15),0,PI2);ctx.fill();
}
function drawNebula(ctx,x,y,r,seed,t,active=false) {
  // Distant collections are unresolved aggregates, not enlarged word armillaries.
  const cloud=ctx.createRadialGradient(x,y,0,x,y,r*1.55);
  cloud.addColorStop(0,active?'rgba(243,220,167,.65)':'rgba(197,185,140,.32)');
  cloud.addColorStop(.3,active?'rgba(174,184,123,.33)':'rgba(117,150,114,.20)');
  cloud.addColorStop(1,'rgba(19,56,39,0)');ctx.fillStyle=cloud;
  ctx.beginPath();ctx.ellipse(x,y,r*1.55,r*1.10,seed*1.9,0,PI2);ctx.fill();
  for(let i=0;i<14;i++){
    const angle=i*2.399+seed*9,rad=r*(.12+.8*hash(i,seed*10));
    const px=x+Math.cos(angle+t*.007)*rad,py=y+Math.sin(angle+t*.008)*rad*.55;
    ctx.fillStyle=`rgba(233,208,159,${.25+.45*hash(i,3)})`;
    ctx.beginPath();ctx.arc(px,py,.45+hash(i,2)*1.1,0,PI2);ctx.fill();
  }
}
export class CelestialReceiver {
  constructor({ canvas, scope, getPlayback, onWord, onGroup, onBack }) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    this.scope=scope;this.getPlayback=getPlayback;this.onWord=onWord;this.onGroup=onGroup;this.onBack=onBack;
    this.layout=createCelestialLayout([]);this.tones=[];this.signatures=[];
    this.yaw=.32;this.pitch=.24;this.t=0;this.last=0;this.raf=0;this.active=false;
    this.drag=null;this.railOffset=0;this.railTouched=false;this.hits=[];this.lastTap=0;this.lastPoint=null;this.focusMix=0;this.parallax={x:0,y:0};
    this.reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown',e=>this.pointerDown(e));
    canvas.addEventListener('pointermove',e=>this.pointerMove(e));
    canvas.addEventListener('pointerup',e=>this.pointerUp(e));
    canvas.addEventListener('pointercancel',()=>{this.drag=null});
    canvas.addEventListener('dblclick',e=>{if(this.scope.view!=='overview'&&!this.hit(this.point(e)))this.onBack()});
  }
  configure(words, tones) {
    this.layout=createCelestialLayout(words);this.railOffset=0;this.railTouched=false;this.tones=tones||[];
    this.signatures=words.map(word=>wordSignature(this.tones,word));this.t=0;this.focusMix=this.scope.view==='focus'?1:0;
  }
  resize() {
    const r=this.canvas.getBoundingClientRect();this.w=Math.max(1,r.width);this.h=Math.max(1,r.height);
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    this.canvas.width=Math.round(this.w*dpr);this.canvas.height=Math.round(this.h*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  start() {if(this.active)return;this.active=true;this.resize();this.last=performance.now();this.raf=requestAnimationFrame(n=>this.frame(n));}
  stop(){this.active=false;cancelAnimationFrame(this.raf)}
  point(e){const b=this.canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top}}
  hit(p) { return this.hits.map(h=>({...h,dist:Math.hypot(h.x-p.x,h.y-p.y)}))
    .filter(h=>h.dist<=h.radius).sort((a,b)=>a.dist-b.dist)[0]||null; }
  pointerDown(e){if(e.button!==0)return;const p=this.point(e);this.drag={x:p.x,y:p.y,originalX:p.x,originalY:p.y,moved:false,initialOffset:this.railOffset};this.canvas.setPointerCapture?.(e.pointerId);}
  pointerMove(e){
    const p=this.point(e);
    // Pointer movement only shifts near-field atmosphere. Word coordinates never move.
    if(e.pointerType==='mouse')this.parallax={x:clamp((p.x/this.w-.5)*2,-1,1),y:clamp((p.y/this.h-.5)*2,-1,1)};
    if(!this.drag)return;
    if(Math.hypot(p.x-this.drag.originalX,p.y-this.drag.originalY)>9)this.drag.moved=true;
    if(this.scope.view==='overview' && this.drag.moved && this.layout.count>6){
      const spacing=this.railSpacing();
      const visible=Math.max(1,Math.floor((this.w-64)/spacing));
      this.railOffset=clamp(this.drag.initialOffset-(p.x-this.drag.originalX)/spacing,0,Math.max(0,this.layout.count-visible));
      this.railTouched=true;
    }
    if(e.pointerType!=='mouse'&&this.drag.moved)this.parallax={x:clamp((p.x-this.drag.originalX)/120,-1,1),y:clamp((p.y-this.drag.originalY)/120,-1,1)};
    this.drag.x=p.x;this.drag.y=p.y;
  }
  pointerUp(e){if(!this.drag)return;const moved=this.drag.moved;this.drag=null;if(moved)return;
    const p=this.point(e),hit=this.hit(p),now=performance.now();
    if(hit){if(hit.kind==='word')this.onWord(hit.index);else if(hit.kind==='group')this.onGroup(hit.index);this.lastTap=0;return;}
    if(this.scope.view!=='overview'&&now-this.lastTap<390&&this.lastPoint&&Math.hypot(p.x-this.lastPoint.x,p.y-this.lastPoint.y)<38){this.onBack();this.lastTap=0;return;}
    this.lastTap=now;this.lastPoint=p;
  }
  worldPoint(p){return orbitalPosition(p,this.t,this.reduced)}
  project(p,scale,centerX=this.w*.5,centerY=this.h*.46){let {x,y,z}=p;
    const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cx=Math.cos(this.pitch),sx=Math.sin(this.pitch);
    let xx=x*cy-z*sy,zz=x*sy+z*cy;x=xx;z=zz;
    let yy=y*cx-z*sx;z=y*sx+z*cx;y=yy;
    const depth=clamp(5/(5+z*.36),.48,1.7);
    return{x:centerX+x*scale*depth,y:centerY+y*scale*depth,z,depth};}
  background(bright){const{ctx,w,h,t}=this;const bg=ctx.createRadialGradient(w*.48,h*.47,1,w*.49,h*.47,Math.max(w,h)*.77);
    bg.addColorStop(0,'#234333');bg.addColorStop(.50,'#09251a');bg.addColorStop(1,'#020b08');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    const overview=this.scope.view==='overview'||this.scope.view==='group';
    const glow=ctx.createRadialGradient(w*.50,h*.47,1,w*.5,h*.47,Math.max(w,h)*(.39+bright*.10));
    glow.addColorStop(0,`rgba(226,194,135,${overview?.018:.035+(bright*.15)})`);glow.addColorStop(1,'rgba(221,180,105,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    for(let i=0;i<105;i++){const drift=this.reduced?0:t;
      const near=i%4===0, parallax=near?this.parallax:{x:0,y:0};
      const x=(hash(i,1)*w+Math.sin(drift*.018+i)*7+parallax.x*9+w*2)%w,y=(hash(i,3)*h+Math.cos(drift*.012+i)*6+parallax.y*7+h*2)%h;
      const a=.13+.28*(.5+.5*Math.sin(t*.19+i));ctx.fillStyle=`rgba(${i%4?'187,202,168':'226,207,154'},${a})`;
      ctx.beginPath();ctx.arc(x,y,.35+hash(i,6)*.85,0,PI2);ctx.fill();}
    ctx.lineWidth=.6;ctx.strokeStyle='rgba(183,155,97,.065)';
    for(let k=0;k<3;k++){ctx.beginPath();ctx.ellipse(w*.5,h*.47,w*(.55+k*.11),h*(.21+k*.06),-.19+k*.17,0,PI2);ctx.stroke();}
  }
  railSpacing(){const n=this.layout.count;return n<=6?Math.max(48,Math.min(94,(this.w-78)/Math.max(1,n))):clamp(this.w<480?75:94,66,110);}
  drawOverview(playback,bright){
    const {ctx,w,h}=this,n=this.layout.count;
    this.hits=[];
    if(!n){ctx.fillStyle='#c3c9ad';ctx.textAlign='center';ctx.font='13px Georgia';ctx.fillText(playback.loaded?'No reliable word boundaries':'Open a recording in Quiet',w/2,h*.48);return;}
    if(n===1){this.drawFocus(playback,bright);return;}
    const spacing=this.railSpacing(),left=36,right=w-36,visible=Math.max(1,Math.floor((right-left)/spacing));
    const active=this.scope.wordAt(playback.position);
    // Follow playback until the user deliberately scrolls the rail. A touch gesture
    // changes only the viewport, never the transport's playback position.
    if(!this.railTouched && active>=0 && n>visible){
      const target=clamp(active-Math.floor(visible/2),0,Math.max(0,n-visible));
      this.railOffset+=(target-this.railOffset)*.12;
    }
    this.railOffset=clamp(this.railOffset,0,Math.max(0,n-visible));
    const cy=h*.46,first=Math.max(0,Math.floor(this.railOffset)-1);
    const last=Math.min(n,Math.ceil(this.railOffset)+visible+2);
    // The rail is an optical shelf rather than a line or a collection of cards.
    const baseY=cy+clamp(h*.20,36,80);
    const line=ctx.createLinearGradient(left,0,right,0);
    line.addColorStop(0,'rgba(199,171,109,0)');line.addColorStop(.15,'rgba(199,171,109,.22)');line.addColorStop(.85,'rgba(199,171,109,.22)');line.addColorStop(1,'rgba(199,171,109,0)');
    ctx.strokeStyle=line;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(left,baseY);ctx.lineTo(right,baseY);ctx.stroke();
    for(let i=first;i<last;i++){
      const railLeft=n<=5?(w-n*spacing)/2:left;
      const x=railLeft+spacing*(i-this.railOffset+.5);
      if(x<12||x>w-12)continue;
      const isActive=active===i,selected=this.scope.queued===i;
      const r=Math.min(30,Math.max(18,spacing*.31));
      const illumination=isActive?bright:0;
      drawMini(ctx,x,cy,r,this.t,i*.21,illumination);
      if(isActive && illumination>.03){
        const halo=ctx.createRadialGradient(x,cy,r*.2,x,cy,r*1.55);
        halo.addColorStop(0,`rgba(242,211,151,${.13*illumination})`);
        halo.addColorStop(1,'rgba(242,211,151,0)');
        ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,cy,r*1.55,0,PI2);ctx.fill();
      }
      ctx.font=(isActive?'bold ':'')+'11px system-ui';ctx.textAlign='center';
      ctx.fillStyle=isActive?'#f2dfb1':selected?'#dbc38d':'#a8bba6';
      ctx.fillText(String(i+1),x,baseY+20);
      if(isActive){ctx.strokeStyle='rgba(238,210,154,.75)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,cy,r*1.13,0,PI2);ctx.stroke();}
      this.hits.push({kind:'word',index:i,x,y:cy,radius:Math.max(30,spacing*.43)});
    }
    if(n>visible){
      const trackLeft=left+10,trackWidth=right-left-20,thumb=Math.max(24,trackWidth*visible/n);
      const range=Math.max(1,n-visible),trackY=h-92;
      ctx.fillStyle='rgba(188,169,115,.18)';ctx.fillRect(trackLeft,trackY,trackWidth,1);
      ctx.fillStyle='rgba(224,194,133,.65)';ctx.fillRect(trackLeft+(trackWidth-thumb)*this.railOffset/range,trackY-1,thumb,3);
    }
  }
  drawGroup(playback,bright){const{layout,scope,ctx,w,h}=this;this.hits=[];const group=layout.groups[scope.group];if(!group)return;
    const points=layout.points.slice(group.first,group.last).map((p,i)=>({pos:this.worldPoint(p),index:group.first+i}));
    const center=groupPosition(group,this.t,this.reduced);
    const projected=points.map(p=>({...this.project({x:p.pos.x-center.x*2.1,y:p.pos.y-center.y*1.8,z:p.pos.z-center.z*2.1},Math.min(w*.28,h*.34)),index:p.index})).sort((a,b)=>b.z-a.z);
    const activeWord=scope.wordAt(playback.position);
    for(const p of projected){const r=clamp(18*p.depth,9,28),on=activeWord===p.index?bright:0;
      drawMini(ctx,p.x,p.y,r,this.t,p.index*.26,on);
      this.hits.push({kind:'word',index:p.index,x:p.x,y:p.y,radius:Math.max(22,r*1.4)});}
  }
  drawFocus(playback,bright){const{ctx,w,h,scope,layout}=this,index=scope.selected;
    this.hits=[];if(index<0||!layout.points[index])return;
    const S=Math.min(w*.33,h*.34,235),cx=w*.5,cy=h*.46;
    const center=this.worldPoint(layout.points[index]);
    const otherIndices=layout.points.map((_,i)=>i).filter(i=>i!==index);
    // Actual positions in the celestial system; no synthetic edge columns or clamping.
    const nearby=otherIndices.map(i=>{
      const point=this.worldPoint(layout.points[i]);const relative={x:point.x-center.x,y:point.y-center.y,z:point.z-center.z};
      return{...this.project(relative,Math.min(w*.29,h*.35),cx,cy),index:i};
    }).filter(p=>p.x>=12&&p.x<=w-12&&p.y>=28&&p.y<=h-74&&Math.hypot(p.x-cx,p.y-cy)>S*.40)
      .sort((a,b)=>b.z-a.z);
    for(const p of nearby.slice(0,26)){
      const r=clamp(10*p.depth,3,14);drawMini(ctx,p.x,p.y,r,this.t,p.index*.31,0);
      this.hits.push({kind:'word',index:p.index,x:p.x,y:p.y,radius:Math.max(20,r*1.55)});
    }
    const halo=ctx.createRadialGradient(cx,cy,0,cx,cy,S*2.4);
    halo.addColorStop(0,`rgba(239,206,146,${.06+.10*bright})`);halo.addColorStop(1,'rgba(216,178,108,0)');
    ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
    drawFullArmillary(ctx,cx,cy,S,this.t,this.signatures[index]||{ratio:.34,density:.5},bright,this.reduced?42:56);
    this.hits.push({kind:'center',index,x:cx,y:cy,radius:S*.96});
  }
  drawLoopReturn(playback){
    const age=playback.loopCompletionAge;
    if(!(age>=0&&age<.72))return;
    const ctx=this.ctx,focus=this.scope.view==='focus';
    let x=this.w*.5,y=this.h*.46,r=Math.min(this.w*.33,this.h*.34,235);
    if(!focus){
      const current=this.scope.wordAt(Math.max(0,this.scope.interval().end-.001));
      const hit=this.hits.find(h=>h.kind==='word'&&h.index===current);
      if(!hit)return;
      x=hit.x;y=hit.y;r=Math.max(14,Math.min(36,hit.radius*.85));
    }
    const progress=Math.min(1,age/.55),opacity=Math.pow(1-progress,1.7)*.68;
    ctx.save();
    ctx.beginPath();ctx.arc(x,y,r*(1.05+progress*.33),0,Math.PI*2);
    ctx.strokeStyle=`rgba(243,207,137,${opacity})`;
    ctx.lineWidth=Math.max(1.1,2.7*(1-progress));
    ctx.shadowColor='rgba(242,198,116,.85)';ctx.shadowBlur=12+16*(1-progress);
    ctx.stroke();ctx.restore();
  }
  frame(now){if(!this.active)return;
    const maximumFramesPerSecond=this.w<640?27:30;
    if(now-this.last<1000/maximumFramesPerSecond){this.raf=requestAnimationFrame(n=>this.frame(n));return;}
    const dt=Math.min(.06,Math.max(0,(now-this.last)/1000));this.last=now;
    if(!document.hidden)this.t+=dt*(this.reduced?.1:clamp(Number(this.getPlayback().rate)||1,.5,2.2));
    const playback=this.getPlayback(),bright=toneLevel(playback.position,this.tones,playback.playing);
    this.background(bright);
    if(this.scope.view==='focus')this.drawFocus(playback,bright);
    else if(this.scope.view==='group')this.drawGroup(playback,bright);
    else this.drawOverview(playback,bright);
    this.drawLoopReturn(playback);
    this.raf=requestAnimationFrame(n=>this.frame(n));
  }
}
