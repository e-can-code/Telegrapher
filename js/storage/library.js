// The library stores WAV bytes and their notes together, locally in IndexedDB.
const DB_NAME='morse-composer-library';
const STORE='messages';
export function openLibrary(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
async function transact(mode,action){const db=await openLibrary();return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let result;
  try{result=action(store);}catch(error){db.close();reject(error);return;}
  tx.oncomplete=()=>{db.close();resolve(result?.result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};
});}
export const listMessages=async()=>{const rows=await transact('readonly',s=>s.getAll());return rows.sort((a,b)=>b.updatedAt-a.updatedAt);};
export const getMessage=id=>transact('readonly',s=>s.get(id));
export const deleteMessage=id=>transact('readwrite',s=>s.delete(id));
export async function putMessage(entry){const old=await getMessage(entry.id);const now=Date.now();
  return transact('readwrite',s=>s.put({...old,...entry,createdAt:old?.createdAt||now,updatedAt:now}));}
export function messageId(){return crypto.randomUUID?.()||`message-${Date.now()}-${Math.random().toString(36).slice(2)}`;}

export async function renameMessage(id,title){const clean=String(title).trim().slice(0,120);if(!clean)throw new Error("A title is required.");const existing=await getMessage(id);if(!existing)throw new Error("Message not found.");await putMessage({id,title:clean,titleMode:'manual'});return clean;}
