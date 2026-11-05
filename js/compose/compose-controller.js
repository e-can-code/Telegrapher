import {putMessage,messageId} from '../storage/library.js';
import {SOUND_PROFILES} from '../audio/sound-profiles.js';
import {decode,textOf,counts} from '../core/morse.js';
import {Tempo,unitForWpm} from '../core/tempo.js';
import {classifyMark,boundaryState,INPUT} from '../core/intent.js';
import * as message from '../core/message.js';
import {backspace} from './backspace-model.js';
import {Illumination} from './illumination.js';
import {PlaybackHighlight} from '../audio/playback-timeline.js';
import {startTone,stopTone,setLongTone,warmAudio,wavFor,playWav,stopPlayback,pausePlayback,resumePlayback} from '../audio/synthesis.js';
import {load,save,loadDraft} from '../storage/storage.js';
import {decodeEvents,timingProfile,updateProfile} from '../core/decoder.js';
import {saveSession,loadProfile,saveProfile,archiveMessage,loadHistory,clearLearningData} from '../storage/event-log.js';
const $=id=>document.getElementById(id);
const state=load();
const tempo=new Tempo(unitForWpm(9),state.autoTempo,state.sendBand);
const light=new Illumination($('key'));
const highlighting=new PlaybackHighlight($('tiles'));
let undo=[],redo=[],active=null,lastRelease=null,editIndex=-1,selectedIndex=-1,keyboardDown=false;
let diagnostic=false,pressSamples=[];let explicitGap=null;let lastMark=null;let readyToSave=false;
let rawEvents=[];let lastBoundaryExplicit=false;let lastInferred=false;
let longToneTimer=null;
let boundaryTimer=null;let liveBoundary='inside';
function cancelBoundaryTimer(){if(boundaryTimer!==null)clearTimeout(boundaryTimer);boundaryTimer=null;}
function showBoundary(kind){
  liveBoundary=kind;
  const tile=$('tiles').lastElementChild;
  if(tile)tile.classList.toggle('completed',kind!=='inside');
  render();
  if(kind==='letter')status('Letter complete · ready for next');
  if(kind==='word')status('Word space · ready for next');
}
function scheduleBoundary(){
  cancelBoundaryTimer();
  if(lastRelease===null || !state.chars.length)return;
  const thresholds=INPUT[state.sendBand]||INPUT.comfortable;
  const releasedAt=lastRelease;
  // Check elapsed time again when timers wake after a background-tab delay.
  const update=()=>{
    if(active || lastRelease!==releasedAt || explicitGap)return;
    const elapsed=performance.now()-releasedAt;
    showBoundary(boundaryState(elapsed,state.sendBand));
    if(elapsed<thresholds.word){
      const next=elapsed<thresholds.letter?thresholds.letter:thresholds.word;
      boundaryTimer=setTimeout(update,Math.max(1,next-elapsed+1));
    }else boundaryTimer=null;
  };
  boundaryTimer=setTimeout(update,thresholds.letter+1);
}

