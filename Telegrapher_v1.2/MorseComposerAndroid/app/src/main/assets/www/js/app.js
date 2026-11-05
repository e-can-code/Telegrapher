import {initLibrary} from './library-controller.js';
import {initQuiet} from './listen/quiet-controller.js';
initLibrary();
initQuiet();
import('./compose/compose-controller.js').catch(error=>console.error('Compose initialization failed',error));
