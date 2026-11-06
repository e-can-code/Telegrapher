/* Desktop-only input adapter. It uses the canonical Compose key's existing input pipeline. */
(()=>{
 const $=id=>document.getElementById(id);
 const bar=$('floatingMorseBar'),grip=$('floatingMorseGrip');
 const key=$('key');
 const defaults={dit:'KeyF',dah:'KeyJ'};
 let config={...defaults};
 try{const saved=JSON.parse(localStorage.getItem('telegrapher-desktop-keys')||'null');if(saved&&saved.dit!==saved.dah&&/^Key[A-Z]$/.test(saved.dit)&&/^Key[A-Z]$/.test(saved.dah))config=saved;}catch{}
 const label=code=>code.slice(3);
 function showConfig(){ $('desktopDitKey').value=label(config.dit);$('desktopDahKey').value=label(config.dah); }
 function setKey(which,raw){const v=(raw||'').trim().toUpperCase();const code='Key'+v;const status=$('desktopKeyStatus');if(!/^[A-Z]$/.test(v)){status.textContent='Use one letter A–Z.';showConfig();return;}if(code===config[which==='dit'?'dah':'dit']){status.textContent='Dit and Dah must use different keys.';showConfig();return;}config[which]=code;localStorage.setItem('telegrapher-desktop-keys',JSON.stringify(config));status.textContent='Key assignments saved.';showConfig();}
 $('desktopDitKey').addEventListener('change',e=>setKey('dit',e.target.value));$('desktopDahKey').addEventListener('change',e=>setKey('dah',e.target.value));
 $('desktopResetKeys').addEventListener('click',()=>{config={...defaults};localStorage.setItem('telegrapher-desktop-keys',JSON.stringify(config));showConfig();$('desktopKeyStatus').textContent='F and J restored.';});showConfig();
 const active=new Map();
 function composeActive(){return !($('composeView').hidden)&&window.matchMedia('(min-width:850px)').matches&&!document.querySelector('dialog[open]');}
 function editable(target){return target?.closest?.('input,textarea,select,[contenteditable="true"],button');}
 function sendDown(which){if(active.has(which))return;const e=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:which==='dit'?201:202,pointerType:'mouse'});key.dispatchEvent(e);active.set(which,performance.now());bar.querySelector('[data-desktop-mark="'+which+'"]').classList.add('is-pressed');}
 function sendUp(which){if(!active.has(which))return;active.delete(which);key.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:which==='dit'?201:202,pointerType:'mouse'}));bar.querySelector('[data-desktop-mark="'+which+'"]').classList.remove('is-pressed');}
 // A fixed press length uses the same duration classifier as the main Morse key.
 function tap(which){if(!composeActive())return;sendDown(which);setTimeout(()=>sendUp(which),which==='dit'?85:270);}
 bar.querySelectorAll('[data-desktop-mark]').forEach(btn=>btn.addEventListener('click',()=>tap(btn.dataset.desktopMark)));
 document.addEventListener('keydown',e=>{if(!composeActive()||editable(e.target)||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;const which=e.code===config.dit?'dit':e.code===config.dah?'dah':null;if(!which)return;e.preventDefault();tap(which);});
 let drag=null;
 function clamp(){const r=bar.getBoundingClientRect();const x=Math.max(4,Math.min(window.innerWidth-r.width-4,r.left));const y=Math.max(4,Math.min(window.innerHeight-r.height-4,r.top));bar.style.left=x+'px';bar.style.top=y+'px';}
 try{const pos=JSON.parse(localStorage.getItem('telegrapher-desktop-bar')||'null');if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)){bar.style.left=pos.x+'px';bar.style.top=pos.y+'px';}}catch{}
 grip.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,left:bar.getBoundingClientRect().left,top:bar.getBoundingClientRect().top};grip.setPointerCapture(e.pointerId);e.preventDefault();});
 grip.addEventListener('pointermove',e=>{if(!drag)return;bar.style.left=drag.left+e.clientX-drag.x+'px';bar.style.top=drag.top+e.clientY-drag.y+'px';clamp();});
 grip.addEventListener('pointerup',()=>{if(!drag)return;drag=null;localStorage.setItem('telegrapher-desktop-bar',JSON.stringify({x:bar.getBoundingClientRect().left,y:bar.getBoundingClientRect().top}));});
 $('desktopResetPosition').addEventListener('click',()=>{bar.style.left='18px';bar.style.top='48%';localStorage.removeItem('telegrapher-desktop-bar');$('desktopKeyStatus').textContent='Keybar position reset.';});
 window.addEventListener('resize',clamp);requestAnimationFrame(clamp);
 // Dock notes when entering Listen on a desktop; preserve the underlying notes controller.
 function dockNotes(){if(window.matchMedia('(min-width:850px)').matches&&!$('listenView').hidden&&$('listenNotesPanel').hidden)$('listenNotesToggle').click();}
 document.addEventListener('morse:workspace',()=>setTimeout(dockNotes,150));
 window.addEventListener('resize',()=>setTimeout(dockNotes,50));
})();
