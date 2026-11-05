import {copy,remove} from '../core/message.js';
// Backspace treats a word boundary as one editable unit before removing its letter.
export function backspace(chars,{selectedIndex=-1,pendingWord=false}={}){
  if(pendingWord)return {chars:copy(chars),pendingWord:false,deleted:'space'};
  if(!chars.length)return {chars:[],pendingWord:false,deleted:'none'};
  const i=selectedIndex>=0?selectedIndex:chars.length-1;
  if(selectedIndex<0 && chars[i].wordBefore){
    const next=copy(chars);next[i].wordBefore=false;
    return {chars:next,pendingWord:false,deleted:'space'};
  }
  const pending=i===chars.length-1 && !!chars[i].wordBefore;
  return {chars:remove(chars,i),pendingWord:pending,deleted:'letter'};
}
