import {listMessages,getMessage,deleteMessage,renameMessage} from './storage/library.js';
const $=id=>document.getElementById(id);
export function initLibrary(){
 const dialog=$('libraryDialog'),items=$('libraryItems'),status=$('libraryStatus');let filter='all';
 const filters=[...document.querySelectorAll('[data-library-filter]')];
 async function refresh(){
  items.replaceChildren();status.textContent='';
  try{const entries=(await listMessages()).filter(e=>filter==='all'||(filter==='received'?e.kind==='received':e.kind==='composed'));
   if(!entries.length){const empty=document.createElement('p');empty.className='subtle';empty.textContent='No correspondence here yet.';items.append(empty);return;}
   for(const entry of entries){
    const row=document.createElement('div');row.className='library-entry';if(filter==='all')row.classList.add(entry.kind==='received'?'library-entry-received':'library-entry-composed');
    const open=document.createElement('button');open.type='button';open.className='library-open';
    const title=document.createElement('strong');title.textContent=entry.title||'Untitled message';
    const meta=document.createElement('small');meta.textContent=`${entry.kind==='received'?'Received':'Composed'} · ${new Date(entry.updatedAt).toLocaleDateString()}${entry.notes?' · Notes':''}`;
    open.append(title,meta);open.onclick=async()=>{
      const saved=await getMessage(entry.id);if(!saved)return;
      if(saved.audio){document.querySelector('[data-workspace="listen"]')?.click();document.dispatchEvent(new CustomEvent('morse:library-open-audio',{detail:{...saved,fromLibrary:true}}));}
      else if(saved.chars){document.dispatchEvent(new CustomEvent('morse:library-open-compose',{detail:saved}));document.querySelector('[data-workspace="compose"]')?.click();}
      dialog.close();
    };
    const remove=document.createElement('button');remove.type='button';remove.className='library-delete';remove.textContent='×';remove.title='Delete saved message';remove.setAttribute('aria-label',`Delete ${entry.title||'message'}`);
    remove.onclick=async()=>{if(!confirm('Delete this saved message and its notes?'))return;await deleteMessage(entry.id);await refresh();};
    const rename=document.createElement('button');rename.type='button';rename.className='library-rename';rename.textContent='✎';rename.title='Rename message';rename.setAttribute('aria-label',`Rename ${entry.title||'message'}`);
    rename.onclick=()=>{const editor=document.createElement('input');editor.type='text';editor.maxLength=120;editor.value=title.textContent;editor.className='library-title-editor';editor.setAttribute('aria-label','New message title');title.replaceWith(editor);editor.focus();editor.select();let done=false;
      const finish=async(save)=>{if(done)return;done=true;if(save&&editor.value.trim()){try{const newTitle=await renameMessage(entry.id,editor.value);title.textContent=newTitle;document.dispatchEvent(new Event('morse:library-updated'));}catch(err){status.textContent=err.message;}}editor.replaceWith(title);};
      editor.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void finish(true);}if(event.key==='Escape'){event.preventDefault();void finish(false);}});editor.addEventListener('blur',()=>void finish(true));};
    row.append(open,rename,remove);items.append(row);
   }
  }catch(error){status.textContent='Library unavailable in this browser.';console.warn(error);}
 }
 const openButton=$('libraryBtn');
 if(openButton) openButton.addEventListener('click',()=>{
  if(!dialog.open) dialog.showModal();
  void refresh();
 });
 $('libraryClose').addEventListener('click',()=>dialog.close());
 filters.forEach(button=>button.onclick=()=>{filter=button.dataset.libraryFilter;filters.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));void refresh();});
 document.addEventListener('morse:library-updated',()=>{if(dialog.open)void refresh();});
}
