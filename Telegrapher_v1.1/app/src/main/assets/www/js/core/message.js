// A boundary belongs to the following character; marks remain editable.
export function copy(chars) { return chars.map(c => ({marks:c.marks,wordBefore:!!c.wordBefore})); }
export function add(chars, mark, gap) {
  const next = copy(chars);
  if (!next.length || gap !== 'inside') next.push({marks:mark,wordBefore:next.length>0 && gap==='word'});
  else next[next.length-1].marks += mark;
  return next;
}
export function toggleMark(chars, i, j) {
  const next=copy(chars),c=next[i];
  if(!c || j<0 || j>=c.marks.length) return next;
  c.marks=c.marks.slice(0,j)+(c.marks[j]==='.'?'-':'.')+c.marks.slice(j+1);
  return next;
}
export function split(chars,i,at) {
  const next=copy(chars),c=next[i];
  if(!c || at<1 || at>=c.marks.length) return next;
  next.splice(i,1,{marks:c.marks.slice(0,at),wordBefore:c.wordBefore},{marks:c.marks.slice(at),wordBefore:false});
  return next;
}
export function join(chars,i) {
  const next=copy(chars);
  if(i<1 || i>=next.length) return next;
  next[i-1].marks+=next[i].marks;next.splice(i,1);
  return next;
}
export function remove(chars,i) {
  const next=copy(chars);
  if(i<0 || i>=next.length) return next;
  const removed=next.splice(i,1)[0];
  if(removed.wordBefore && next[i] && i>0)next[i].wordBefore=true;
  if(next[0])next[0].wordBefore=false;
  return next;
}
export function boundary(chars,i) {
  const next=copy(chars);
  if(i>0 && i<next.length)next[i].wordBefore=!next[i].wordBefore;
  return next;
}

// A word begins at the first character or at a wordBefore boundary.
export function wordRange(chars,index=chars.length-1){
  if(!chars.length || index<0 || index>=chars.length)return null;
  let start=index,end=index+1;
  while(start>0 && !chars[start].wordBefore)start--;
  while(end<chars.length && !chars[end].wordBefore)end++;
  return {start,end};
}
export function deleteWord(chars,index=chars.length-1){
  const range=wordRange(chars,index);if(!range)return copy(chars);
  const next=copy(chars);const wasBoundary=!!next[range.start].wordBefore;
  next.splice(range.start,range.end-range.start);
  if(next[range.start] && range.start>0 && wasBoundary)next[range.start].wordBefore=true;
  if(next[0])next[0].wordBefore=false;
  return next;
}
export function insertWordSpace(chars,index=chars.length-1){
  const next=copy(chars);
  if(index<0 || index>=next.length)return next;
  // A trailing space is pending until the next mark creates a character.
  if(index+1<next.length)next[index+1].wordBefore=true;
  return next;
}
