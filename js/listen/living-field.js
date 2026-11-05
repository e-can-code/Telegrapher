// A perceptual instrument: physical movement encodes onset density, sustained sound,
// and recovery during silence. It does not imply automatic decoding.
export function createLivingField(canvas) {
  const context = canvas.getContext('2d'); let raf=0, last=0, energy=0, memory=0;
  const motes=Array.from({length:13},(_,i)=>({a:i*2.39996,r:.18+(i%5)*.115,phase:i*.7}));
  let getPosition=()=>0, getDuration=()=>1, getPlaying=()=>false, envelope=[];
  function configure({position,duration,playing,events}) {getPosition=position;getDuration=duration;getPlaying=playing;envelope=events||[];}
  function frame(t) {
    const rect=canvas.getBoundingClientRect(); const dpr=Math.min(devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const seconds=getPosition();
    const active=envelope.some(e=>seconds>=e.start&&seconds<e.end);
    const elapsed=Math.min(.06,Math.max(0,(t-last)/1000));last=t;
    const target=active&&getPlaying()?1:0;
    energy+=(target-energy)*Math.min(1,elapsed*(target?10:2.3));
    memory+=(energy-memory)*Math.min(1,elapsed*1.1);
    context.clearRect(0,0,w,h);
    const cx=w*.5,cy=h*.51,scale=Math.min(w,h)*.4;
    const halo=context.createRadialGradient(cx,cy,0,cx,cy,scale*1.4);
    halo.addColorStop(0,`rgba(172,185,132,${.07+memory*.13})`);halo.addColorStop(1,'rgba(15,43,30,0)');
    context.fillStyle=halo;context.fillRect(0,0,w,h);
    motes.forEach((m,i)=>{
      const drift=(getPlaying()?seconds*.12:0)+Math.sin(t*.00022+m.phase)*.12;
      const radius=scale*m.r*(1+energy*.13);
      const x=cx+Math.cos(m.a+drift)*radius*1.8;
      const y=cy+Math.sin(m.a+drift)*radius*.95;
      const size=(i%4===0?3.5:2.1)*dpr*(1+energy*(i%3===0?1.1:.35));
      const light=context.createRadialGradient(x,y,0,x,y,size*6);
      light.addColorStop(0,`rgba(248,221,164,${.7+energy*.24})`);
      light.addColorStop(.2,`rgba(216,193,128,${.25+energy*.3})`);
      light.addColorStop(1,'rgba(216,193,128,0)');
      context.fillStyle=light;context.beginPath();context.arc(x,y,size*6,0,Math.PI*2);context.fill();
      context.fillStyle='#e9d9aa';context.beginPath();context.arc(x,y,size*.52,0,Math.PI*2);context.fill();
    });
    context.strokeStyle=`rgba(190,179,118,${.11+memory*.2})`;context.lineWidth=dpr;
    context.beginPath();context.ellipse(cx,cy,scale*.72*(1+memory*.13),scale*.41*(1+memory*.12),-.23,0,Math.PI*2);context.stroke();
    raf=requestAnimationFrame(frame);
  }
  function start(){if(!raf){last=performance.now();raf=requestAnimationFrame(frame);}}
  function stop(){cancelAnimationFrame(raf);raf=0;}
  return {configure,start,stop};
}
