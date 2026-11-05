// Initializing Listen independently keeps a failed renderer from leaving
// the navigation permanently blank, and provides an observable failure state.
import {initLibrary} from './library-controller.js';
initLibrary();
import('./listen/quiet-controller.js').then(({initQuiet})=>initQuiet()).catch(error=>{
 console.error('Listening Room startup failed',error);
 const message=document.getElementById('listenError');
 if(message)message.textContent='Listening Room initialization failed. Reload the page or try Quiet. '+error.message;
 const receiver=document.getElementById('receiverInstrument');
 if(receiver){receiver.hidden=false;const hint=document.getElementById('receiverHint');if(hint)hint.textContent='Receiver could not initialize: '+error.message;}
});
import('./compose/compose-controller.js').catch(error=>console.error('Compose initialization failed',error));
// Android bundles all assets and does not need a browser service worker.
if('serviceWorker' in navigator && location.hostname!=='appassets.androidplatform.net'){
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('./sw.js?v=2.3.1').then(reg=>reg.update()).catch(error=>console.warn('Offline cache unavailable',error));
 });
}
