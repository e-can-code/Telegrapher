export const KEY='morse-composer-v21';
export const DRAFT_KEY='morse-composer-v21-draft';
export const defaults={chars:[],pitch:600,soundProfile:'classic',speed:15,volume:40,sendBand:'comfortable',autoTempo:true,guidance:'gentle',showDecoded:true};
export function load(){
  try{
    const old=JSON.parse(localStorage.getItem(KEY)||'{}');
    // Opening always starts clean. The last composition is a recoverable draft.
    return {...defaults,...old,chars:[]};
  }catch{return {...defaults};}
}
export function loadDraft(){try{const value=JSON.parse(localStorage.getItem(DRAFT_KEY)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
export function save(state){try{const {chars,...settings}=state;localStorage.setItem(KEY,JSON.stringify(settings));localStorage.setItem(DRAFT_KEY,JSON.stringify(chars));}catch{}}
