/* Desktop layout adapter. Shared playback and Morse controllers remain authoritative. */
(()=>{
 const $=id=>document.getElementById(id);
 const desktop=()=>window.matchMedia('(min-width:850px)').matches;
 const compose=$('composeView'),listen=$('listenView'),panel=$('listenNotesPanel');
 const toggle=$('composeMessageToggle');
 toggle.addEventListener('click',()=>{const open=compose.classList.toggle('message-expanded');toggle.setAttribute('aria-expanded',String(open));toggle.querySelector('span').textContent=open?'▴':'▾';});
 const modes=document.querySelector('.listening-modes');
 modes.classList.add('desktop-modes');
 // Moving a node preserves the listeners installed by the existing listening controller.
 document.querySelector('.app>header').append(modes);
 function dock(){if(!desktop()||listen.hidden)return; if(panel.hidden){$('listenNotesToggle').click();} listen.classList.remove('notes-open');document.body.classList.remove('notes-writing');}
 document.addEventListener('morse:workspace',()=>setTimeout(dock,70));
 modes.addEventListener('click',()=>setTimeout(dock,90));
 window.addEventListener('resize',()=>setTimeout(dock,80));
 // The key deck enters notes through the same existing Helmsman handlers.
 const defaults={dit:'KeyF',dah:'KeyJ'};let keys={...defaults};
 try{const v=JSON.parse(localStorage.getItem('telegrapher-web-listening-keys')||'null');if(v&&/^Key[A-Z]$/.test(v.dit)&&/^Key[A-Z]$/.test(v.dah)&&v.dit!==v.dah)keys=v;}catch{}
 const input={dit:$('desktopDitKey'),dah:$('desktopDahKey')};
 function sync(){input.dit.value=keys.dit.slice(3);input.dah.value=keys.dah.slice(3);}
 function change(which,value){const v=(value||'').trim().toUpperCase(),code='Key'+v,other=which==='dit'?'dah':'dit';if(!/^[A-Z]$/.test(v)||code===keys[other]){$('desktopKeyStatus').textContent='Choose different single-letter keys.';sync();return;}keys[which]=code;localStorage.setItem('telegrapher-web-listening-keys',JSON.stringify(keys));$('desktopKeyStatus').textContent='Key assignments saved.';sync();}
 Object.keys(input).forEach(which=>input[which].addEventListener('change',e=>change(which,e.target.value)));
 $('desktopResetKeys').addEventListener('click',()=>{keys={...defaults};localStorage.setItem('telegrapher-web-listening-keys',JSON.stringify(keys));sync();$('desktopKeyStatus').textContent='F and J restored.';});sync();
 function send(which){const target=panel.querySelector('[data-note="'+(which==='dit'?'·':'−')+'"]');if(target)target.click();}
 $('desktopDit').addEventListener('click',()=>send('dit'));
 $('desktopDah').addEventListener('click',()=>send('dah'));
 document.addEventListener('keydown',e=>{if(!desktop()||listen.hidden||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,button,[contenteditable="true"]'))return;const which=e.code===keys.dit?'dit':e.code===keys.dah?'dah':null;if(which){e.preventDefault();send(which);}});
 // Renderer can initialize before the desktop grid has its final dimensions.
 // Recalculate the canvas after the desktop pane becomes visible.
 const canvas=$('receiverCanvas');
 const observer=new ResizeObserver(()=>{if(!listen.hidden&&!$('receiverInstrument').hidden){const bounds=canvas.getBoundingClientRect();if(bounds.width>0&&bounds.height>0)window.dispatchEvent(new Event('resize'));}});
 // Avoid a resize feedback loop: observe the outer panel, not the canvas.
 observer.observe($('receiverInstrument'));
})();
