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
 // Native Android VIEW/SEND intents arrive through the same WAV loading pathway as file-picker imports.
 window.morseOpenAndroidWav=async function(base64,name){
  try{
   const binary=atob(base64),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   document.querySelector('[data-workspace="listen"]')?.click();
   await load(new Blob([bytes],{type:'audio/wav'}),name||'Received message.wav');
  }catch(e){error('Unable to open shared WAV: '+e.message);}
 };
 document.dispatchEvent(new Event('morse:android-import-ready'));
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
 const noteArea=$('listenNotesText'), noteKeys=$('listenNotesKeys');
 let notesCaret=0,notesEnd=0;
 function captureCaret(){notesCaret=noteArea.selectionStart;notesEnd=noteArea.selectionEnd;}
 function positionWriting(){
  if($('listenNotesPanel').hidden)return;
  // Keep the instrument stationary; the Notes textarea owns its own scrolling.
  // On Android, VisualViewport reports the space left after the IME appears.
  if(document.body.classList.contains('native-notes-keyboard')){
    const v=window.visualViewport;
    if(v)document.documentElement.style.setProperty('--tg-visual-height',`${Math.round(v.height)}px`);
  }
 }
 $('listenNotesToggle').addEventListener('click',()=>{
  const panel=$('listenNotesPanel');panel.hidden=!panel.hidden;
  const opened=!panel.hidden;
  $('listenNotesToggle').setAttribute('aria-expanded',String(opened));
  $('listenView').classList.toggle('notes-open',opened);
  document.body.classList.toggle('notes-writing',opened);
  if(opened){noteKeys.hidden=false;$('listenNotesKeyboard').setAttribute('aria-expanded','true');
    // No focus here: opening Notes must not summon the Android keyboard.
    requestAnimationFrame(positionWriting);
  } else {noteArea.blur();document.body.classList.remove('native-notes-keyboard');document.documentElement.style.removeProperty('--tg-visual-height');}
 });
 noteArea.addEventListener('input',()=>{captureCaret();clearTimeout(notesTimer);notesTimer=setTimeout(()=>void saveNotes(),250);});
 for(const eventName of ['click','keyup','select'])noteArea.addEventListener(eventName,captureCaret);
 noteArea.addEventListener('focus',()=>{document.body.classList.add('native-notes-keyboard');setTimeout(positionWriting,180);setTimeout(positionWriting,420);});
 noteArea.addEventListener('blur',()=>{document.body.classList.remove('native-notes-keyboard');document.documentElement.style.removeProperty('--tg-visual-height');});
 window.visualViewport?.addEventListener('resize',positionWriting);
 $('listenNotesKeyboard').addEventListener('click',()=>{noteKeys.hidden=!noteKeys.hidden;$('listenNotesKeyboard').textContent=noteKeys.hidden?'Show keys ⌃':'Hide keys ⌄';$('listenNotesKeyboard').setAttribute('aria-expanded',String(!noteKeys.hidden));});
 document.querySelectorAll('[data-note]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')e.preventDefault();});
  b.addEventListener('click',()=>{
   const v=b.dataset.note,start=Math.min(notesCaret,noteArea.value.length),end=Math.min(notesEnd,noteArea.value.length);
   const insert=v==='newline'?'\n':v==='backspace'?'':v;
   const from=v==='backspace'&&start===end?Math.max(0,start-1):start;
   noteArea.setRangeText(insert,from,end,'end');captureCaret();
   noteArea.dispatchEvent(new Event('input',{bubbles:true}));
   // Do not focus the textarea; Morse keys must work without opening the native keyboard.
   b.classList.remove('pulse');void b.offsetWidth;b.classList.add('pulse');
   setTimeout(()=>b.classList.remove('pulse'),950);
  });
 });
 document.addEventListener('morse:library-open-audio',async e=>{const entry=e.detail;const saved=entry.audio?entry:await getMessage(entry.id);if(saved?.audio)await load(saved.audio,saved.title,{id:saved.id,persist:false,notes:saved.notes});});
 document.addEventListener('morse:workspace',e=>{if(e.detail.name==='compose'){audio.pause();void saveNotes();}});
 window.addEventListener('pagehide',()=>{void saveNotes();});
 update();
}
