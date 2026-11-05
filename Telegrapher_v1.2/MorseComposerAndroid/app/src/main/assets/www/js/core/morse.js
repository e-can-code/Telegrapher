// Store boundaries on characters, not as audio silence. Editing stays lossless.
export const alphabet = {A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.', '.':'.-.-.-',',':'--..--','?':'..--..','/':'-..-.','!':'-.-.--',"'":'.----.',':':'---...','-':'-....-'};
const reverse = Object.fromEntries(Object.entries(alphabet).map(([k,v])=>[v,k]));
export const decode = marks => reverse[marks] || '□';
export function textOf(chars){return chars.map((c,i)=>(i && c.wordBefore?' ':'')+decode(c.marks)).join('');}
export function counts(chars){return {letters:chars.length,words:chars.length?1+chars.slice(1).filter(c=>c.wordBefore).length:0};}
// A dot lasts 1 unit, a dash 3; intra-character, letter and word gaps are 1/3/7.
export function eventsFor(chars,wpm){const unit=1.2/wpm;const events=[];chars.forEach((c,i)=>{if(i)events.push({on:false,seconds:(c.wordBefore?7:3)*unit});[...c.marks].forEach((mark,j)=>{if(j)events.push({on:false,seconds:unit});events.push({on:true,seconds:(mark==='-'?3:1)*unit});});});return events;}
