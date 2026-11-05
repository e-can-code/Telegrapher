import {detectSignal} from './signal-analysis.js';
import {exactAnalysis} from '../audio/clean-morse.js';
import {ListeningTransport} from '../audio/listening-transport.js';
import {createLivingField} from './living-field.js';
import {ReceiverScope} from './receiver-scope.js';
import {signalEnvelope} from './signal-envelope.js';
import {CelestialReceiver} from './celestial-receiver.js';
import {putMessage, getMessage, messageId} from '../storage/library.js';
const $=id=>document.getElementById(id);
const clock=t=>`${Math.floor((t||0)/60)}:${String(Math.floor((t||0)%60)).padStart(2,'0')}`;
export function initQuiet(){
 const audio=new ListeningTransport();
 let recordId=null,loaded=false,raf=0,lastNotes='',notesTimer=0,loading=0;
 let mode='quiet',words=[],tones=[],selectionArmed=false;
 let fireflyFrame=0;
 const scope=new ReceiverScope();
 const error=message=>{$('listenError').textContent=message||'';};
 const duration=()=>Number.isFinite(audio.duration)?audio.duration:scope.duration;
 const notify=()=>document.dispatchEvent(new Event('morse:library-updated'));
 const living=createLivingField($('livingCanvas'));
 living.configure({position:()=>audio.currentTime,duration:()=>duration(),playing:()=>!audio.paused,events:[]});
 let renderer,rendererFailed=false;
 try{
   renderer=new CelestialReceiver({canvas:$('receiverCanvas'),scope,
     getPlayback:()=>({position:audio.visualPosition,playing:audio.isMorseAudible,rate:audio.playbackRate,loaded}),
     onWord:i=>focusWord(i),onGroup:i=>enterGroup(i),onBack:()=>stepOut()});
 }catch(e){
   rendererFailed=true;
   console.error('Receiver renderer initialization failed',e);
   $('receiverHint').textContent='The celestial renderer could not start. Playback and word navigation remain available.';
   renderer={layout:{name:'RECEIVER',groups:[]},start(){},stop(){},configure(){},resize(){}};
 }
 function updateReceiverControls(){
   const focused=scope.view==='focus'&&scope.selected>=0;
   $('receiverTitle').textContent=!words.length?'THE RECEIVER':focused?'FOCUSED · WORD '+(scope.selected+1):scope.view==='group'?'PASSAGE '+(scope.group+1):renderer.layout.name.toUpperCase();
   $('receiverCount').textContent=loaded?`${words.length} ${words.length===1?'word':'estimated words'}`:'Open a recording in Quiet';
   $('receiverWordNumber').max=String(Math.max(1,words.length));
   if(focused)$('receiverWordNumber').value=String(scope.selected+1);
   $('receiverBack').hidden=scope.view==='overview'||words.length<=1;
   $('receiverHint').textContent=rendererFailed?'Celestial renderer unavailable; use the Word number and transport below':!loaded?'Load a WAV in Quiet first':!words.length?'No reliable boundaries; whole recording remains playable':focused?`Word ${scope.selected+1} of ${words.length} · Double tap empty sky to return`:scope.view==='group'?`Passage ${scope.group+1} · Touch a word to focus`:renderer.layout.count>35?'Touch a luminous cluster to explore':'Touch a celestial body to focus; move the pointer to explore nearby stardust';
   $('receiverStatus').textContent=focused?`WORD ${scope.selected+1} · ${clock(words[scope.selected].start)}–${clock(words[scope.selected].end)}`:scope.view==='group'?'CELESTIAL FAMILY':'WHOLE RECORDING';
   for(const id of ['receiverLoop','listenLoop'])$(id).setAttribute('aria-pressed',String(scope.loop));
   const pause=!audio.paused;
   $('receiverPlay').textContent=pause?'Ⅱ':'▶';$('receiverPlay').setAttribute('aria-label',pause?'Pause':'Play');
   $('receiverSpeed').textContent=Number(audio.playbackRate.toFixed(2))+'×';
   $('receiverAudioMode').textContent=audio.mode==='clean'?'Clean':'Original';
 }
 function showMode(next){
   mode=next==='receiver'?'receiver':'quiet';
   // Changing rooms does not create a new player, seek, or silently begin playback.
   if(mode==='quiet'){
     scope.overview();scope.setLoop(scope.loop);
   }
   $('listenStage').hidden=mode!=='quiet';
   $('listenView').classList.toggle('receiver-active',mode==='receiver');
   $('receiverInstrument').hidden=mode!=='receiver';
   document.querySelectorAll('[data-listen-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.listenMode===mode)));
   living.stop();
   if(mode==='receiver'){
     // Receiver begins as an open observatory, never underneath an expanded note editor.
     const panel=$('listenNotesPanel');
     if(!panel.hidden){panel.hidden=true;$('listenNotesToggle').setAttribute('aria-expanded','false');
       $('listenView').classList.remove('notes-open');document.body.classList.remove('notes-writing','native-notes-keyboard');
       $('listenNotesText').blur();document.documentElement.style.removeProperty('--tg-visual-height');
       void saveNotes();}
     renderer.start();
   }else renderer.stop();
   updateReceiverControls();
 }
 function seekTo(time){if(!loaded)return;audio.currentTime=Math.max(0,Math.min(duration(),time));update();}
 function focusWord(index){
   if(!loaded||!words.length)return;
   const start=scope.focus(index);if(start===null)return;
   audio.pause();seekTo(start);selectionArmed=true;updateReceiverControls();
 }
 function enterGroup(index){
   if(!loaded)return;audio.pause();scope.enterGroup(index);updateReceiverControls();
 }
 function stepOut(){
   if(!loaded)return;audio.pause();const position=scope.back();
   if(position!==null)seekTo(position);selectionArmed=false;updateReceiverControls();
 }
 function neighbor(direction){
   if(!loaded||!words.length)return;
   audio.pause();const pos=scope.neighbor(direction);if(pos!==null)seekTo(pos);
   selectionArmed=true;updateReceiverControls();
 }
 async function togglePlayback(){
   if(!loaded){error('Open a WAV in Quiet first.');return;}
   try{
     if(!audio.paused){audio.pause();updateReceiverControls();return;}
     const region=scope.interval();
     const reset=selectionArmed||audio.currentTime<region.start||audio.currentTime>=region.end-.012;
     if(reset)audio.currentTime=region.start;
     const cue=reset||audio.currentTime<=region.start+.015;
     selectionArmed=false;error('');
     await audio.play({start:region.start,end:region.end,loop:scope.loop,
                       gap:scope.view==='focus'?.36:.62,cue});
     updateReceiverControls();
   }catch(e){error('Playback failed: '+e.message);console.error(e);}
 }
 document.querySelectorAll('[data-listen-mode]').forEach(b=>b.addEventListener('click',()=>showMode(b.dataset.listenMode)));
 $('receiverPrevious').addEventListener('click',()=>neighbor(-1));
 $('receiverNext').addEventListener('click',()=>neighbor(1));
 $('receiverPlay').addEventListener('click',()=>void togglePlayback());
 $('receiverLoop').addEventListener('click',()=>toggleLoop());
 $('receiverBack').addEventListener('click',stepOut);
 $('receiverFind').addEventListener('click',()=>focusWord(Math.max(0,Math.min(words.length-1,Math.round(Number($('receiverWordNumber').value)||1)-1))));
 $('receiverWordNumber').addEventListener('keydown',e=>{if(e.key==='Enter')$('receiverFind').click()});
 $('receiverSpeed').addEventListener('click',()=>{
   const options=[.5,.75,1,1.25,1.5,2];const current=options.findIndex(v=>Math.abs(v-audio.playbackRate)<.01);
   void setSpeed(options[(current+1)%options.length]);
 });
 $('receiverAudioMode').addEventListener('click',()=>void setAudioMode(audio.mode==='clean'?'original':'clean'));
 function toggleLoop(){
  const playing=!audio.paused,region=scope.interval();scope.setLoop(!scope.loop);
  if(playing){audio.pause();void audio.play({start:region.start,end:region.end,loop:scope.loop,
    gap:scope.view==='focus'?.36:.62,cue:false}).catch(e=>error('Loop failed: '+e.message));}
  updateReceiverControls();
 }
 showMode('quiet');
 function update(){
  const d=duration(),p=d?Math.min(1,audio.currentTime/d):0;
  $('listenCurrent').textContent=clock(audio.currentTime);$('listenDuration').textContent=clock(d);
  $('listenSeek').value=String(Math.round(p*1000));
  $('listenTraceLight').style.left=`${p*100}%`;
  $('listenPlay').textContent=audio.paused?'▶':'Ⅱ';$('listenPlay').setAttribute('aria-label',audio.paused?'Play':'Pause');
  updateReceiverControls();
 }
 function animateFirefly(now){
   const light=$('listenTraceLight');
   const activePlayback=!audio.paused;
   const intensity=signalEnvelope(audio.visualPosition,tones,audio.isMorseAudible);
   const breathing=.5+.5*Math.sin(now*.00175);
   // The ambient pulse continues at rest. During playback, only measured tones
   // create a strong flare; there is no independent blinking animation.
   const glow=activePlayback ? intensity : .19+.12*breathing;
   light.style.setProperty('--firefly-glow',glow.toFixed(3));
   light.style.setProperty('--firefly-scale',(1+.25*glow).toFixed(3));
   light.style.boxShadow=activePlayback ? `0 0 ${4+22*glow}px ${1+9*glow}px rgba(247,224,169,${(.12+.70*glow).toFixed(3)}), 0 0 ${9+55*glow}px ${2+18*glow}px rgba(211,192,126,${(.05+.32*glow).toFixed(3)})` : `0 0 ${9+17*glow}px ${2+9*glow}px rgba(247,224,169,.74), 0 0 ${25+48*glow}px ${8+17*glow}px rgba(211,192,126,.32)`;
   fireflyFrame=requestAnimationFrame(animateFirefly);
 }
 fireflyFrame=requestAnimationFrame(animateFirefly);
 function animate(){update();if(!audio.paused)raf=requestAnimationFrame(animate);}
 function stopAnimation(){cancelAnimationFrame(raf);update();}
 audio.addEventListener('play',()=>{cancelAnimationFrame(raf);animate();});
 audio.addEventListener('pause',stopAnimation);audio.addEventListener('seeked',update);
 audio.addEventListener('loadedmetadata',()=>{if(loaded&&scope.duration===0)scope.duration=duration();update();});audio.addEventListener('timeupdate',update);
 audio.addEventListener('ended',()=>{stopAnimation();selectionArmed=true;});
 audio.addEventListener('error',()=>error('The audio could not be played. Try a PCM WAV recording.'));
 async function saveNotes(){if(!recordId)return;const notes=$('listenNotesText').value;if(notes===lastNotes)return;lastNotes=notes;try{await putMessage({id:recordId,notes});notify();}catch(e){error('Could not save notes: '+e.message);}}
 async function load(blob,name,{id=null,persist=true,notes=null,meta=null}={}){
  if(!(blob instanceof Blob)){error('No playable audio was provided.');return;}
  const token=++loading;loaded=false;words=[];tones=[];scope.reset([],0);renderer.configure([],[]);audio.pause();updateModeControls();error('');
  try{await audio.load(blob);}catch(e){loaded=false;error('Could not decode WAV: '+e.message);return;}
  if(token!==loading)return;
  recordId=id||messageId();loaded=true;
  $('listenName').textContent=name||'Received message';$('listenMeta').textContent='WAV · saved locally';
  $('listenEmpty').hidden=true;$('listenStage').classList.add('has-audio');
  $('listenNotesText').value=notes??'';lastNotes=$('listenNotesText').value;
  update();
  if(persist){try{await putMessage({id:recordId,kind:'received',title:name||'Received message',audio:blob,notes:lastNotes,...(meta?{morseMeta:meta}:{})});notify();}catch(e){error('Recording opened, but library saving failed: '+e.message);}}
  if(token!==loading)return;
  try{
    let analysis;
    if(meta?.chars?.length && meta.wpm){analysis=exactAnalysis(meta.chars,meta.wpm,duration());}
    else {
      const buffer=audio.buffer,mono=new Float32Array(buffer.length);
      for(let c=0;c<buffer.numberOfChannels;c++){
        const data=buffer.getChannelData(c);
        for(let i=0;i<mono.length;i++)mono[i]+=data[i]/buffer.numberOfChannels;
      }
      analysis=detectSignal(mono,buffer.sampleRate,buffer.duration);
    }
    if(token===loading){words=analysis.words||[];tones=analysis.tones||[];scope.reset(words,Math.max(duration(),words.at(-1)?.end||0));renderer.configure(words,tones);scope.setGroups(renderer.layout.groups);selectionArmed=false;
     audio.setMorseEvents(tones,{pitch:meta?.pitch||600,profile:meta?.soundProfile||'classic'});
     if(meta?.chars?.length){try{await audio.setMode('clean');}catch(e){console.warn('Clean synthesis unavailable',e);}}
     updateModeControls();updateReceiverControls();living.configure({position:()=>audio.visualPosition,duration:()=>duration(),playing:()=>audio.isMorseAudible,events:tones});}
  }catch(e){if(token===loading){words=[];tones=[];scope.reset([],duration());renderer.configure([],[]);updateModeControls();updateReceiverControls();console.warn('Word detection unavailable',e);error('Word detection unavailable; full recording playback remains available.');}}
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
  document.dispatchEvent(new CustomEvent('morse:request-export',{detail:{accept:async(blob,meta)=>{answered=true;await load(blob,'Composed message.wav',{meta});},reject:reason=>{answered=true;error(String(reason));}}}));
  if(!answered)error('Compose is not ready. Create a message first or open a WAV.');
 });
 $('listenPlay').addEventListener('click',()=>void togglePlayback());
 $('listenBack').addEventListener('click',()=>{if(loaded)seekTo(Math.max(scope.interval().start,audio.currentTime-3));});
 $('listenLoop').addEventListener('click',toggleLoop);
 $('listenSeek').addEventListener('input',e=>{if(duration())seekTo(duration()*Number(e.target.value)/1000);});
 const speed=$('listenSpeedFine');
 async function setSpeed(v){
   const n=Math.max(.5,Math.min(2,Number(v)||1));
   if(!loaded){audio.rate=n;speed.value=String(n);$('listenSpeedLabel').textContent=`${n}×`;updateReceiverControls();return;}
   $('listenSpeedLabel').textContent=`Preparing ${n}×…`;
   try{await audio.setSpeed(n);error('');}
   catch(e){error('Speed change failed: '+e.message);console.warn(e);}
   speed.value=String(audio.playbackRate);
   $('listenSpeedLabel').textContent=`${Number(audio.playbackRate.toFixed(2))}×`;
   document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===audio.playbackRate)));
   updateReceiverControls();
 }
 function updateModeControls(){
   for(const b of document.querySelectorAll('[data-audio-mode]')){
     b.disabled=b.dataset.audioMode==='clean'&&!tones.length;
     b.setAttribute('aria-pressed',String(b.dataset.audioMode===audio.mode));
   }
   $('receiverAudioMode').disabled=!tones.length;
 }
 async function setAudioMode(mode){
   if(!loaded)return;
   error('');
   try{await audio.setMode(mode);updateModeControls();updateReceiverControls();}
   catch(e){error('Audio mode unavailable: '+e.message);}
 }
 document.querySelectorAll('[data-audio-mode]').forEach(b=>b.addEventListener('click',()=>void setAudioMode(b.dataset.audioMode)));
 $('listenFineToggle').addEventListener('click',()=>{const visible=speed.hidden;speed.hidden=!visible;$('listenFineToggle').setAttribute('aria-expanded',String(visible));});
 speed.hidden=true;
 speed.addEventListener('change',()=>void setSpeed(speed.value));document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>void setSpeed(b.dataset.speed)));speed.value='1';$('listenSpeedLabel').textContent='1×';updateModeControls();
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
 noteArea.addEventListener('focus',()=>{document.body.classList.add('native-notes-keyboard');if(mode==='receiver')renderer.stop();setTimeout(positionWriting,180);setTimeout(positionWriting,420);});
 noteArea.addEventListener('blur',()=>{document.body.classList.remove('native-notes-keyboard');document.documentElement.style.removeProperty('--tg-visual-height');if(mode==='receiver')renderer.start();});
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
 document.addEventListener('morse:library-open-audio',async e=>{const entry=e.detail;const saved=entry.audio?entry:await getMessage(entry.id);if(saved?.audio)await load(saved.audio,saved.title,{id:saved.id,persist:false,notes:saved.notes,meta:saved.morseMeta||((saved.chars?.length&&saved.wpm)?{chars:saved.chars,wpm:saved.wpm,pitch:saved.pitch,soundProfile:saved.soundProfile}:null)});});
 document.addEventListener('morse:workspace',e=>{if(e.detail.name==='compose'){cancelReplay();audio.pause();renderer.stop();living.stop();void saveNotes();}else if(mode==='receiver')renderer.start();});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(fireflyFrame);cancelReplay();audio.pause();renderer.stop();void saveNotes();});
 update();
}
