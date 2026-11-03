import {putMessage, getMessage, messageId} from '../storage/library.js';
const $=id=>document.getElementById(id);
const clock=t=>`${Math.floor((t||0)/60)}:${String(Math.floor((t||0)%60)).padStart(2,'0')}`;
export function initQuiet(){
 const audio=new Audio();audio.preload='auto';audio.preservesPitch=true;
 let url=null,recordId=null,loaded=false,loop=false,raf=0,lastNotes='',notesTimer=0,loading=0;
 const error=message=>{$('listenError').textContent=message||'';};
 const duration=()=>Number.isFinite(audio.duration)?audio.duration:0;
 const notify=()=>document.dispatchEvent(new Event('morse:library-updated'));
 function update(){
  const d=duration(),p=d?Math.min(1,audio.currentTime/d):0;
  $('listenCurrent').textContent=clock(audio.currentTime);$('listenDuration').textContent=clock(d);
  $('listenSeek').value=String(Math.round(p*1000));
  $('listenTraceLight').style.left=`${p*100}%`;
  $('listenPlay').textContent=audio.paused?'▶':'Ⅱ';$('listenPlay').setAttribute('aria-label',audio.paused?'Play':'Pause');
  $('listenTraceLight').classList.toggle('active',!audio.paused);
 }
 function animate(){update();if(!audio.paused)raf=requestAnimationFrame(animate);}
 function stopAnimation(){cancelAnimationFrame(raf);update();}
 audio.addEventListener('play',()=>{cancelAnimationFrame(raf);animate();});
 audio.addEventListener('pause',stopAnimation);audio.addEventListener('seeked',update);
 audio.addEventListener('loadedmetadata',update);audio.addEventListener('timeupdate',update);
 audio.addEventListener('ended',()=>{if(loop){audio.currentTime=0;audio.play().catch(e=>error(e.message));}else stopAnimation();});
 audio.addEventListener('error',()=>error('The audio could not be played. Try a PCM WAV recording.'));
 async function saveNotes(){if(!recordId)return;const notes=$('listenNotesText').value;if(notes===lastNotes)return;lastNotes=notes;try{await putMessage({id:recordId,notes});notify();}catch(e){error('Could not save notes: '+e.message);}}
 async function load(blob,name,{id=null,persist=true,notes=null}={}){
  if(!(blob instanceof Blob)){error('No playable audio was provided.');return;}
  const token=++loading;audio.pause();error('');
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);audio.src=url;audio.load();
  recordId=id||messageId();loaded=true;
  $('listenName').textContent=name||'Received message';$('listenMeta').textContent='WAV · saved locally';
  $('listenEmpty').hidden=true;$('listenStage').classList.add('has-audio');
  $('listenNotesText').value=notes??'';lastNotes=$('listenNotesText').value;
  update();
  if(persist){try{await putMessage({id:recordId,kind:'received',title:name||'Received message',audio:blob,notes:lastNotes});notify();}catch(e){error('Recording opened, but library saving failed: '+e.message);}}
  if(token!==loading)return;
 }
 for(const id of ['listenFile','listenFileEmpty'])$(id).addEventListener('change',async e=>{const file=e.target.files?.[0];if(file)await load(file,file.name);e.target.value='';});
 $('listenFromCompose').addEventListener('click',()=>{
  let answered=false;
  document.dispatchEvent(new CustomEvent('morse:request-export',{detail:{accept:async blob=>{answered=true;await load(blob,'Composed message.wav');},reject:reason=>{answered=true;error(String(reason));}}}));
  if(!answered)error('Compose is not ready. Create a message first or open a WAV.');
 });
 $('listenPlay').addEventListener('click',async()=>{if(!loaded){error('Open a WAV first.');return;}try{if(audio.paused){if(duration()&&audio.currentTime>=duration()-.03)audio.currentTime=0;await audio.play();}else audio.pause();}catch(e){error('Playback failed: '+e.message);}});
 $('listenBack').addEventListener('click',()=>{if(loaded)audio.currentTime=Math.max(0,audio.currentTime-3);});
 $('listenLoop').addEventListener('click',()=>{loop=!loop;$('listenLoop').setAttribute('aria-pressed',String(loop));audio.loop=loop;});
 $('listenSeek').addEventListener('input',e=>{if(duration())audio.currentTime=duration()*Number(e.target.value)/1000;update();});
 const speed=$('listenSpeedFine');function setSpeed(v){const n=Math.max(.25,Math.min(3,Number(v)||1));audio.playbackRate=n;speed.value=String(n);$('listenSpeedLabel').textContent=`${Number(n.toFixed(2))}×`;document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===n)));}
 speed.addEventListener('input',()=>setSpeed(speed.value));document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>setSpeed(b.dataset.speed)));setSpeed(1);
 $('listenSoundToggle').addEventListener('click',()=>{const p=$('listenSoundPanel');p.hidden=!p.hidden;$('listenSoundToggle').setAttribute('aria-expanded',String(!p.hidden));});
 $('listenVolume').addEventListener('input',e=>audio.volume=Number(e.target.value)/100);
 $('listenNotesToggle').addEventListener('click',()=>{const p=$('listenNotesPanel');p.hidden=!p.hidden;$('listenNotesToggle').setAttribute('aria-expanded',String(!p.hidden));if(!p.hidden)$('listenNotesText').focus();});
 $('listenNotesText').addEventListener('input',()=>{clearTimeout(notesTimer);notesTimer=setTimeout(()=>void saveNotes(),250);});
 $('listenNotesKeyboard').addEventListener('click',()=>{const p=$('listenNotesKeys');p.hidden=!p.hidden;$('listenNotesKeyboard').setAttribute('aria-expanded',String(!p.hidden));});
 document.querySelectorAll('[data-note]').forEach(b=>b.addEventListener('click',()=>{const t=$('listenNotesText'),v=b.dataset.note;const start=t.selectionStart,end=t.selectionEnd;let insert=v==='newline'?'\n':v;let from=start,to=end;if(v==='backspace'){from=start===end?Math.max(0,start-1):start;insert='';}t.setRangeText(insert,from,to,'end');t.dispatchEvent(new Event('input'));t.focus();}));
 document.addEventListener('morse:library-open-audio',async e=>{const entry=e.detail;const saved=entry.audio?entry:await getMessage(entry.id);if(saved?.audio)await load(saved.audio,saved.title,{id:saved.id,persist:false,notes:saved.notes});});
 document.addEventListener('morse:workspace',e=>{if(e.detail.name==='compose'){audio.pause();void saveNotes();}});
 window.addEventListener('pagehide',()=>{void saveNotes();});
 update();
}