let profile=loadProfile() || timingProfile(state.sendBand);
const session={id:crypto.randomUUID?.() || String(Date.now()),startedAt:new Date().toISOString(),events:[]};
let suggestions=[];
function recordSession(){saveSession(session);}
function showSuggestions(){
  const box=$('suggestions');box.replaceChildren();
  suggestions=decodeEvents(rawEvents.slice(-35),profile,3);
  if(rawEvents.length<2 || rawEvents.length>35 || !suggestions.length){box.hidden=true;return;}
  const title=document.createElement('span');title.textContent='Other readings · ';box.append(title);
  suggestions.forEach((candidate,i)=>{
    const button=document.createElement('button');button.className='text-btn';
    button.textContent=textOf(candidate.chars);button.title='Apply this reading to the current composition';
    button.onclick=()=>{if(rawEvents.length>35){status('Suggestions cover only the latest 35 marks');return;}
      change(candidate.chars);session.events.push({type:'correction',at:Date.now(),decisions:candidate.decisions});recordSession();
      const labeled=rawEvents.map((e,j)=>({...e,confirmedMark:candidate.decisions[j]?.mark}));
      profile=updateProfile(profile,labeled);saveProfile(profile);status('Reading applied · Undo to restore');showSuggestions();};
    box.append(button);
  });box.hidden=false;
}
function status(value){$('status').textContent=value;}
function remember(){undo.push(message.copy(state.chars));if(undo.length>100)undo.shift();redo=[];}
function change(next){remember();state.chars=next;if(selectedIndex>=next.length)selectedIndex=-1;readyToSave=true;render();}
let libraryDraftId=sessionStorage.getItem('morse-library-draft-id')||messageId();
try{sessionStorage.setItem('morse-library-draft-id',libraryDraftId);}catch{}
let librarySaveTimer;
function queueLibrarySave(){
  clearTimeout(librarySaveTimer);
  if(!state.chars.length)return;
  const chars=message.copy(state.chars),title=textOf(chars).trim().slice(0,55)||'Untitled composition';
  librarySaveTimer=setTimeout(()=>{void putMessage({id:libraryDraftId,kind:'composed',title,chars,audio:wavFor(chars,state.speed,state.pitch,state.soundProfile)}).then(()=>document.dispatchEvent(new Event('morse:library-updated'))).catch(console.warn);},450);
}
document.addEventListener('morse:library-open-compose',event=>{cancelBoundaryTimer();stop();state.chars=message.copy(event.detail.chars||[]);libraryDraftId=event.detail.id;try{sessionStorage.setItem('morse-library-draft-id',libraryDraftId);}catch{}readyToSave=true;render();});
function render(){
  const tiles=$('tiles');tiles.replaceChildren();
  state.chars.forEach((c,i)=>{
    const tile=document.createElement('button');tile.className='tile'+(c.wordBefore?' word-start':'')+(i===state.chars.length-1 && liveBoundary!=='inside'?' completed':'');
    tile.setAttribute('aria-label',`Edit character ${i+1}: ${decode(c.marks)}`);
    const marks=document.createElement('span');marks.className='marks';
    [...c.marks].forEach((mark,j)=>{const span=document.createElement('span');span.className='mark';span.textContent=mark==='.'?'·':'−';span.dataset.index=j;marks.append(span);});
    const letter=document.createElement('span');letter.className='letter';letter.textContent=decode(c.marks);
    tile.append(marks,letter);tile.onclick=()=>openEdit(i);tile.classList.toggle('selected',i===selectedIndex);tiles.append(tile);
  });
  // Open boundaries are visible before the next character arrives.
  if(state.chars.length && (explicitGap==='word'||(liveBoundary==='word'&&!active))){
    const gap=document.createElement('span');gap.className='boundary-space pending-word';gap.setAttribute('role','img');gap.setAttribute('aria-label','Word space');gap.textContent='·';tiles.append(gap);
  }else if(state.chars.length && liveBoundary==='letter'&&!active){
    const gap=document.createElement('span');gap.className='boundary-letter';gap.setAttribute('aria-label','Letter completed');tiles.append(gap);
  }
  $('decoded').textContent=state.showDecoded?(textOf(state.chars)||'Your message appears here'):'Decoded text hidden';
  $('decoded').classList.toggle('empty',!state.chars.length || !state.showDecoded);
  const c=counts(state.chars);$('count').textContent=`${c.letters} letters · ${c.words} words`;
  $('undoBtn').disabled=!undo.length;$('redoBtn').disabled=!redo.length;
  $('playBtn').disabled=$('shareBtn').disabled=!state.chars.length;
  $('clearBtn').disabled=!state.chars.length; $('spaceBtn').disabled=!state.chars.length; $('deleteWordBtn').disabled=!state.chars.length; $('backspaceBtn').disabled=!state.chars.length; if(readyToSave){save(state);queueLibrarySave();}
}
function restore(from,to){if(!from.length)return;cancelBoundaryTimer();liveBoundary='inside';stop();to.push(message.copy(state.chars));state.chars=from.pop();lastRelease=null;render();}
function begin(e){
  if(active || $('editDialog').open || $('settingsDialog').open)return;
  e?.preventDefault();cancelBoundaryTimer();stop();
  if(e?.pointerId!==undefined)try{$('key').setPointerCapture(e.pointerId);}catch{}
  const now=performance.now(),unit=tempo.unit;
  const explicit=explicitGap!==null;
  const gapTime=lastRelease===null?0:now-lastRelease;
  const decision={gap:lastRelease===null&&!explicit?'letter':boundaryState(gapTime,state.sendBand,explicitGap),reconsidered:false};
  liveBoundary='inside';
  active={start:now,unit,gap:decision.gap,gapTime,explicit,reconsidered:decision.reconsidered,device:e?.pointerId!==undefined?'pointer':'keyboard'};explicitGap=null;
  $('key').classList.add('pressed');light.begin(unit);status('Sending…');
  startTone(state.pitch,state.volume/100,state.soundProfile);
  clearTimeout(longToneTimer);longToneTimer=setTimeout(()=>{if(active)setLongTone();},(INPUT[state.sendBand]||INPUT.comfortable).dah);
}
function finish(e,cancel=false){
  if(!active)return;e?.preventDefault();
  const now=performance.now(),duration=now-active.start,{unit,gap,gapTime,explicit,reconsidered}=active;
  const activeStart=active.start,inputDevice=active.device;
  active=null;clearTimeout(longToneTimer);$('key').classList.remove('pressed');stopTone();
  if(cancel){light.reset();lastRelease=null;status('Interrupted');return;}
  lastRelease=now;light.release(unit);liveBoundary='inside';
  if(duration>=25){
    const mark=classifyMark(duration,state.sendBand);
    change(message.add(state.chars,mark,gap));
    rawEvents.push({durationMs:duration,gapMs:gapTime,forcedMark:null,explicitGap:explicit?gap:null});
    session.events.push({type:'mark',startMs:activeStart, durationMs:duration, gapMs:gapTime,device:inputDevice,style:state.sendBand,at:Date.now()});recordSession();
    if(rawEvents.length>500)rawEvents.shift();
    lastBoundaryExplicit=explicit;lastInferred=!explicit;
    tempo.observe(duration,mark);lastMark=mark;pressSamples.push({duration:Math.round(duration),mark,unit:Math.round(unit),gap});
    if(pressSamples.length>20)pressSamples.shift();
    $('tiles').scrollLeft=$('tiles').scrollWidth;showSuggestions();scheduleBoundary();
  }
  status(reconsidered?'Kept marks together · edit any boundary':'Ready');updateDiagnostics();
}
$('key').addEventListener('pointerdown',begin);
$('key').addEventListener('pointerup',finish);
$('key').addEventListener('pointercancel',e=>finish(e,true));
$('key').addEventListener('lostpointercapture',e=>finish(e,true));
// Space sends from anywhere except editable controls; keyboard repeat is ignored.
document.addEventListener('keydown',e=>{
  if(e.code!=='Space'||e.repeat||keyboardDown||e.target.closest('dialog,input,select,textarea,button:not(#key)'))return;
  e.preventDefault();keyboardDown=true;begin(e);
});
document.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboardDown){keyboardDown=false;finish(e);}});
window.addEventListener('blur',()=>{keyboardDown=false;finish(null,true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keyboardDown=false;finish(null,true);}});
$('undoBtn').onclick=()=>restore(undo,redo);$('redoBtn').onclick=()=>restore(redo,undo);
$('spaceBtn').onclick=()=>{
  if(!state.chars.length)return;
  const index=selectedIndex>=0&&selectedIndex<state.chars.length?selectedIndex:state.chars.length-1;
  if(index===state.chars.length-1){
    // Keep a pending word boundary for the next press; no empty character.
    explicitGap='word';lastRelease=null;cancelBoundaryTimer();showBoundary('word');
    status('Word space ready');
  }else{change(message.insertWordSpace(state.chars,index));status('Word space inserted');}
  selectedIndex=-1;render();
};
function removeWholeWord(index){
  if(!state.chars.length)return;
  change(message.deleteWord(state.chars,index));selectedIndex=-1;
  lastRelease=null;explicitGap='letter';cancelBoundaryTimer();
  status('Word deleted · Undo to restore');
}
// Backspace removes one character; clearing and word deletion stay in More.
$('backspaceBtn').onclick=()=>{
  if(!state.chars.length)return;
  cancelBoundaryTimer();
  const result=backspace(state.chars,{
    selectedIndex,
    pendingWord:selectedIndex<0&&(explicitGap==='word'||liveBoundary==='word')
  });
  if(result.deleted==='none')return;
  if(result.deleted!=='space'||JSON.stringify(result.chars)!==JSON.stringify(state.chars))change(result.chars);
  selectedIndex=-1;lastRelease=null;
  explicitGap=result.pendingWord?'word':'letter';
  liveBoundary=result.pendingWord?'word':'letter';
  render();status(result.deleted==='space'?'Space deleted':'Character deleted · Undo to restore');
};
$('deleteWordBtn').onclick=()=>removeWholeWord(selectedIndex>=0?selectedIndex:state.chars.length-1);
$('deleteSelectedWord').onclick=()=>{removeWholeWord(editIndex);$('editDialog').close();};
$('clearBtn').onclick=()=>{if(!state.chars.length)return;selectedIndex=-1;cancelBoundaryTimer();liveBoundary='inside';archiveMessage(message.copy(state.chars));clearTimeout(librarySaveTimer);libraryDraftId=messageId();try{sessionStorage.setItem('morse-library-draft-id',libraryDraftId);}catch{}change([]);lastRelease=null;explicitGap=null;lastBoundaryExplicit=false;rawEvents=[];showSuggestions();light.reset();status('New message · Undo to restore');};
$('letterBtn').onclick=()=>{cancelBoundaryTimer();showBoundary('letter');explicitGap='letter';lastRelease=null;lastBoundaryExplicit=true;status('Next mark begins a letter');};
$('wordBtn').onclick=()=>{cancelBoundaryTimer();showBoundary('word');explicitGap='word';lastRelease=null;lastBoundaryExplicit=true;status('Next mark begins a word');};
$('resumeBtn').onclick=()=>{const draft=previousDraft;if(draft.length){change(draft);$('resumeBtn').hidden=true;status('Draft restored');}};
function openEdit(i){selectedIndex=i;editIndex=i;render();renderEdit();$('editDialog').showModal();}
function renderEdit(){
  const c=state.chars[editIndex];if(!c)return;
  $('editPosition').textContent=`Character ${editIndex+1} of ${state.chars.length}`;
  $('editDecoded').textContent=`Decoded: ${decode(c.marks)}`;
  const el=$('editMarks');el.replaceChildren();
  [...c.marks].forEach((mark,j)=>{const b=document.createElement('button');b.textContent=mark==='.'?'·':'−';b.title='Switch dit/dah';b.onclick=()=>edit(message.toggleMark(state.chars,editIndex,j));el.append(b);});
  $('splitPosition').max=Math.max(1,c.marks.length-1);$('splitPosition').value=Math.min(Number($('splitPosition').value)||1,c.marks.length-1)||1;
  $('splitChar').disabled=c.marks.length<2;$('joinPrev').disabled=$('toggleWord').disabled=editIndex===0;
}
function edit(next){if(JSON.stringify(next)===JSON.stringify(state.chars))return;change(next);if(!state.chars.length){$('editDialog').close();return;}editIndex=Math.min(editIndex,state.chars.length-1);renderEdit();}
$('addDit').onclick=()=>{const next=message.copy(state.chars);next[editIndex].marks+='.';edit(next);};
$('addDah').onclick=()=>{const next=message.copy(state.chars);next[editIndex].marks+='-';edit(next);};
$('removeMark').onclick=()=>{const next=message.copy(state.chars);const c=next[editIndex];c.marks=c.marks.slice(0,-1);edit(c.marks?next:message.remove(next,editIndex));};
$('deleteChar').onclick=()=>edit(message.remove(state.chars,editIndex));
$('toggleWord').onclick=()=>edit(message.boundary(state.chars,editIndex));
$('joinPrev').onclick=()=>{const i=editIndex;edit(message.join(state.chars,i));editIndex=Math.max(0,i-1);if($('editDialog').open)renderEdit();};
$('splitChar').onclick=()=>edit(message.split(state.chars,editIndex,Number($('splitPosition').value)));
$('doneEdit').onclick=$('closeEdit').onclick=()=>$('editDialog').close();
$('editDialog').addEventListener('close',()=>{editIndex=-1;lastRelease=null;render();});
const soundSelect=$('soundProfile');
for(const p of SOUND_PROFILES){const option=document.createElement('option');option.value=p.id;option.textContent=p.name+(p.kind==='radio'?' · radio':' · instrument');soundSelect.append(option);}
state.soundProfile=state.soundProfile||'classic';soundSelect.value=state.soundProfile;
soundSelect.onchange=()=>{state.soundProfile=soundSelect.value;save(state);};
$('settingsBtn').onclick=()=>{warmAudio();$('settingsDialog').showModal();};
$('closeSettings').onclick=$('doneSettings').onclick=()=>$('settingsDialog').close();
for(const [id,suffix] of [['pitch',' Hz'],['speed',' WPM'],['volume','%']]){
  $(id).value=state[id];$(id+'Value').textContent=state[id]+suffix;
  $(id).oninput=()=>{state[id]=Number($(id).value);$(id+'Value').textContent=state[id]+suffix;
    save(state);updateDiagnostics();};
}
state.keyFeel=state.keyFeel||'tactile';$('keyFeel').value=state.keyFeel;$('key').dataset.feel=state.keyFeel;
$('keyFeel').onchange=()=>{state.keyFeel=$('keyFeel').value;$('key').dataset.feel=state.keyFeel;save(state);};
$('sendBand').value=state.sendBand;
$('sendBand').onchange=()=>{cancelBoundaryTimer();state.sendBand=$('sendBand').value;profile=timingProfile(state.sendBand);saveProfile(profile);tempo.setBand(state.sendBand);save(state);updateDiagnostics();status('Sending feel updated');scheduleBoundary();};
$('autoTempo').checked=state.autoTempo;
$('autoTempo').onchange=()=>{state.autoTempo=$('autoTempo').checked;tempo.automatic=state.autoTempo;save(state);};
$('guidance').value=state.guidance;
$('guidance').onchange=()=>{state.guidance=$('guidance').value;applyGuidance();save(state);};
$('showDecoded').checked=state.showDecoded;
$('showDecoded').onchange=()=>{state.showDecoded=$('showDecoded').checked;render();};
function applyGuidance(){$('key').dataset.guidance=state.guidance;}
applyGuidance();
let composeAudio=null;
function playbackControls(mode){
  const playing=mode==='playing',paused=mode==='paused';
  $('playBtn').innerHTML=playing?'Ⅱ <span>Pause</span>':paused?'▶ <span>Resume</span>':'▶ <span>Play</span>';
  $('playBtn').dataset.playing=playing?'yes':'no';
  $('stopBtn').hidden=!(playing||paused);
}
function stop(){stopPlayback();composeAudio=null;highlighting.stop();playbackControls('idle');}
$('stopBtn').onclick=()=>{stop();status('Ready');};
$('playBtn').onclick=()=>{
  if(composeAudio&&!composeAudio.paused){pausePlayback();highlighting.pause();playbackControls('paused');status('Paused');return;}
  if(composeAudio&&composeAudio.paused){void resumePlayback().then(()=>{highlighting.resume();playbackControls('playing');status('Playing…');});return;}
  status('Playing…');
  // Move the strip to its first character before playback starts.
  $('tiles').scrollLeft=0;
  $('tiles').querySelectorAll('.tile').forEach(tile=>tile.classList.remove('playing','word-gap-playing'));
  // Ensure the first tile is in view before audio is started.
  void $('tiles').offsetWidth;
  composeAudio=playWav(wavFor(state.chars,state.speed,state.pitch,state.soundProfile),()=>{composeAudio=null;highlighting.stop();playbackControls('idle');status('Ready');});
  highlighting.start(state.chars,state.speed,composeAudio);
  playbackControls('playing');
};
$('shareBtn').onclick=async()=>{
  const file=new File([wavFor(state.chars,state.speed,state.pitch,state.soundProfile)],'morse-message.wav',{type:'audio/wav'});
  try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Morse message'});status('Shared');return;}}
  catch(e){if(e.name==='AbortError')return;}
  if(window.AndroidFiles?.saveWav){const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));window.AndroidFiles.saveWav(file.name,btoa(binary));status('WAV sent to Android Downloads');}else{const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status('WAV downloaded');}
};
function updateDiagnostics(){if(!diagnostic)return;$('diagnostics').textContent=`Guidance clock: ${tempo.unit.toFixed(1)} ms (${(1200/tempo.unit).toFixed(1)} WPM)\nObservations: ${tempo.samples.length} · Raw events: ${rawEvents.length}\n${pressSamples.slice(-8).map(x=>`${x.mark} ${x.duration} ms · clock ${x.unit} ms · ${x.gap}`).join('\n')}`;}
// Hidden developer overlay: Ctrl+Shift+D. Never part of the normal workflow.
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='KeyD'){e.preventDefault();diagnostic=!diagnostic;$('diagnostics').hidden=!diagnostic;updateDiagnostics();}});
$('historyBtn').onclick=()=>{const items=loadHistory();$('historyItems').replaceChildren();
  for(const item of items){const b=document.createElement('button');b.className='text-btn';b.textContent=`${new Date(item.date).toLocaleString()} · ${textOf(item.chars)}`;b.onclick=()=>{change(item.chars);$('historyDialog').close();};$('historyItems').append(b);}
  if(!items.length)$('historyItems').textContent='No archived messages yet.'; $('historyDialog').showModal();};
$('closeHistory').onclick=()=>$('historyDialog').close();
$('resetLearning').onclick=()=>{clearLearningData();profile=timingProfile(state.sendBand);saveProfile(profile);status('Timing profile reset');};
const previousDraft=loadDraft();$('resumeBtn').hidden=!previousDraft.length;render();
// Service worker registration is deferred until Android packaging.

// Optional bridge: Listen never needs this module to initialize or import a WAV.
document.addEventListener('morse:request-export', event => {
  const {accept, reject} = event.detail || {};
  if (!state.chars.length) { reject?.('Compose a message first, or open a WAV.'); return; }
  try { accept?.(wavFor(state.chars, state.speed, state.pitch, state.soundProfile)); }
  catch (error) { reject?.(error.message || 'Unable to export this composition.'); }
});
function announceComposeAvailability() {
  document.dispatchEvent(new CustomEvent('morse:compose-availability', {detail: {available: state.chars.length > 0}}));
}
document.addEventListener('morse:workspace', event => {
  if (event.detail.name === 'listen') announceComposeAvailability();
});
announceComposeAvailability();
