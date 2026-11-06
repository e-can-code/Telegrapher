/* Telegrapher 2.5 offline browser distribution */
(function(){
"use strict";
const modules={
"js/app.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Initializing Listen independently keeps a failed renderer from leaving
// the navigation permanently blank, and provides an observable failure state.
const library_controller_js_1 = require("./library-controller.js");
(0, library_controller_js_1.initLibrary)();
Promise.resolve().then(() => require('./listen/quiet-controller.js')).then(({ initQuiet }) => initQuiet()).catch(error => {
    console.error('Listening Room startup failed', error);
    const message = document.getElementById('listenError');
    if (message)
        message.textContent = 'Listening Room initialization failed. Reload the page or try Quiet. ' + error.message;
    const receiver = document.getElementById('receiverInstrument');
    if (receiver) {
        receiver.hidden = false;
        const hint = document.getElementById('receiverHint');
        if (hint)
            hint.textContent = 'Receiver could not initialize: ' + error.message;
    }
});
Promise.resolve().then(() => require('./compose/compose-controller.js')).catch(error => console.error('Compose initialization failed', error));
// Android bundles all assets and does not need a browser service worker.
if ('serviceWorker' in navigator && location.hostname !== 'appassets.androidplatform.net') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=2.5').then(reg => reg.update()).catch(error => console.warn('Offline cache unavailable', error));
    });
}

},
"js/audio/clean-morse.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exactAnalysis = exactAnalysis;
exports.renderCleanPCM = renderCleanPCM;
const sound_profiles_js_1 = require("./sound-profiles.js");
const morse_js_1 = require("../core/morse.js");
function exactAnalysis(chars, wpm, duration) {
    const events = (0, morse_js_1.eventsFor)(chars, wpm), tones = [], words = [];
    let t = 0, start = 0, wordStart = null, lastTone = null;
    for (const event of events) {
        if (event.on) {
            if (wordStart === null)
                wordStart = t;
            tones.push({ start: t, end: t + event.seconds, mark: event.seconds >= 2 * 1.2 / wpm ? '-' : '.' });
            lastTone = t + event.seconds;
        }
        else if (event.seconds >= (6 * 1.2 / wpm) && wordStart !== null) {
            words.push({ start: wordStart, end: lastTone });
            wordStart = null;
        }
        t += event.seconds;
    }
    if (wordStart !== null)
        words.push({ start: wordStart, end: lastTone });
    return { tones, words: words.map((w, i) => ({ ...w, id: `word-${i + 1}`, label: `Word ${i + 1}`, confidence: 'exact' })), duration };
}
function renderCleanPCM(tones, originalDuration, speed, { pitch = 600, profile = 'classic', sampleRate = 22050 } = {}) {
    if (!(speed >= .5 && speed <= 2))
        throw new RangeError('Unsupported speed');
    const length = Math.ceil(originalDuration * sampleRate / speed), samples = new Float32Array(Math.max(1, length));
    for (const tone of tones) {
        const a = Math.max(0, Math.round(tone.start / speed * sampleRate));
        const b = Math.min(samples.length, Math.round(tone.end / speed * sampleRate));
        if (b <= a)
            continue;
        const seconds = (b - a) / sampleRate, mark = tone.mark || ((tone.end - tone.start) > .17 ? '-' : '.');
        for (let i = a; i < b; i++)
            samples[i] = .62 * (0, sound_profiles_js_1.sampleTone)(profile, mark, pitch, seconds, (i - a) / sampleRate, sampleRate);
    }
    return samples;
}

},
"js/audio/listening-transport.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListeningTransport = void 0;
const clean_morse_js_1 = require("./clean-morse.js");
const time_stretch_js_1 = require("./time-stretch.js");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// One output clock owns both the heard audio and its visual timeline. The
// independent start cue is scheduled here but never enters the Morse event map.
class ListeningTransport extends EventTarget {
    constructor() {
        super();
        this.context = null;
        this.buffer = null;
        this.rendered = null;
        this.renderCache = new Map();
        this.tones = [];
        this.cleanOptions = {};
        this.rate = 1;
        this.mode = 'original';
        this._position = 0;
        this._duration = 0;
        this._volume = 1;
        this.source = null;
        this.startAt = 0;
        this.anchor = 0;
        this.state = 'unloaded';
        this.scope = { start: 0, end: 0 };
        this.gap = .36;
        this.loop = false;
        this.generation = 0;
        this.error = null;
        this.loadSerial = 0;
        this.processing = false;
    }
    contextForPlayback() { this.context ??= new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); return this.context; }
    async load(blob) {
        this.pause();
        const serial = ++this.loadSerial;
        this.state = 'loading';
        this.renderCache.clear();
        this.buffer = null;
        this.tones = [];
        this.cleanOptions = {};
        this._duration = 0;
        const ctx = this.contextForPlayback(), bytes = await blob.arrayBuffer(), buffer = await ctx.decodeAudioData(bytes);
        if (serial !== this.loadSerial)
            return false;
        this.buffer = buffer;
        this._duration = buffer.duration;
        this.scope = { start: 0, end: buffer.duration };
        this._position = 0;
        this.state = 'ready';
        this.mode = 'original';
        this.rendered = null;
        this.emit('loadedmetadata');
        this.emit('timeupdate');
        return true;
    }
    setMorseEvents(tones, options = {}) {
        this.tones = tones.filter(t => t.end > t.start).map(t => ({ start: t.start, end: t.end, ...(t.mark ? { mark: t.mark } : {}) }));
        this.cleanOptions = { ...options };
        for (const key of [...this.renderCache.keys()])
            if (key.startsWith('clean:'))
                this.renderCache.delete(key);
    }
    get duration() { return this._duration; }
    get currentTime() {
        if (this.state !== 'playing')
            return this._position;
        const elapsed = Math.max(0, this.clock() - this.startAt), span = this.scope.end - this.scope.start;
        if (!this.loop)
            return clamp(this.anchor + elapsed * this.rate, this.scope.start, this.scope.end);
        const total = span + this.gap * this.rate;
        if (total <= 0)
            return this.scope.start;
        return this.scope.start + Math.min((this.anchor - this.scope.start + elapsed * this.rate) % total, span);
    }
    set currentTime(v) { this.seek(v); }
    get playbackRate() { return this.rate; }
    get volume() { return this._volume; }
    set volume(v) { this._volume = clamp(Number(v) || 0, 0, 1); if (this.gain)
        this.gain.gain.value = this._volume; }
    get paused() { return this.state !== 'playing'; }
    get visualPosition() {
        if (this.paused)
            return this._position;
        const elapsed = Math.max(0, this.audibleClock() - this.startAt);
        const span = this.scope.end - this.scope.start;
        if (!this.loop)
            return clamp(this.anchor + elapsed * this.rate, this.scope.start, this.scope.end);
        const total = span + this.gap * this.rate;
        if (total <= 0)
            return this.scope.start;
        return this.scope.start + Math.min((this.anchor - this.scope.start + elapsed * this.rate) % total, span);
    }
    // Time since the most recent completed loop interval, measured on the audible
    // output clock. Negative means no completion is currently being presented.
    // The visual renderer never treats this event as a Morse tone.
    get loopCompletionAge() {
        if (!this.loop || this.paused || this.scope.end <= this.scope.start)
            return -1;
        const elapsed = this.audibleClock() - this.startAt;
        if (elapsed < 0)
            return -1;
        const firstDuration = (this.scope.end - this.anchor) / this.rate;
        if (elapsed < firstDuration)
            return -1;
        const cycleDuration = (this.scope.end - this.scope.start) / this.rate + this.gap;
        if (cycleDuration <= 0)
            return -1;
        const age = (elapsed - firstDuration) % cycleDuration;
        return age >= 0 && age < Math.min(.72, this.gap) ? age : -1;
    }
    get isMorseAudible() { return !this.paused && this.audibleClock() >= this.startAt && (this.loop ? this.visualPosition < this.scope.end - 1e-5 : true); }
    // getOutputTimestamp gives context time at audio output, rather than the
    // look-ahead time at which JS may already have scheduled future samples.
    audibleClock() {
        if (!this.context)
            return 0;
        const stamp = this.context.getOutputTimestamp?.();
        if (stamp && stamp.contextTime > 0 && stamp.performanceTime > 0) {
            const elapsed = Math.max(0, (performance.now() - stamp.performanceTime) / 1000);
            return Math.min(this.context.currentTime, stamp.contextTime + elapsed);
        }
        return Math.max(0, this.context.currentTime - (this.context.baseLatency || 0));
    }
    clock() { return this.context?.currentTime || 0; }
    emit(name) { this.dispatchEvent(new Event(name)); }
    setScope({ start, end }, loop = false, gap = .36) {
        const s = clamp(Number(start) || 0, 0, this._duration), e = clamp(Number(end) || this._duration, s, this._duration);
        this.scope = { start: s, end: e };
        this.loop = Boolean(loop);
        this.gap = Math.max(0, Number(gap) || 0);
    }
    seek(time) {
        const p = clamp(Number(time) || 0, 0, this._duration), running = !this.paused;
        this.pause();
        this._position = p;
        this.emit('seeked');
        this.emit('timeupdate');
        if (running)
            void this.play({ cue: false }).catch(e => this.emit('error'));
    }
    pause() {
        if (this.state === 'playing')
            this._position = this.currentTime;
        ++this.generation;
        if (this.cueSource) {
            try {
                this.cueSource.stop();
            }
            catch (_) { }
            this.cueSource = null;
        }
        if (this.source) {
            const src = this.source;
            this.source = null;
            src.onended = null;
            try {
                src.stop();
            }
            catch (_) { }
            try {
                src.disconnect();
            }
            catch (_) { }
        }
        if (this.state === 'playing') {
            this.state = 'paused';
            this.emit('pause');
        }
    }
    makeBuffer(channels, sampleRate) {
        const ctx = this.contextForPlayback(), buf = ctx.createBuffer(channels.length, channels[0].length, sampleRate);
        for (let c = 0; c < channels.length; c++)
            buf.copyToChannel(channels[c], c);
        return buf;
    }
    async prepare() {
        if (!this.buffer)
            throw new Error('Open a WAV before playing.');
        const key = `${this.mode}:${this.rate}`;
        if (this.renderCache.has(key))
            return this.renderCache.get(key);
        this.processing = true;
        try {
            let result;
            if (this.mode === 'clean') {
                if (!this.tones.length)
                    throw new Error('Reliable Morse tone events are unavailable for Clean Morse.');
                const pcm = (0, clean_morse_js_1.renderCleanPCM)(this.tones, this._duration, this.rate, this.cleanOptions);
                result = this.makeBuffer([pcm], this.cleanOptions.sampleRate || 22050);
            }
            else if (this.rate === 1)
                result = this.buffer;
            else {
                // Yield first so browsers can paint a preparation indicator.
                await new Promise(resolve => setTimeout(resolve, 0));
                const chans = Array.from({ length: this.buffer.numberOfChannels }, (_, c) => this.buffer.getChannelData(c));
                result = this.makeBuffer((0, time_stretch_js_1.stretchPCM)(chans, this.buffer.sampleRate, this.rate), this.buffer.sampleRate);
            }
            this.renderCache.set(key, result);
            // A bounded cache avoids retaining every processed version of a large WAV.
            if (this.renderCache.size > 3) {
                const first = this.renderCache.keys().next().value;
                this.renderCache.delete(first);
            }
            return result;
        }
        finally {
            this.processing = false;
        }
    }
    async setSpeed(speed) {
        const value = Number(speed);
        if (!(value >= .5 && value <= 2))
            throw new RangeError('Speed must be between 0.5× and 2×');
        const running = !this.paused, p = this.currentTime;
        this.pause();
        this.rate = value;
        this._position = p;
        await this.prepare();
        this.emit('ratechange');
        if (running)
            await this.play({ cue: false });
    }
    async setMode(mode) {
        if (!['clean', 'original'].includes(mode))
            throw new Error('Unknown sound mode');
        if (mode === 'clean' && !this.tones.length)
            throw new Error('This recording has no reliable Morse event map.');
        const playing = !this.paused, p = this.currentTime;
        this.pause();
        this.mode = mode;
        this._position = p;
        await this.prepare();
        if (playing)
            await this.play({ cue: false });
        this.emit('modechange');
    }
    scheduleCue(at) {
        if (localStorage.getItem('telegrapher-start-cue') === 'off')
            return;
        const ctx = this.context, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(180, at);
        o.frequency.exponentialRampToValueAtTime(92, at + .035);
        g.gain.setValueAtTime(.0001, at);
        g.gain.exponentialRampToValueAtTime(.012 * this._volume, at + .004);
        g.gain.exponentialRampToValueAtTime(.0001, at + .047);
        o.connect(g).connect(ctx.destination);
        o.start(at);
        o.stop(at + .05);
        this.cueSource = o;
        o.onended = () => { if (this.cueSource === o)
            this.cueSource = null; try {
            o.disconnect();
            g.disconnect();
        }
        catch (_) { } };
    }
    async play({ start = this.scope.start, end = this.scope.end, loop = this.loop, gap = this.gap, cue = false } = {}) {
        if (!this.buffer)
            throw new Error('Load a recording first');
        this.setScope({ start, end }, loop, gap);
        if (!this.paused)
            return;
        const ctx = this.contextForPlayback();
        await ctx.resume();
        const gen = this.generation;
        const buffer = await this.prepare();
        if (gen !== this.generation)
            return;
        const pos = clamp(this._position, this.scope.start, this.scope.end);
        const from = pos >= this.scope.end - 1e-4 ? this.scope.start : pos;
        const firstAt = ctx.currentTime + .025;
        const playAt = cue && localStorage.getItem('telegrapher-start-cue') !== 'off' ? firstAt + .105 : firstAt;
        const src = ctx.createBufferSource();
        let audioBuffer = buffer, offset = from / this.rate, duration = (this.scope.end - from) / this.rate;
        if (loop) {
            const a = Math.round(this.scope.start / this.rate * buffer.sampleRate), b = Math.max(a + 1, Math.round(this.scope.end / this.rate * buffer.sampleRate));
            const padded = b - a + Math.max(1, Math.round(this.gap * buffer.sampleRate));
            const cols = Array.from({ length: buffer.numberOfChannels }, (_, c) => {
                const out = new Float32Array(padded);
                out.set(buffer.getChannelData(c).subarray(a, Math.min(b, buffer.length)));
                return out;
            });
            audioBuffer = this.makeBuffer(cols, buffer.sampleRate);
            offset = (from - this.scope.start) / this.rate;
            src.loop = true;
        }
        src.buffer = audioBuffer;
        this.gain ??= ctx.createGain();
        this.gain.gain.value = this._volume;
        src.connect(this.gain);
        this.gain.connect(ctx.destination);
        this.source = src;
        this.anchor = from;
        this.startAt = playAt;
        this.state = 'playing';
        src.onended = () => { if (gen !== this.generation)
            return; this._position = this.scope.end; this.source = null; this.state = 'ended'; this.emit('ended'); this.emit('pause'); this.emit('timeupdate'); };
        if (cue && localStorage.getItem('telegrapher-start-cue') !== 'off')
            this.scheduleCue(firstAt);
        if (loop)
            src.start(playAt, offset);
        else
            src.start(playAt, offset, Math.max(.001, duration));
        this.emit('play');
        this.emit('timeupdate');
    }
}
exports.ListeningTransport = ListeningTransport;

},
"js/audio/playback-timeline.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaybackHighlight = void 0;
exports.timeline = timeline;
// Each tone event carries its character and mark index for visual tracking.
function timeline(chars, wpm) {
    const unit = 1200 / wpm;
    let cursor = 0;
    const entries = [];
    chars.forEach((c, i) => {
        if (i)
            cursor += (c.wordBefore ? 7 : 3) * unit;
        [...c.marks].forEach((mark, j) => {
            if (j)
                cursor += unit;
            const length = (mark === '-' ? 3 : 1) * unit;
            entries.push({ character: i, mark: j, start: cursor, end: cursor + length });
            cursor += length;
        });
    });
    return entries;
}
class PlaybackHighlight {
    constructor(tiles) { this.tiles = tiles; this.frame = 0; this.entries = []; this.audio = null; this.pausedAt = null; this.lastCharacter = -1; }
    start(chars, wpm, audio) { this.stop(); this.entries = timeline(chars, wpm); this.audio = audio; this.lastCharacter = -1; this.tick(); }
    tick = () => {
        const elapsed = (this.audio?.currentTime ?? 0) * 1000;
        const current = this.entries.find(e => elapsed >= e.start && elapsed < e.end);
        const currentIndex = current?.character ?? -1;
        this.tiles.querySelectorAll('.tile').forEach((el, i) => {
            el.classList.toggle('playing', i === currentIndex);
            el.dataset.mark = i === currentIndex ? String(current.mark) : '';
            el.querySelectorAll('.mark').forEach((m, j) => m.classList.toggle('sounding', i === currentIndex && j === current.mark));
        });
        // Gaps are visible units of the composition; illuminate the word boundary
        // during the silent interval, not during either adjacent character.
        const next = this.entries.find(e => e.start > elapsed);
        const inWordGap = currentIndex < 0 && next && next.character > 0 &&
            this.entries.some(e => e.character === next.character - 1 && e.end <= elapsed) &&
            this.tiles.querySelectorAll('.tile')[next.character]?.classList.contains('word-start');
        this.tiles.querySelectorAll('.tile.word-start').forEach(el => el.classList.remove('word-gap-playing'));
        if (inWordGap)
            this.tiles.querySelectorAll('.tile')[next.character]?.classList.add('word-gap-playing');
        if (currentIndex !== -1 && currentIndex !== this.lastCharacter) {
            const tile = this.tiles.querySelectorAll('.tile')[currentIndex];
            if (tile) {
                const left = tile.offsetLeft;
                const right = left + tile.offsetWidth;
                if (left < this.tiles.scrollLeft || right > this.tiles.scrollLeft + this.tiles.clientWidth)
                    this.tiles.scrollTo({ left: Math.max(0, left - 10), behavior: 'smooth' });
            }
        }
        this.lastCharacter = currentIndex;
        this.frame = requestAnimationFrame(this.tick);
    };
    pause() { cancelAnimationFrame(this.frame); }
    resume() { this.tick(); }
    stop() {
        cancelAnimationFrame(this.frame);
        this.audio = null;
        this.lastCharacter = -1;
        this.tiles.querySelectorAll('.tile').forEach(el => {
            el.classList.remove('playing', 'word-gap-playing');
            el.dataset.mark = '';
            el.querySelectorAll('.mark').forEach(m => m.classList.remove('sounding'));
        });
    }
}
exports.PlaybackHighlight = PlaybackHighlight;

},
"js/audio/sound-profiles.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOUND_PROFILES = void 0;
exports.soundProfile = soundProfile;
exports.sampleTone = sampleTone;
// One sound vocabulary shared by the live key, WAV export and optional listening recoloring.
// Harmonics are deliberately restrained to keep short marks intelligible.
exports.SOUND_PROFILES = Object.freeze([
    { id: 'classic', name: 'Classic Telegraph', kind: 'radio', dit: 1, dah: 1, harmonics: [1], attack: .002, release: .005 },
    { id: 'valve', name: 'Warm Valve', kind: 'radio', dit: 1, dah: 1, harmonics: [1, .18, .06], attack: .003, release: .007 },
    { id: 'copper', name: 'Copper Wire', kind: 'radio', dit: 1.06, dah: .98, harmonics: [1, .25, .08], attack: .002, release: .004 },
    { id: 'glass', name: 'Glass Chimes', kind: 'instrument', dit: 1.34, dah: 1, harmonics: [1, .1, .03], attack: .002, release: .012 },
    { id: 'wood', name: 'Wood & Bell', kind: 'instrument', dit: 1.18, dah: .82, harmonics: [1, .3, .12], attack: .003, release: .010 },
    { id: 'silver', name: 'Silver Pulse', kind: 'instrument', dit: 1.5, dah: 1, harmonics: [1, .12], attack: .0015, release: .006 },
    { id: 'beacon', name: 'Deep Beacon', kind: 'instrument', dit: 1, dah: 1, harmonics: [1, .12, .03], attack: .004, release: .012 },
    { id: 'marimba', name: 'Soft Marimba', kind: 'instrument', dit: 1.25, dah: .88, harmonics: [1, .24, .07], attack: .003, release: .012 }
]);
function soundProfile(id) { return exports.SOUND_PROFILES.find(p => p.id === id) || exports.SOUND_PROFILES[0]; }
function sampleTone(profileId, mark, pitch, seconds, t, rate = 22050) {
    const p = soundProfile(profileId), factor = mark === '-' ? p.dah : p.dit;
    const fadeIn = Math.min(1, t / p.attack), fadeOut = Math.min(1, (seconds - t) / p.release);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const harmonics = p.harmonics;
    let wave = 0, weight = 0;
    for (let h = 0; h < harmonics.length; h++) {
        const amp = harmonics[h];
        wave += amp * Math.sin(2 * Math.PI * pitch * factor * (h + 1) * t);
        weight += amp;
    }
    return envelope * wave / weight;
}

},
"js/audio/synthesis.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.warmAudio = warmAudio;
exports.startTone = startTone;
exports.setLongTone = setLongTone;
exports.stopTone = stopTone;
exports.wavFor = wavFor;
exports.pausePlayback = pausePlayback;
exports.resumePlayback = resumePlayback;
exports.stopPlayback = stopPlayback;
exports.playWav = playWav;
const sound_profiles_js_1 = require("./sound-profiles.js");
const morse_js_1 = require("../core/morse.js");
let context, osc, gain, live = false, livePitch = 600, liveProfile = "classic";
const waves = new Map();
function profileWave(c, p) {
    if (waves.has(p.id))
        return waves.get(p.id);
    const real = new Float32Array(p.harmonics.length + 1), imag = new Float32Array(real.length);
    p.harmonics.forEach((v, i) => { imag[i + 1] = v; });
    const wave = c.createPeriodicWave(real, imag, { disableNormalization: false });
    waves.set(p.id, wave);
    return wave;
}
function ctx() { context ??= new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); return context; }
function prepare() {
    const c = ctx();
    if (osc)
        return c;
    // Keep the oscillator running so subsequent presses only change gain.
    osc = c.createOscillator();
    gain = c.createGain();
    osc.type = 'sine';
    gain.gain.value = 0;
    osc.connect(gain).connect(c.destination);
    osc.start();
    return c;
}
function warmAudio() { const c = prepare(); if (c.state !== 'running')
    void c.resume().catch(() => { }); }
function startTone(pitch, volume, profileId = "classic") {
    const c = prepare();
    if (c.state !== 'running')
        void c.resume().catch(() => { });
    const t = c.currentTime;
    live = true;
    livePitch = pitch;
    liveProfile = profileId;
    const p = (0, sound_profiles_js_1.soundProfile)(profileId);
    osc.setPeriodicWave(profileWave(c, p));
    osc.frequency.cancelScheduledValues(t);
    osc.frequency.setValueAtTime(pitch * p.dit, t);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    // A 2 ms attack limits clicks without an audible intentional delay.
    gain.gain.linearRampToValueAtTime(volume * .28, t + (0, sound_profiles_js_1.soundProfile)(profileId).attack);
}
function setLongTone() { if (!live || !osc)
    return; const p = (0, sound_profiles_js_1.soundProfile)(liveProfile), t = ctx().currentTime; osc.frequency.cancelScheduledValues(t); osc.frequency.setTargetAtTime(livePitch * p.dah, t, .009); }
function stopTone() {
    if (!osc || !live)
        return;
    live = false;
    const c = ctx(), t = c.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    // A 3 ms release avoids a hard waveform discontinuity.
    gain.gain.linearRampToValueAtTime(0, t + (0, sound_profiles_js_1.soundProfile)(liveProfile).release);
}
// Render directly to PCM: no microphone, no noise, no dependence on live timing.
function wavFor(chars, wpm, pitch, profileId = 'classic') {
    const events = (0, morse_js_1.eventsFor)(chars, wpm), rate = 22050;
    const total = Math.ceil((events.reduce((n, e) => n + e.seconds, 0) + 7 * 1.2 / wpm) * rate);
    const pcm = new Int16Array(total);
    let pos = 0;
    for (const event of events) {
        const count = Math.round(event.seconds * rate);
        if (event.on) {
            const mark = event.seconds > 1.8 / wpm ? '-' : '.';
            for (let j = 0; j < count && pos + j < total; j++) {
                pcm[pos + j] = Math.round(.7 * (0, sound_profiles_js_1.sampleTone)(profileId, mark, pitch, event.seconds, j / rate, rate) * 32767);
            }
        }
        pos += count;
    }
    const bytes = new ArrayBuffer(44 + pcm.byteLength), v = new DataView(bytes);
    const str = (p, s) => { for (let i = 0; i < s.length; i++)
        v.setUint8(p + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    v.setUint32(4, 36 + pcm.byteLength, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, pcm.byteLength, true);
    new Int16Array(bytes, 44).set(pcm);
    return new Blob([bytes], { type: 'audio/wav' });
}
let playback;
function pausePlayback() { if (playback && !playback.paused)
    playback.pause(); }
function resumePlayback() { if (playback && playback.paused)
    return playback.play(); return Promise.resolve(); }
function stopPlayback() { if (playback) {
    playback.pause();
    URL.revokeObjectURL(playback.src);
    playback = null;
} }
function playWav(blob, onEnd) { stopPlayback(); const url = URL.createObjectURL(blob); const audio = new Audio(url); playback = audio; audio.onended = () => { stopPlayback(); onEnd?.(); }; audio.onerror = () => { stopPlayback(); onEnd?.(); }; audio.play().catch(() => { stopPlayback(); onEnd?.(); }); return audio; }

},
"js/audio/time-stretch.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stretchPCM = stretchPCM;
// Pitch-preserving, buffered WSOLA for original imported recordings.
// Correlation searches for a phase-compatible grain; a normalization buffer
// prevents level jumps at overlaps. Processing happens before playback.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function stretchPCM(channels, sampleRate, speed) {
    if (!channels?.length || !channels[0]?.length)
        throw new Error('Empty audio');
    if (!(speed >= .5 && speed <= 2))
        throw new RangeError('Unsupported speed');
    if (Math.abs(speed - 1) < 1e-6)
        return channels.map(ch => new Float32Array(ch));
    const length = channels[0].length, outputLength = Math.max(1, Math.ceil(length / speed));
    const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(sampleRate * .043))));
    const hop = Math.floor(size / 4), search = Math.max(8, Math.round(sampleRate * .007));
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++)
        window[i] = .5 - .5 * Math.cos(2 * Math.PI * (i + .5) / size);
    const mono = new Float32Array(length);
    for (let c = 0; c < channels.length; c++)
        for (let i = 0; i < length; i++)
            mono[i] += channels[c][i] / channels.length;
    const outs = channels.map(() => new Float32Array(outputLength + size));
    const weights = new Float32Array(outputLength + size);
    let previous = 0;
    for (let out = 0, frame = 0; out < outputLength; out += hop, frame++) {
        const nominal = Math.round(out * speed);
        const center = clamp(nominal, 0, Math.max(0, length - size));
        let source = center;
        if (frame && length > size) {
            let bestScore = -Infinity;
            const previousOverlap = previous + hop, upper = length - size;
            for (let candidate = Math.max(0, center - search); candidate <= Math.min(upper, center + search); candidate += 4) {
                let cross = 0, left = 0, right = 0;
                // Matching the existing input grain reduces pitch/phase discontinuities.
                for (let j = 0; j < size - hop; j += 9) {
                    const a = mono[previousOverlap + j], b = mono[candidate + j];
                    if (a === undefined || b === undefined)
                        break;
                    cross += a * b;
                    left += a * a;
                    right += b * b;
                }
                const score = cross / Math.sqrt(Math.max(1e-9, left * right));
                if (score > bestScore) {
                    bestScore = score;
                    source = candidate;
                }
            }
        }
        previous = source;
        const usable = Math.min(size, length - source, outputLength - out);
        for (let i = 0; i < usable; i++) {
            const weight = window[i];
            weights[out + i] += weight;
            for (let c = 0; c < channels.length; c++)
                outs[c][out + i] += channels[c][source + i] * weight;
        }
    }
    return outs.map(out => {
        const result = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++)
            result[i] = weights[i] > 1e-5 ? clamp(out[i] / weights[i], -1, 1) : 0;
        return result;
    });
}

},
"js/compose/backspace-model.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backspace = backspace;
const message_js_1 = require("../core/message.js");
// Backspace treats a word boundary as one editable unit before removing its letter.
function backspace(chars, { selectedIndex = -1, pendingWord = false } = {}) {
    if (pendingWord)
        return { chars: (0, message_js_1.copy)(chars), pendingWord: false, deleted: 'space' };
    if (!chars.length)
        return { chars: [], pendingWord: false, deleted: 'none' };
    const i = selectedIndex >= 0 ? selectedIndex : chars.length - 1;
    if (selectedIndex < 0 && chars[i].wordBefore) {
        const next = (0, message_js_1.copy)(chars);
        next[i].wordBefore = false;
        return { chars: next, pendingWord: false, deleted: 'space' };
    }
    const pending = i === chars.length - 1 && !!chars[i].wordBefore;
    return { chars: (0, message_js_1.remove)(chars, i), pendingWord: pending, deleted: 'letter' };
}

},
"js/compose/compose-controller.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const library_js_1 = require("../storage/library.js");
const message_naming_js_1 = require("./message-naming.js");
const sound_profiles_js_1 = require("../audio/sound-profiles.js");
const morse_js_1 = require("../core/morse.js");
const tempo_js_1 = require("../core/tempo.js");
const intent_js_1 = require("../core/intent.js");
const message = require("../core/message.js");
const backspace_model_js_1 = require("./backspace-model.js");
const illumination_js_1 = require("./illumination.js");
const haptics_js_1 = require("./haptics.js");
const playback_timeline_js_1 = require("../audio/playback-timeline.js");
const synthesis_js_1 = require("../audio/synthesis.js");
const storage_js_1 = require("../storage/storage.js");
const decoder_js_1 = require("../core/decoder.js");
const event_log_js_1 = require("../storage/event-log.js");
const $ = id => document.getElementById(id);
const state = (0, storage_js_1.load)();
const HAPTICS_KEY = 'telegrapher-haptics';
let hapticMode = (() => { try {
    return localStorage.getItem(HAPTICS_KEY) || 'crafted';
}
catch {
    return 'crafted';
} })();
if (!haptics_js_1.HAPTIC_MODES.includes(hapticMode))
    hapticMode = 'crafted';
const tempo = new tempo_js_1.Tempo((0, tempo_js_1.unitForWpm)(9), state.autoTempo, state.sendBand);
const light = new illumination_js_1.Illumination($('key'));
const highlighting = new playback_timeline_js_1.PlaybackHighlight($('tiles'));
let undo = [], redo = [], active = null, lastRelease = null, editIndex = -1, selectedIndex = -1, keyboardDown = false;
let diagnostic = false, pressSamples = [];
let explicitGap = null;
let lastMark = null;
let readyToSave = false;
let rawEvents = [];
let lastBoundaryExplicit = false;
let lastInferred = false;
let longToneTimer = null;
let boundaryTimer = null;
let liveBoundary = 'inside';
function cancelBoundaryTimer() { if (boundaryTimer !== null)
    clearTimeout(boundaryTimer); boundaryTimer = null; }
function showBoundary(kind) {
    liveBoundary = kind;
    const tile = $('tiles').lastElementChild;
    if (tile)
        tile.classList.toggle('completed', kind !== 'inside');
    render();
    if (kind === 'letter')
        status('Letter complete · ready for next');
    if (kind === 'word')
        status('Word space · ready for next');
}
function scheduleBoundary() {
    cancelBoundaryTimer();
    if (lastRelease === null || !state.chars.length)
        return;
    const thresholds = intent_js_1.INPUT[state.sendBand] || intent_js_1.INPUT.comfortable;
    const releasedAt = lastRelease;
    // Check elapsed time again when timers wake after a background-tab delay.
    const update = () => {
        if (active || lastRelease !== releasedAt || explicitGap)
            return;
        const elapsed = performance.now() - releasedAt;
        showBoundary((0, intent_js_1.boundaryState)(elapsed, state.sendBand));
        if (elapsed < thresholds.word) {
            const next = elapsed < thresholds.letter ? thresholds.letter : thresholds.word;
            boundaryTimer = setTimeout(update, Math.max(1, next - elapsed + 1));
        }
        else
            boundaryTimer = null;
    };
    boundaryTimer = setTimeout(update, thresholds.letter + 1);
}
let profile = (0, event_log_js_1.loadProfile)() || (0, decoder_js_1.timingProfile)(state.sendBand);
const session = { id: crypto.randomUUID?.() || String(Date.now()), startedAt: new Date().toISOString(), events: [] };
let suggestions = [];
function recordSession() { (0, event_log_js_1.saveSession)(session); }
function showSuggestions() {
    const box = $('suggestions');
    box.replaceChildren();
    suggestions = (0, decoder_js_1.decodeEvents)(rawEvents.slice(-35), profile, 3);
    if (rawEvents.length < 2 || rawEvents.length > 35 || !suggestions.length) {
        box.hidden = true;
        return;
    }
    const title = document.createElement('span');
    title.textContent = 'Other readings · ';
    box.append(title);
    suggestions.forEach((candidate, i) => {
        const button = document.createElement('button');
        button.className = 'text-btn';
        button.textContent = (0, morse_js_1.textOf)(candidate.chars);
        button.title = 'Apply this reading to the current composition';
        button.onclick = () => {
            if (rawEvents.length > 35) {
                status('Suggestions cover only the latest 35 marks');
                return;
            }
            change(candidate.chars);
            session.events.push({ type: 'correction', at: Date.now(), decisions: candidate.decisions });
            recordSession();
            const labeled = rawEvents.map((e, j) => ({ ...e, confirmedMark: candidate.decisions[j]?.mark }));
            profile = (0, decoder_js_1.updateProfile)(profile, labeled);
            (0, event_log_js_1.saveProfile)(profile);
            status('Reading applied · Undo to restore');
            showSuggestions();
        };
        box.append(button);
    });
    box.hidden = false;
}
function status(value) { $('status').textContent = value; }
function remember() { undo.push(message.copy(state.chars)); if (undo.length > 100)
    undo.shift(); redo = []; }
function change(next) { remember(); state.chars = next; persistDraftName(); if (selectedIndex >= next.length)
    selectedIndex = -1; readyToSave = true; render(); }
let libraryDraftId = sessionStorage.getItem('morse-library-draft-id') || (0, library_js_1.messageId)();
try {
    sessionStorage.setItem('morse-library-draft-id', libraryDraftId);
}
catch { }
const DRAFT_NAME_KEY = 'telegrapher-compose-draft-name';
let customTitle = '';
let librarySaveTimer;
function titleForCompose() { return (0, message_naming_js_1.resolvedMessageTitle)(customTitle, (0, morse_js_1.textOf)(state.chars)); }
function persistDraftName() {
    try {
        localStorage.setItem(DRAFT_NAME_KEY, JSON.stringify({ title: customTitle, id: libraryDraftId }));
    }
    catch { }
}
function restoreDraftName() {
    try {
        return (0, message_naming_js_1.normalizeMessageTitle)(JSON.parse(localStorage.getItem(DRAFT_NAME_KEY) || '{}').title);
    }
    catch {
        return '';
    }
}
function showMessageName() { if (document.activeElement !== $('composeName'))
    $('composeName').value = customTitle; }
function queueLibrarySave() {
    clearTimeout(librarySaveTimer);
    if (!state.chars.length)
        return;
    const chars = message.copy(state.chars), title = titleForCompose(), titleMode = customTitle ? 'manual' : 'auto';
    const saveId = libraryDraftId;
    librarySaveTimer = setTimeout(() => { void (0, library_js_1.putMessage)({ id: saveId, kind: 'composed', title, titleMode, chars, audio: (0, synthesis_js_1.wavFor)(chars, state.speed, state.pitch, state.soundProfile), morseMeta: { chars, wpm: state.speed, pitch: state.pitch, soundProfile: state.soundProfile } }).then(() => document.dispatchEvent(new Event('morse:library-updated'))).catch(console.warn); }, 450);
}
$('composeName').addEventListener('input', event => {
    customTitle = (0, message_naming_js_1.normalizeMessageTitle)(event.target.value);
    persistDraftName();
    queueLibrarySave();
});
$('composeName').addEventListener('blur', () => showMessageName());
$('composeName').addEventListener('keydown', event => { if (event.key === 'Enter') {
    event.preventDefault();
    $('composeName').blur();
} });
document.addEventListener('morse:library-open-compose', event => {
    cancelBoundaryTimer();
    stop();
    clearTimeout(librarySaveTimer);
    state.chars = message.copy(event.detail.chars || []);
    libraryDraftId = event.detail.id;
    customTitle = event.detail.titleMode === 'manual' ? (0, message_naming_js_1.normalizeMessageTitle)(event.detail.title) : '';
    persistDraftName();
    showMessageName();
    try {
        sessionStorage.setItem('morse-library-draft-id', libraryDraftId);
    }
    catch { }
    readyToSave = true;
    render();
});
function render() {
    const tiles = $('tiles');
    tiles.replaceChildren();
    state.chars.forEach((c, i) => {
        const tile = document.createElement('button');
        tile.className = 'tile' + (c.wordBefore ? ' word-start' : '') + (i === state.chars.length - 1 && liveBoundary !== 'inside' ? ' completed' : '');
        tile.setAttribute('aria-label', `Edit character ${i + 1}: ${(0, morse_js_1.decode)(c.marks)}`);
        const marks = document.createElement('span');
        marks.className = 'marks';
        [...c.marks].forEach((mark, j) => { const span = document.createElement('span'); span.className = 'mark'; span.textContent = mark === '.' ? '·' : '−'; span.dataset.index = j; marks.append(span); });
        const letter = document.createElement('span');
        letter.className = 'letter';
        letter.textContent = (0, morse_js_1.decode)(c.marks);
        tile.append(marks, letter);
        tile.onclick = () => openEdit(i);
        tile.classList.toggle('selected', i === selectedIndex);
        tiles.append(tile);
    });
    // Open boundaries are visible before the next character arrives.
    if (state.chars.length && (explicitGap === 'word' || (liveBoundary === 'word' && !active))) {
        const gap = document.createElement('span');
        gap.className = 'boundary-space pending-word';
        gap.setAttribute('role', 'img');
        gap.setAttribute('aria-label', 'Word space');
        gap.textContent = '·';
        tiles.append(gap);
    }
    else if (state.chars.length && liveBoundary === 'letter' && !active) {
        const gap = document.createElement('span');
        gap.className = 'boundary-letter';
        gap.setAttribute('aria-label', 'Letter completed');
        tiles.append(gap);
    }
    $('decoded').textContent = state.showDecoded ? ((0, morse_js_1.textOf)(state.chars) || 'Your message appears here') : 'Decoded text hidden';
    $('decoded').classList.toggle('empty', !state.chars.length || !state.showDecoded);
    const c = (0, morse_js_1.counts)(state.chars);
    $('count').textContent = `${c.letters} letters · ${c.words} words`;
    $('undoBtn').disabled = !undo.length;
    $('redoBtn').disabled = !redo.length;
    $('playBtn').disabled = $('shareBtn').disabled = !state.chars.length;
    $('clearBtn').disabled = !state.chars.length;
    $('spaceBtn').disabled = !state.chars.length;
    $('deleteWordBtn').disabled = !state.chars.length;
    $('backspaceBtn').disabled = !state.chars.length;
    if (readyToSave) {
        (0, storage_js_1.save)(state);
        queueLibrarySave();
    }
}
function restore(from, to) { if (!from.length)
    return; cancelBoundaryTimer(); liveBoundary = 'inside'; stop(); to.push(message.copy(state.chars)); state.chars = from.pop(); lastRelease = null; render(); }
function begin(e) {
    if (active || $('editDialog').open || $('settingsDialog').open)
        return;
    e?.preventDefault();
    cancelBoundaryTimer();
    stop();
    if (e?.pointerId !== undefined)
        try {
            $('key').setPointerCapture(e.pointerId);
        }
        catch { }
    const now = performance.now(), unit = tempo.unit;
    const explicit = explicitGap !== null;
    const gapTime = lastRelease === null ? 0 : now - lastRelease;
    const decision = { gap: lastRelease === null && !explicit ? 'letter' : (0, intent_js_1.boundaryState)(gapTime, state.sendBand, explicitGap), reconsidered: false };
    liveBoundary = 'inside';
    active = { start: now, unit, gap: decision.gap, gapTime, explicit, reconsidered: decision.reconsidered, device: e?.pointerId !== undefined ? 'pointer' : 'keyboard' };
    explicitGap = null;
    $('key').classList.add('pressed');
    light.begin(unit);
    status('Sending…');
    if (active.device === 'pointer')
        (0, haptics_js_1.tactileEvent)(hapticMode, 'contact');
    (0, synthesis_js_1.startTone)(state.pitch, state.volume / 100, state.soundProfile);
    clearTimeout(longToneTimer);
    longToneTimer = setTimeout(() => { if (active) {
        (0, synthesis_js_1.setLongTone)();
        if (active.device === 'pointer')
            (0, haptics_js_1.tactileEvent)(hapticMode, 'threshold');
    } }, (intent_js_1.INPUT[state.sendBand] || intent_js_1.INPUT.comfortable).dah);
}
function finish(e, cancel = false) {
    if (!active)
        return;
    e?.preventDefault();
    const now = performance.now(), duration = now - active.start, { unit, gap, gapTime, explicit, reconsidered } = active;
    const activeStart = active.start, inputDevice = active.device;
    active = null;
    clearTimeout(longToneTimer);
    $('key').classList.remove('pressed');
    (0, synthesis_js_1.stopTone)();
    if (!cancel && inputDevice === 'pointer')
        (0, haptics_js_1.tactileEvent)(hapticMode, 'release');
    if (cancel) {
        light.reset();
        lastRelease = null;
        status('Interrupted');
        return;
    }
    lastRelease = now;
    light.release(unit);
    liveBoundary = 'inside';
    if (duration >= 25) {
        const mark = (0, intent_js_1.classifyMark)(duration, state.sendBand);
        change(message.add(state.chars, mark, gap));
        rawEvents.push({ durationMs: duration, gapMs: gapTime, forcedMark: null, explicitGap: explicit ? gap : null });
        session.events.push({ type: 'mark', startMs: activeStart, durationMs: duration, gapMs: gapTime, device: inputDevice, style: state.sendBand, at: Date.now() });
        recordSession();
        if (rawEvents.length > 500)
            rawEvents.shift();
        lastBoundaryExplicit = explicit;
        lastInferred = !explicit;
        tempo.observe(duration, mark);
        lastMark = mark;
        pressSamples.push({ duration: Math.round(duration), mark, unit: Math.round(unit), gap });
        if (pressSamples.length > 20)
            pressSamples.shift();
        $('tiles').scrollLeft = $('tiles').scrollWidth;
        showSuggestions();
        scheduleBoundary();
    }
    status(reconsidered ? 'Kept marks together · edit any boundary' : 'Ready');
    updateDiagnostics();
}
$('key').addEventListener('pointerdown', begin);
$('key').addEventListener('pointerup', finish);
$('key').addEventListener('pointercancel', e => finish(e, true));
$('key').addEventListener('lostpointercapture', e => finish(e, true));
// Space sends from anywhere except editable controls; keyboard repeat is ignored.
document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat || keyboardDown || e.target.closest('dialog,input,select,textarea,button:not(#key)'))
        return;
    e.preventDefault();
    keyboardDown = true;
    begin(e);
});
document.addEventListener('keyup', e => { if (e.code === 'Space' && keyboardDown) {
    keyboardDown = false;
    finish(e);
} });
window.addEventListener('blur', () => { keyboardDown = false; finish(null, true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) {
    keyboardDown = false;
    finish(null, true);
} });
$('undoBtn').onclick = () => restore(undo, redo);
$('redoBtn').onclick = () => restore(redo, undo);
$('spaceBtn').onclick = () => {
    if (!state.chars.length)
        return;
    const index = selectedIndex >= 0 && selectedIndex < state.chars.length ? selectedIndex : state.chars.length - 1;
    if (index === state.chars.length - 1) {
        // Keep a pending word boundary for the next press; no empty character.
        explicitGap = 'word';
        lastRelease = null;
        cancelBoundaryTimer();
        showBoundary('word');
        status('Word space ready');
    }
    else {
        change(message.insertWordSpace(state.chars, index));
        status('Word space inserted');
    }
    selectedIndex = -1;
    render();
};
function removeWholeWord(index) {
    if (!state.chars.length)
        return;
    change(message.deleteWord(state.chars, index));
    selectedIndex = -1;
    lastRelease = null;
    explicitGap = 'letter';
    cancelBoundaryTimer();
    status('Word deleted · Undo to restore');
}
// Backspace removes one character; clearing and word deletion stay in More.
$('backspaceBtn').onclick = () => {
    if (!state.chars.length)
        return;
    cancelBoundaryTimer();
    const result = (0, backspace_model_js_1.backspace)(state.chars, {
        selectedIndex,
        pendingWord: selectedIndex < 0 && (explicitGap === 'word' || liveBoundary === 'word')
    });
    if (result.deleted === 'none')
        return;
    if (result.deleted !== 'space' || JSON.stringify(result.chars) !== JSON.stringify(state.chars))
        change(result.chars);
    selectedIndex = -1;
    lastRelease = null;
    explicitGap = result.pendingWord ? 'word' : 'letter';
    liveBoundary = result.pendingWord ? 'word' : 'letter';
    render();
    status(result.deleted === 'space' ? 'Space deleted' : 'Character deleted · Undo to restore');
};
$('deleteWordBtn').onclick = () => removeWholeWord(selectedIndex >= 0 ? selectedIndex : state.chars.length - 1);
$('deleteSelectedWord').onclick = () => { removeWholeWord(editIndex); $('editDialog').close(); };
$('clearBtn').onclick = () => { if (!state.chars.length)
    return; selectedIndex = -1; cancelBoundaryTimer(); liveBoundary = 'inside'; (0, event_log_js_1.archiveMessage)(message.copy(state.chars)); clearTimeout(librarySaveTimer); libraryDraftId = (0, library_js_1.messageId)(); customTitle = ''; persistDraftName(); showMessageName(); try {
    sessionStorage.setItem('morse-library-draft-id', libraryDraftId);
}
catch { } change([]); lastRelease = null; explicitGap = null; lastBoundaryExplicit = false; rawEvents = []; showSuggestions(); light.reset(); status('New message · Undo to restore'); };
$('letterBtn').onclick = () => { cancelBoundaryTimer(); showBoundary('letter'); explicitGap = 'letter'; lastRelease = null; lastBoundaryExplicit = true; status('Next mark begins a letter'); };
$('wordBtn').onclick = () => { cancelBoundaryTimer(); showBoundary('word'); explicitGap = 'word'; lastRelease = null; lastBoundaryExplicit = true; status('Next mark begins a word'); };
$('resumeBtn').onclick = () => { const draft = previousDraft; if (draft.length) {
    customTitle = restoreDraftName();
    showMessageName();
    change(draft);
    $('resumeBtn').hidden = true;
    status('Draft restored');
} };
function openEdit(i) { selectedIndex = i; editIndex = i; render(); renderEdit(); $('editDialog').showModal(); }
function renderEdit() {
    const c = state.chars[editIndex];
    if (!c)
        return;
    $('editPosition').textContent = `Character ${editIndex + 1} of ${state.chars.length}`;
    $('editDecoded').textContent = `Decoded: ${(0, morse_js_1.decode)(c.marks)}`;
    const el = $('editMarks');
    el.replaceChildren();
    [...c.marks].forEach((mark, j) => { const b = document.createElement('button'); b.textContent = mark === '.' ? '·' : '−'; b.title = 'Switch dit/dah'; b.onclick = () => edit(message.toggleMark(state.chars, editIndex, j)); el.append(b); });
    $('splitPosition').max = Math.max(1, c.marks.length - 1);
    $('splitPosition').value = Math.min(Number($('splitPosition').value) || 1, c.marks.length - 1) || 1;
    $('splitChar').disabled = c.marks.length < 2;
    $('joinPrev').disabled = $('toggleWord').disabled = editIndex === 0;
}
function edit(next) { if (JSON.stringify(next) === JSON.stringify(state.chars))
    return; change(next); if (!state.chars.length) {
    $('editDialog').close();
    return;
} editIndex = Math.min(editIndex, state.chars.length - 1); renderEdit(); }
$('addDit').onclick = () => { const next = message.copy(state.chars); next[editIndex].marks += '.'; edit(next); };
$('addDah').onclick = () => { const next = message.copy(state.chars); next[editIndex].marks += '-'; edit(next); };
$('removeMark').onclick = () => { const next = message.copy(state.chars); const c = next[editIndex]; c.marks = c.marks.slice(0, -1); edit(c.marks ? next : message.remove(next, editIndex)); };
$('deleteChar').onclick = () => edit(message.remove(state.chars, editIndex));
$('toggleWord').onclick = () => edit(message.boundary(state.chars, editIndex));
$('joinPrev').onclick = () => { const i = editIndex; edit(message.join(state.chars, i)); editIndex = Math.max(0, i - 1); if ($('editDialog').open)
    renderEdit(); };
$('splitChar').onclick = () => edit(message.split(state.chars, editIndex, Number($('splitPosition').value)));
$('doneEdit').onclick = $('closeEdit').onclick = () => $('editDialog').close();
$('editDialog').addEventListener('close', () => { editIndex = -1; lastRelease = null; render(); });
const soundSelect = $('soundProfile');
for (const p of sound_profiles_js_1.SOUND_PROFILES) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name + (p.kind === 'radio' ? ' · radio' : ' · instrument');
    soundSelect.append(option);
}
state.soundProfile = state.soundProfile || 'classic';
soundSelect.value = state.soundProfile;
soundSelect.onchange = () => { state.soundProfile = soundSelect.value; (0, storage_js_1.save)(state); };
const hapticSelect = $('hapticMode');
if (hapticSelect) {
    hapticSelect.value = hapticMode;
    hapticSelect.onchange = () => { hapticMode = hapticSelect.value; try {
        localStorage.setItem(HAPTICS_KEY, hapticMode);
    }
    catch { } };
}
$('settingsBtn').onclick = () => { (0, synthesis_js_1.warmAudio)(); $('settingsDialog').showModal(); };
$('closeSettings').onclick = $('doneSettings').onclick = () => $('settingsDialog').close();
for (const [id, suffix] of [['pitch', ' Hz'], ['speed', ' WPM'], ['volume', '%']]) {
    $(id).value = state[id];
    $(id + 'Value').textContent = state[id] + suffix;
    $(id).oninput = () => {
        state[id] = Number($(id).value);
        $(id + 'Value').textContent = state[id] + suffix;
        (0, storage_js_1.save)(state);
        updateDiagnostics();
    };
}
state.keyFeel = state.keyFeel || 'tactile';
$('keyFeel').value = state.keyFeel;
$('key').dataset.feel = state.keyFeel;
$('keyFeel').onchange = () => { state.keyFeel = $('keyFeel').value; $('key').dataset.feel = state.keyFeel; (0, storage_js_1.save)(state); };
$('sendBand').value = state.sendBand;
$('sendBand').onchange = () => { cancelBoundaryTimer(); state.sendBand = $('sendBand').value; profile = (0, decoder_js_1.timingProfile)(state.sendBand); (0, event_log_js_1.saveProfile)(profile); tempo.setBand(state.sendBand); (0, storage_js_1.save)(state); updateDiagnostics(); status('Sending feel updated'); scheduleBoundary(); };
$('autoTempo').checked = state.autoTempo;
$('autoTempo').onchange = () => { state.autoTempo = $('autoTempo').checked; tempo.automatic = state.autoTempo; (0, storage_js_1.save)(state); };
$('guidance').value = state.guidance;
$('guidance').onchange = () => { state.guidance = $('guidance').value; applyGuidance(); (0, storage_js_1.save)(state); };
$('showDecoded').checked = state.showDecoded;
$('showDecoded').onchange = () => { state.showDecoded = $('showDecoded').checked; render(); };
function applyGuidance() { $('key').dataset.guidance = state.guidance; }
applyGuidance();
let composeAudio = null;
function playbackControls(mode) {
    const playing = mode === 'playing', paused = mode === 'paused';
    $('playBtn').innerHTML = playing ? 'Ⅱ <span>Pause</span>' : paused ? '▶ <span>Resume</span>' : '▶ <span>Play</span>';
    $('playBtn').dataset.playing = playing ? 'yes' : 'no';
    $('stopBtn').hidden = !(playing || paused);
}
function stop() { (0, synthesis_js_1.stopPlayback)(); composeAudio = null; highlighting.stop(); playbackControls('idle'); }
$('stopBtn').onclick = () => { stop(); status('Ready'); };
$('playBtn').onclick = () => {
    if (composeAudio && !composeAudio.paused) {
        (0, synthesis_js_1.pausePlayback)();
        highlighting.pause();
        playbackControls('paused');
        status('Paused');
        return;
    }
    if (composeAudio && composeAudio.paused) {
        void (0, synthesis_js_1.resumePlayback)().then(() => { highlighting.resume(); playbackControls('playing'); status('Playing…'); });
        return;
    }
    status('Playing…');
    // Move the strip to its first character before playback starts.
    $('tiles').scrollLeft = 0;
    $('tiles').querySelectorAll('.tile').forEach(tile => tile.classList.remove('playing', 'word-gap-playing'));
    // Ensure the first tile is in view before audio is started.
    void $('tiles').offsetWidth;
    composeAudio = (0, synthesis_js_1.playWav)((0, synthesis_js_1.wavFor)(state.chars, state.speed, state.pitch, state.soundProfile), () => { composeAudio = null; highlighting.stop(); playbackControls('idle'); status('Ready'); });
    highlighting.start(state.chars, state.speed, composeAudio);
    playbackControls('playing');
};
$('shareBtn').onclick = async () => {
    const title = titleForCompose();
    const file = new File([(0, synthesis_js_1.wavFor)(state.chars, state.speed, state.pitch, state.soundProfile)], (0, message_naming_js_1.wavFilename)(title), { type: 'audio/wav' });
    try {
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title });
            status('Shared');
            return;
        }
    }
    catch (e) {
        if (e.name === 'AbortError')
            return;
    }
    if (window.AndroidFiles?.saveWav) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        window.AndroidFiles.saveWav(file.name, btoa(binary));
        status('WAV sent to Android Downloads');
    }
    else {
        const url = URL.createObjectURL(file), a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        status('WAV downloaded');
    }
};
function updateDiagnostics() { if (!diagnostic)
    return; $('diagnostics').textContent = `Guidance clock: ${tempo.unit.toFixed(1)} ms (${(1200 / tempo.unit).toFixed(1)} WPM)\nObservations: ${tempo.samples.length} · Raw events: ${rawEvents.length}\n${pressSamples.slice(-8).map(x => `${x.mark} ${x.duration} ms · clock ${x.unit} ms · ${x.gap}`).join('\n')}`; }
// Hidden developer overlay: Ctrl+Shift+D. Never part of the normal workflow.
document.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
    e.preventDefault();
    diagnostic = !diagnostic;
    $('diagnostics').hidden = !diagnostic;
    updateDiagnostics();
} });
$('historyBtn').onclick = () => {
    const items = (0, event_log_js_1.loadHistory)();
    $('historyItems').replaceChildren();
    for (const item of items) {
        const b = document.createElement('button');
        b.className = 'text-btn';
        b.textContent = `${new Date(item.date).toLocaleString()} · ${(0, morse_js_1.textOf)(item.chars)}`;
        b.onclick = () => { change(item.chars); $('historyDialog').close(); };
        $('historyItems').append(b);
    }
    if (!items.length)
        $('historyItems').textContent = 'No archived messages yet.';
    $('historyDialog').showModal();
};
$('closeHistory').onclick = () => $('historyDialog').close();
$('resetLearning').onclick = () => { (0, event_log_js_1.clearLearningData)(); profile = (0, decoder_js_1.timingProfile)(state.sendBand); (0, event_log_js_1.saveProfile)(profile); status('Timing profile reset'); };
const previousDraft = (0, storage_js_1.loadDraft)();
$('resumeBtn').hidden = !previousDraft.length;
render();
// Service worker registration is deferred until Android packaging.
// Optional bridge: Listen never needs this module to initialize or import a WAV.
document.addEventListener('morse:request-export', event => {
    const { accept, reject } = event.detail || {};
    if (!state.chars.length) {
        reject?.('Compose a message first, or open a WAV.');
        return;
    }
    try {
        accept?.((0, synthesis_js_1.wavFor)(state.chars, state.speed, state.pitch, state.soundProfile), { chars: state.chars.map(c => ({ ...c })), wpm: state.speed, pitch: state.pitch, soundProfile: state.soundProfile, title: titleForCompose(), filename: (0, message_naming_js_1.wavFilename)(titleForCompose()) });
    }
    catch (error) {
        reject?.(error.message || 'Unable to export this composition.');
    }
});
function announceComposeAvailability() {
    document.dispatchEvent(new CustomEvent('morse:compose-availability', { detail: { available: state.chars.length > 0 } }));
}
document.addEventListener('morse:workspace', event => {
    if (event.detail.name === 'listen')
        announceComposeAvailability();
});
announceComposeAvailability();

},
"js/compose/haptics.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAPTIC_MODES = void 0;
exports.hapticPattern = hapticPattern;
exports.tactileEvent = tactileEvent;
// The tactile vocabulary mirrors the key's physical state, not audio duration.
// Native Android vibration is preferred; web vibration is best-effort.
exports.HAPTIC_MODES = Object.freeze(['off', 'gentle', 'crafted', 'expressive']);
function hapticPattern(mode, event) {
    if (!exports.HAPTIC_MODES.includes(mode) || mode === 'off')
        return 0;
    const patterns = {
        gentle: { contact: 9, threshold: 0, release: 0 },
        crafted: { contact: 12, threshold: 23, release: 0 },
        expressive: { contact: 17, threshold: 32, release: 9 }
    };
    return patterns[mode]?.[event] ?? 0;
}
function tactileEvent(mode, event) {
    const duration = hapticPattern(mode, event);
    if (!duration)
        return;
    try {
        if (window.AndroidHaptics?.pulse) {
            window.AndroidHaptics.pulse(event, mode);
        }
        else if (typeof navigator.vibrate === 'function') {
            navigator.vibrate(duration);
        }
    }
    catch { /* Unsupported devices must never interrupt Morse input. */ }
}

},
"js/compose/illumination.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Illumination = exports.GATHER = void 0;
exports.lightFrame = lightFrame;
// Visual-only light engine. Input recognition and sound never depend on animation.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = v => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
exports.GATHER = Object.freeze({
    initialDiameterPx: 6,
    maximumDiameterPx: 54,
    gatherMs: 7000, // Preserve the seven-second gathering animation users preferred.
    releaseMs: 180, // A brief outward wave follows actuation without delaying sound.
    fadeMs: 260, // One wave fades before it can obscure the central light.
    hoverBreathMs: 2400, // At full size, brightness shimmers but diameter stays fixed.
});
// Pure frame calculation supports deterministic testing and tuning.
function lightFrame(kind, elapsedMs, unitMs) {
    const ms = Math.max(0, elapsedMs);
    const units = ms / Math.max(1, unitMs);
    if (kind === 'press') {
        const travel = smooth(ms / exports.GATHER.releaseMs);
        const fade = 1 - smooth(Math.max(0, ms - 35) / exports.GATHER.fadeMs);
        return {
            expansion: travel,
            centerScale: 1 - 0.24 * travel,
            centerGlow: 0.85 - 0.18 * travel,
            opacity: 0.72 * fade,
            halo: fade,
            units,
        };
    }
    const gathered = smooth(ms / exports.GATHER.gatherMs);
    const settled = Math.max(0, ms - exports.GATHER.gatherMs);
    const shimmer = settled ? Math.sin(2 * Math.PI * settled / exports.GATHER.hoverBreathMs) : 0;
    return {
        expansion: 0,
        centerScale: 1 + (exports.GATHER.maximumDiameterPx / exports.GATHER.initialDiameterPx - 1) * gathered,
        centerGlow: 0.50 + 0.38 * gathered + 0.055 * shimmer * gathered,
        opacity: 0,
        halo: 0,
        units,
    };
}
class Illumination {
    constructor(key) {
        this.key = key;
        this.press = key.querySelector('.press-light');
        this.core = key.querySelector('.key-disc-core');
        this.ambient = key.querySelector('.key-face-ambient');
        this.rings = key.querySelector('.gather-rings');
        this.active = { kind: 'pause', start: performance.now(), unit: 120 };
        this.coreScale = 1;
        this.fromScale = 1;
        this.lastPressScale = 1;
        this.seen = new Set();
        this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.loop = this.loop.bind(this);
        this.frame = requestAnimationFrame(this.loop);
    }
    begin(unit) {
        // Capture the current size: pressing never snaps a gathered core to a tiny dot.
        this.fromScale = this.coreScale;
        this.active = { kind: 'press', start: performance.now(), unit };
        this.seen.clear();
    }
    release(unit) {
        // Start gathering from the current size, rather than restarting at zero.
        this.fromScale = this.coreScale;
        this.active = { kind: 'pause', start: performance.now(), unit };
        this.seen.clear();
    }
    reset() {
        this.fromScale = 1;
        this.coreScale = 1;
        this.active = { kind: 'pause', start: performance.now(), unit: 120 };
        this.seen.clear();
    }
    loop(now) {
        const { kind, start, unit } = this.active;
        const elapsed = Math.max(0, now - start);
        const frame = lightFrame(kind, elapsed, unit);
        const guidance = this.key.dataset.guidance || 'gentle';
        const reduced = this.reduced.matches;
        // Only the central core and one borderless radial wave are rendered.
        if (guidance === 'off' || reduced) {
            this.press.style.opacity = '0';
            this.coreScale = reduced ? 3 : 1;
            this.core.style.transform = `scale(${this.coreScale})`;
            this.core.style.boxShadow = reduced ? '0 0 14px #e9d4a566' : 'none';
            this.ambient.style.setProperty('--ambient-strength', reduced ? '.55' : '.25');
        }
        else {
            const strength = guidance === 'minimal' ? 0.4 : 1;
            if (kind === 'press') {
                // A single outward wave starts at the existing core and fades naturally.
                const travel = smooth(elapsed / exports.GATHER.releaseMs);
                this.coreScale = this.fromScale * (1 - 0.24 * travel);
                this.press.style.opacity = String(frame.opacity * strength);
                this.press.style.transform = `scale(${0.20 + 0.90 * travel})`;
            }
            else {
                // Retain the original seven-second gather curve after a smooth handoff.
                const gathered = smooth(elapsed / exports.GATHER.gatherMs);
                const maximumScale = exports.GATHER.maximumDiameterPx / exports.GATHER.initialDiameterPx;
                this.coreScale = this.fromScale + (maximumScale - this.fromScale) * gathered;
                this.press.style.opacity = '0';
            }
            this.core.style.transform = `scale(${this.coreScale})`;
            // Fixed rings awaken sequentially as the core gathers toward its resting size.
            const progress = clamp((this.coreScale - 1) / (exports.GATHER.maximumDiameterPx / exports.GATHER.initialDiameterPx - 1), 0, 1);
            this.rings?.style.setProperty('--ring-one', String(smooth(progress / .38)));
            this.rings?.style.setProperty('--ring-two', String(smooth((progress - .25) / .48)));
            this.rings?.style.setProperty('--ring-three', String(smooth((progress - .58) / .42)));
            // The interior glow follows the same energy as the center, without adding new motion.
            this.ambient.style.setProperty('--ambient-strength', String((0.38 + frame.centerGlow * 0.52) * strength));
            this.core.style.setProperty('--core-glow', String(frame.centerGlow * strength));
            this.core.style.boxShadow = `0 0 ${Math.round(5 + frame.centerGlow * 12)}px ${Math.round(1 + frame.centerGlow * 3)}px #e9d5a777`;
        }
        this.frame = requestAnimationFrame(this.loop);
    }
    destroy() { cancelAnimationFrame(this.frame); }
}
exports.Illumination = Illumination;

},
"js/compose/message-naming.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_TITLE_LENGTH = void 0;
exports.normalizeMessageTitle = normalizeMessageTitle;
exports.resolvedMessageTitle = resolvedMessageTitle;
exports.wavFilename = wavFilename;
// A display title may contain punctuation that cannot be used in a filename.
// Keep the user's original title for correspondence; sanitize only at export.
exports.MAX_TITLE_LENGTH = 100;
function normalizeMessageTitle(value) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, exports.MAX_TITLE_LENGTH).trim();
}
function resolvedMessageTitle(customTitle, decodedText) {
    return normalizeMessageTitle(customTitle)
        || normalizeMessageTitle(decodedText).slice(0, 55).trim()
        || 'Untitled composition';
}
function wavFilename(title) {
    let base = normalizeMessageTitle(title)
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\.wav$/i, '')
        .replace(/[. ]+$/g, '')
        .slice(0, 80).replace(/[. ]+$/g, '');
    if (!base || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(base))
        base = 'Morse message';
    return `${base}.wav`;
}

},
"js/core/decoder.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timingProfile = timingProfile;
exports.decodeEvents = decodeEvents;
exports.updateProfile = updateProfile;
const morse_js_1 = require("./morse.js");
const codes = new Set(Object.values(morse_js_1.alphabet));
const prefixes = new Set([...codes].flatMap(code => [...code].map((_, i) => code.slice(0, i + 1))));
const LOG2PI = Math.log(2 * Math.PI);
// Log-normal timing accommodates positive durations and occasional long tails.
function logDensity(ms, median, spread) {
    const x = Math.max(1, ms), z = Math.log(x / median) / spread;
    return -Math.log(x * spread) - (LOG2PI + z * z) / 2;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function timingProfile(style = 'comfortable') {
    const units = { meandering: 225, comfortable: 145, flowing: 92, swift: 59 };
    return { unit: units[style] || units.comfortable, markSpread: 0.52, gapSpread: 0.78, hesitationWeight: 0.12 };
}
// A broad hesitation component prevents a long thinking pause from becoming certainty.
function gapScore(duration, kind, profile) {
    const factor = { inside: 1, letter: 3, word: 7 }[kind];
    const ordinary = Math.log(1 - profile.hesitationWeight) + logDensity(duration, profile.unit * factor, profile.gapSpread);
    const hesitation = Math.log(profile.hesitationWeight) + logDensity(duration, profile.unit * 13, 1.15);
    const high = Math.max(ordinary, hesitation);
    return high + Math.log(Math.exp(ordinary - high) + Math.exp(hesitation - high));
}
function markScore(duration, kind, profile) {
    return logDensity(duration, profile.unit * (kind === '-' ? 3 : 1), profile.markSpread);
}
// Beam search scores whole sequences, not individual gaps in isolation.
// Explicit boundaries are constraints; inferred boundaries remain alternatives.
function decodeEvents(events, profile = timingProfile(), limit = 4) {
    if (!events.length)
        return [];
    let beam = [{ chars: [], current: '', score: 0, decisions: [] }];
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const choices = [];
        for (const hypothesis of beam) {
            const markKinds = event.forcedMark ? [event.forcedMark] : ['.', '-'];
            const gapKinds = i === 0 ? ['letter'] : event.explicitGap ? [event.explicitGap] : ['inside', 'letter', 'word'];
            for (const mark of markKinds)
                for (const gap of gapKinds) {
                    if (gap === 'inside' && !hypothesis.current)
                        continue;
                    if (gap !== 'inside' && hypothesis.current && !codes.has(hypothesis.current))
                        continue;
                    const current = gap === 'inside' ? hypothesis.current + mark : mark;
                    if (!prefixes.has(current))
                        continue;
                    const chars = gap === 'inside' ? hypothesis.chars : hypothesis.current ? [...hypothesis.chars, { marks: hypothesis.current, wordBefore: false }] : hypothesis.chars;
                    const nextChars = chars.map(c => ({ ...c }));
                    // A word boundary applies to the newly started character, not the preceding one.
                    const boundaries = [...hypothesis.decisions, { mark, gap }];
                    const score = hypothesis.score + markScore(event.durationMs, mark, profile)
                        + (i ? gapScore(event.gapMs, gap, profile) : 0)
                        + (gap === 'word' ? -0.65 : 0);
                    choices.push({ chars: nextChars, current, score, decisions: boundaries });
                }
        }
        // Keep multiple hypotheses with distinct paths; do not collapse uncertainty early.
        beam = choices.sort((a, b) => b.score - a.score).slice(0, Math.max(24, limit * 16));
        if (!beam.length)
            return [];
    }
    const completed = beam.filter(h => codes.has(h.current)).map(h => {
        const chars = [...h.chars, { marks: h.current, wordBefore: false }];
        let idx = 0;
        for (let i = 0; i < h.decisions.length; i++) {
            if (i && h.decisions[i].gap !== 'inside')
                idx++;
            if (h.decisions[i].gap === 'word' && idx < chars.length)
                chars[idx].wordBefore = true;
        }
        return { chars, score: h.score, decisions: h.decisions };
    });
    const unique = new Map();
    for (const h of completed.sort((a, b) => b.score - a.score)) {
        const key = JSON.stringify(h.chars);
        if (!unique.has(key))
            unique.set(key, h);
        if (unique.size >= limit)
            break;
    }
    return [...unique.values()].map((h, i, all) => ({ ...h, relativeScore: Math.exp(clamp(h.score - all[0].score, -50, 0)) }));
}
// Profiles only learn from explicit, aligned labels, never from decoder guesses.
function updateProfile(profile, labeledEvents) {
    const normalizedMarks = labeledEvents.filter(e => e.confirmedMark === '.' || e.confirmedMark === '-')
        .map(e => e.durationMs / (e.confirmedMark === '-' ? 3 : 1)).filter(x => x >= 35 && x <= 650);
    if (normalizedMarks.length < 12)
        return { ...profile };
    normalizedMarks.sort((a, b) => a - b);
    const median = normalizedMarks[Math.floor(normalizedMarks.length / 2)];
    return { ...profile, unit: clamp(profile.unit * 0.85 + median * 0.15, 45, 300) };
}

},
"js/core/intent.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INPUT = void 0;
exports.classifyMark = classifyMark;
exports.classifyGap = classifyGap;
exports.boundaryState = boundaryState;
exports.interpretGap = interpretGap;
// Input boundaries are final after the style-specific deadline; no silent reopening.
exports.INPUT = {
    meandering: { dah: 210, letter: 900, word: 3500 },
    comfortable: { dah: 155, letter: 650, word: 2900 },
    flowing: { dah: 115, letter: 450, word: 2000 },
    swift: { dah: 85, letter: 300, word: 1400 }
};
function classifyMark(duration, band = 'comfortable') {
    return duration >= (exports.INPUT[band] || exports.INPUT.comfortable).dah ? '-' : '.';
}
function classifyGap(duration, band = 'comfortable') {
    const b = exports.INPUT[band] || exports.INPUT.comfortable;
    return duration >= b.word ? 'word' : duration >= b.letter ? 'letter' : 'inside';
}
// The live state machine and the next press use this same elapsed-time rule.
function boundaryState(duration, band = 'comfortable', explicit = null) {
    return explicit || classifyGap(duration, band);
}
// Compatibility for callers: inferred boundaries are never reopened.
function interpretGap(duration, band, previous, explicit = false) {
    return { gap: classifyGap(duration, band), reconsidered: false };
}

},
"js/core/message.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copy = copy;
exports.add = add;
exports.toggleMark = toggleMark;
exports.split = split;
exports.join = join;
exports.remove = remove;
exports.boundary = boundary;
exports.wordRange = wordRange;
exports.deleteWord = deleteWord;
exports.insertWordSpace = insertWordSpace;
// A boundary belongs to the following character; marks remain editable.
function copy(chars) { return chars.map(c => ({ marks: c.marks, wordBefore: !!c.wordBefore })); }
function add(chars, mark, gap) {
    const next = copy(chars);
    if (!next.length || gap !== 'inside')
        next.push({ marks: mark, wordBefore: next.length > 0 && gap === 'word' });
    else
        next[next.length - 1].marks += mark;
    return next;
}
function toggleMark(chars, i, j) {
    const next = copy(chars), c = next[i];
    if (!c || j < 0 || j >= c.marks.length)
        return next;
    c.marks = c.marks.slice(0, j) + (c.marks[j] === '.' ? '-' : '.') + c.marks.slice(j + 1);
    return next;
}
function split(chars, i, at) {
    const next = copy(chars), c = next[i];
    if (!c || at < 1 || at >= c.marks.length)
        return next;
    next.splice(i, 1, { marks: c.marks.slice(0, at), wordBefore: c.wordBefore }, { marks: c.marks.slice(at), wordBefore: false });
    return next;
}
function join(chars, i) {
    const next = copy(chars);
    if (i < 1 || i >= next.length)
        return next;
    next[i - 1].marks += next[i].marks;
    next.splice(i, 1);
    return next;
}
function remove(chars, i) {
    const next = copy(chars);
    if (i < 0 || i >= next.length)
        return next;
    const removed = next.splice(i, 1)[0];
    if (removed.wordBefore && next[i] && i > 0)
        next[i].wordBefore = true;
    if (next[0])
        next[0].wordBefore = false;
    return next;
}
function boundary(chars, i) {
    const next = copy(chars);
    if (i > 0 && i < next.length)
        next[i].wordBefore = !next[i].wordBefore;
    return next;
}
// A word begins at the first character or at a wordBefore boundary.
function wordRange(chars, index = chars.length - 1) {
    if (!chars.length || index < 0 || index >= chars.length)
        return null;
    let start = index, end = index + 1;
    while (start > 0 && !chars[start].wordBefore)
        start--;
    while (end < chars.length && !chars[end].wordBefore)
        end++;
    return { start, end };
}
function deleteWord(chars, index = chars.length - 1) {
    const range = wordRange(chars, index);
    if (!range)
        return copy(chars);
    const next = copy(chars);
    const wasBoundary = !!next[range.start].wordBefore;
    next.splice(range.start, range.end - range.start);
    if (next[range.start] && range.start > 0 && wasBoundary)
        next[range.start].wordBefore = true;
    if (next[0])
        next[0].wordBefore = false;
    return next;
}
function insertWordSpace(chars, index = chars.length - 1) {
    const next = copy(chars);
    if (index < 0 || index >= next.length)
        return next;
    // A trailing space is pending until the next mark creates a character.
    if (index + 1 < next.length)
        next[index + 1].wordBefore = true;
    return next;
}

},
"js/core/morse.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decode = exports.alphabet = void 0;
exports.textOf = textOf;
exports.counts = counts;
exports.eventsFor = eventsFor;
// Store boundaries on characters, not as audio silence. Editing stays lossless.
exports.alphabet = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '!': '-.-.--', "'": '.----.', ':': '---...', '-': '-....-' };
const reverse = Object.fromEntries(Object.entries(exports.alphabet).map(([k, v]) => [v, k]));
const decode = marks => reverse[marks] || '□';
exports.decode = decode;
function textOf(chars) { return chars.map((c, i) => (i && c.wordBefore ? ' ' : '') + (0, exports.decode)(c.marks)).join(''); }
function counts(chars) { return { letters: chars.length, words: chars.length ? 1 + chars.slice(1).filter(c => c.wordBefore).length : 0 }; }
// A dot lasts 1 unit, a dash 3; intra-character, letter and word gaps are 1/3/7.
function eventsFor(chars, wpm) { const unit = 1.2 / wpm; const events = []; chars.forEach((c, i) => { if (i)
    events.push({ on: false, seconds: (c.wordBefore ? 7 : 3) * unit }); [...c.marks].forEach((mark, j) => { if (j)
    events.push({ on: false, seconds: unit }); events.push({ on: true, seconds: (mark === '-' ? 3 : 1) * unit }); }); }); return events; }

},
"js/core/tempo.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tempo = exports.BANDS = exports.clamp = exports.unitForWpm = void 0;
// PARIS standard: 50 timing units per word.
const unitForWpm = wpm => 1200 / wpm;
exports.unitForWpm = unitForWpm;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
exports.clamp = clamp;
// Broad sending styles allow adaptation without chasing every hesitation.
exports.BANDS = { meandering: [4, 7], comfortable: [7, 11], flowing: [11, 17], swift: [17, 25] };
class Tempo {
    constructor(unit = (0, exports.unitForWpm)(7), automatic = true, band = 'comfortable') {
        this.band = exports.BANDS[band] ? band : 'comfortable';
        this.automatic = automatic;
        this.samples = [];
        this.unit = this.limit(unit);
    }
    limit(unit) { const [lo, hi] = exports.BANDS[this.band]; return (0, exports.clamp)(unit, (0, exports.unitForWpm)(hi), (0, exports.unitForWpm)(lo)); }
    setBand(band) {
        this.band = exports.BANDS[band] ? band : 'comfortable';
        this.samples = [];
        const [lo, hi] = exports.BANDS[this.band];
        this.unit = (0, exports.unitForWpm)((lo + hi) / 2);
    }
    setManual(wpm) { this.unit = this.limit((0, exports.unitForWpm)(wpm)); this.samples = []; }
    // Recognition is more tolerant than ideal 1:3:7 sending guidance.
    mark(duration, unit = this.unit) { return duration >= 2 * unit ? '-' : '.'; }
    gap(duration, unit = this.unit) { return duration >= 11 * unit ? 'word' : duration >= 4.5 * unit ? 'letter' : 'inside'; }
    observe(duration, mark) {
        if (!this.automatic || duration < 35 || duration > 1800)
            return this.unit;
        const normalized = duration / (mark === '-' ? 3 : 1);
        if (normalized < this.unit * .6 || normalized > this.unit * 1.5)
            return this.unit;
        this.samples.push({ normalized, mark });
        if (this.samples.length > 24)
            this.samples.shift();
        // Mixed marks prevent an unusual run of long holds from moving the clock.
        if (this.samples.length < 8 || !this.samples.some(s => s.mark === '.') || !this.samples.some(s => s.mark === '-'))
            return this.unit;
        const values = this.samples.map(s => s.normalized).sort((a, b) => a - b);
        const n = values.length, median = n % 2 ? values[n >> 1] : (values[n / 2 - 1] + values[n / 2]) / 2;
        // Three percent maximum per mark: steady adaptation, no visual jumps.
        this.unit = this.limit((0, exports.clamp)(median, this.unit * .97, this.unit * 1.03));
        return this.unit;
    }
}
exports.Tempo = Tempo;

},
"js/library-controller.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initLibrary = initLibrary;
const library_js_1 = require("./storage/library.js");
const $ = id => document.getElementById(id);
function initLibrary() {
    const dialog = $('libraryDialog'), items = $('libraryItems'), status = $('libraryStatus');
    let filter = 'all';
    const filters = [...document.querySelectorAll('[data-library-filter]')];
    async function refresh() {
        items.replaceChildren();
        status.textContent = '';
        try {
            const entries = (await (0, library_js_1.listMessages)()).filter(e => filter === 'all' || (filter === 'received' ? e.kind === 'received' : e.kind === 'composed'));
            if (!entries.length) {
                const empty = document.createElement('p');
                empty.className = 'subtle';
                empty.textContent = 'No correspondence here yet.';
                items.append(empty);
                return;
            }
            for (const entry of entries) {
                const row = document.createElement('div');
                row.className = 'library-entry';
                if (filter === 'all')
                    row.classList.add(entry.kind === 'received' ? 'library-entry-received' : 'library-entry-composed');
                const open = document.createElement('button');
                open.type = 'button';
                open.className = 'library-open';
                const title = document.createElement('strong');
                title.textContent = entry.title || 'Untitled message';
                const meta = document.createElement('small');
                meta.textContent = `${entry.kind === 'received' ? 'Received' : 'Composed'} · ${new Date(entry.updatedAt).toLocaleDateString()}${entry.notes ? ' · Notes' : ''}`;
                open.append(title, meta);
                open.onclick = async () => {
                    const saved = await (0, library_js_1.getMessage)(entry.id);
                    if (!saved)
                        return;
                    if (saved.audio) {
                        document.querySelector('[data-workspace="listen"]')?.click();
                        document.dispatchEvent(new CustomEvent('morse:library-open-audio', { detail: { ...saved, fromLibrary: true } }));
                    }
                    else if (saved.chars) {
                        document.dispatchEvent(new CustomEvent('morse:library-open-compose', { detail: saved }));
                        document.querySelector('[data-workspace="compose"]')?.click();
                    }
                    dialog.close();
                };
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'library-delete';
                remove.textContent = '×';
                remove.title = 'Delete saved message';
                remove.setAttribute('aria-label', `Delete ${entry.title || 'message'}`);
                remove.onclick = async () => { if (!confirm('Delete this saved message and its notes?'))
                    return; await (0, library_js_1.deleteMessage)(entry.id); await refresh(); };
                const rename = document.createElement('button');
                rename.type = 'button';
                rename.className = 'library-rename';
                rename.textContent = '✎';
                rename.title = 'Rename message';
                rename.setAttribute('aria-label', `Rename ${entry.title || 'message'}`);
                rename.onclick = () => {
                    const editor = document.createElement('input');
                    editor.type = 'text';
                    editor.maxLength = 120;
                    editor.value = title.textContent;
                    editor.className = 'library-title-editor';
                    editor.setAttribute('aria-label', 'New message title');
                    title.replaceWith(editor);
                    editor.focus();
                    editor.select();
                    let done = false;
                    const finish = async (save) => { if (done)
                        return; done = true; if (save && editor.value.trim()) {
                        try {
                            const newTitle = await (0, library_js_1.renameMessage)(entry.id, editor.value);
                            title.textContent = newTitle;
                            document.dispatchEvent(new Event('morse:library-updated'));
                        }
                        catch (err) {
                            status.textContent = err.message;
                        }
                    } editor.replaceWith(title); };
                    editor.addEventListener('keydown', event => { if (event.key === 'Enter') {
                        event.preventDefault();
                        void finish(true);
                    } if (event.key === 'Escape') {
                        event.preventDefault();
                        void finish(false);
                    } });
                    editor.addEventListener('blur', () => void finish(true));
                };
                row.append(open, rename, remove);
                items.append(row);
            }
        }
        catch (error) {
            status.textContent = 'Library unavailable in this browser.';
            console.warn(error);
        }
    }
    const openButton = $('libraryBtn');
    if (openButton)
        openButton.addEventListener('click', () => {
            if (!dialog.open)
                dialog.showModal();
            void refresh();
        });
    $('libraryClose').addEventListener('click', () => dialog.close());
    filters.forEach(button => button.onclick = () => { filter = button.dataset.libraryFilter; filters.forEach(b => b.setAttribute('aria-pressed', String(b === button))); void refresh(); });
    document.addEventListener('morse:library-updated', () => { if (dialog.open)
        void refresh(); });
}

},
"js/listen/celestial-layout.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAYOUT_NAMES = void 0;
exports.familyFor = familyFor;
exports.createCelestialLayout = createCelestialLayout;
exports.orbitalPosition = orbitalPosition;
exports.groupPosition = groupPosition;
exports.groupForIndex = groupForIndex;
exports.wordSignature = wordSignature;
// Celestial coordinates describe ordering and membership, not simulated N-body physics.
// Every layout returns the same object model and can be animated without reordering words.
const TAU = Math.PI * 2;
const frac = x => x - Math.floor(x);
const hash = (i, j = 0) => frac(Math.sin(i * 127.1 + j * 311.7 + 17.2) * 43758.5453);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
exports.LAYOUT_NAMES = ['Solitary Luminary', 'Binary Dance', 'Celestial Waltz', 'Fourfold Meridian', 'Little Celestial Garden', 'Growing Orbit', 'Spiral Seed', 'Double Orbit', 'Spiral Observatory', 'Celestial Archipelago', 'Deep Sky Atlas'];
function familyFor(n) { return n <= 7 ? Math.max(0, n - 1) : n <= 12 ? 7 : n <= 35 ? 8 : n <= 100 ? 9 : 10; }
function createCelestialLayout(words, groupsHint = []) {
    const n = words.length, family = familyFor(n);
    const groups = [];
    if (n > 35) {
        // An unconfirmed pause grouping is a navigational family, never called a sentence.
        const groupSize = n <= 100 ? 12 : 25;
        const groupCount = Math.ceil(n / groupSize);
        for (let first = 0; first < n; first += groupSize) {
            const last = Math.min(n, first + groupSize), h = groups.length;
            const angle = groupCount <= 7 ? h * TAU / groupCount - .75 : h * 2.39996322972865;
            const radius = groupCount <= 7 ? 1.12 : .4 + .58 * Math.sqrt(h);
            groups.push({ first, last, title: `Passage ${h + 1}`, start: words[first].start,
                x: Math.cos(angle) * radius, y: Math.sin(h * 1.67) * .42,
                z: Math.sin(angle) * radius * .68, phase: angle, rate: .008 });
        }
    }
    else
        groups.push({ first: 0, last: n, title: 'Recording', start: words[0]?.start || 0,
            x: 0, y: 0, z: 0, phase: 0, rate: 0 });
    const points = words.map((_, i) => {
        let x = 0, y = 0, z = 0, rate = .009;
        if (n === 1) { /* A single word opens at the focused scale. */ }
        else if (n === 2) {
            const a = i * Math.PI;
            x = Math.cos(a) * .82;
            z = Math.sin(a + .48) * .47;
            y = Math.sin(a + .3) * .19;
            rate = .023;
        }
        else if (n === 3 || n === 4) {
            const a = i * TAU / n - .54;
            x = Math.cos(a) * 1.08;
            y = Math.sin(a) * .39;
            z = Math.sin(a) * .62;
            rate = .018;
        }
        else if (n === 5) {
            const a = -2.1 + i * 1.19, r = .75 + i * .13;
            x = Math.cos(a) * r;
            z = Math.sin(a) * r * .58;
            y = Math.sin(a * 1.13) * .33;
            rate = .014;
        }
        else if (n === 6) {
            // Six words form a spacious inclined orbital family, not the spiral seed.
            const a = -.62 + i * TAU / 6;
            const radius = 1.34 + .11 * Math.cos(i * 2.3);
            x = Math.cos(a) * radius;
            z = Math.sin(a) * radius * .72;
            y = .58 * Math.sin(a + .35) + .10 * Math.cos(i * 1.9);
            rate = .010;
        }
        else if (n === 7) {
            const a = -.8 + i * .99, r = .35 + i * .23;
            x = Math.cos(a) * r;
            z = Math.sin(a) * r * .75;
            y = Math.sin(a * .83) * .35;
            rate = .012;
        }
        else if (n <= 12) {
            const innerCount = Math.ceil(n * .44), inner = i < innerCount, j = inner ? i : i - innerCount;
            const count = inner ? innerCount : n - innerCount;
            const a = -.4 + j / count * TAU + (inner ? .12 : -.1), r = inner ? .83 : 1.72;
            x = Math.cos(a) * r;
            z = Math.sin(a) * r * .73;
            y = Math.sin(a) * (inner ? .28 : .47);
            rate = inner ? .016 : .011;
        }
        else if (n <= 35) {
            const a = -.3 + i * .53, r = .29 + 2.85 * Math.pow(i / (n - 1), .83);
            x = Math.cos(a) * r;
            z = Math.sin(a) * r * .76;
            y = Math.sin(a) * .43 + Math.sin(i * .62) * .12;
            rate = .01 / (1 + r * .11);
        }
        else {
            const g = groups.find(group => i >= group.first && i < group.last);
            const index = i - g.first, size = g.last - g.first;
            const a = index * (size > 15 ? .54 : .73) - 1.5, r = .15 + 1.12 * (index + 1) / size;
            x = g.x * 2.1 + Math.cos(a) * r * .72;
            y = g.y * 1.8 + Math.sin(a) * .32;
            z = g.z * 2.1 + Math.sin(a) * r * .6;
            rate = .006;
        }
        return { x, y, z, rate, seed: hash(i, 2), index: i, groupIndex: groups.findIndex(g => i >= g.first && i < g.last) };
    });
    return { family, name: exports.LAYOUT_NAMES[family], points, groups, count: n };
}
function orbitalPosition(point, time, reduced = false) {
    const phase = reduced ? 0 : time * point.rate;
    const cos = Math.cos(phase), sin = Math.sin(phase);
    return { x: point.x * cos - point.z * sin,
        y: point.y + (reduced ? 0 : .033 * Math.sin(time * .11 + point.index)),
        z: point.x * sin + point.z * cos };
}
function groupPosition(group, time, reduced = false) {
    const a = reduced ? 0 : time * group.rate;
    return { x: group.x * Math.cos(a) - group.z * Math.sin(a), y: group.y,
        z: group.x * Math.sin(a) + group.z * Math.cos(a) };
}
function groupForIndex(layout, index) { return layout.groups.findIndex(g => index >= g.first && index < g.last); }
function wordSignature(tones, word) {
    const matches = tones.filter(e => e.start < word.end && e.end > word.start);
    if (!matches.length)
        return { ratio: .34, density: 1, regularity: .5, elementCount: 0, ringCount: 4 };
    const lengths = matches.map(e => e.end - e.start).sort((a, b) => a - b);
    const short = lengths[Math.floor(lengths.length * .24)] || lengths[0];
    const dahs = lengths.filter(x => x > short * 1.7).length;
    const count = matches.length;
    const ringCount = count <= 3 ? 3 : count <= 6 ? 4 : count <= 10 ? 5 : count <= 15 ? 6 : count <= 22 ? 7 : 8;
    return { elementCount: count, ringCount, ratio: dahs / matches.length,
        density: clamp(matches.length / 20, 0, 1), regularity: clamp(short / (lengths[lengths.length - 1] || short), 0, 1) };
}

},
"js/listen/celestial-receiver.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CelestialReceiver = void 0;
const celestial_layout_js_1 = require("./celestial-layout.js");
const PI2 = 2 * Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = n => n - Math.floor(n);
const hash = (a, b = 0) => fract(Math.sin((a + 3) * 72.91 + b * 91.31) * 48611.72);
const ringTypes = [
    { r: 1.05, w: .055, h: .013, phase: .35, axes: [.19, .13, .105], spin: .42 },
    { r: .96, w: .026, h: .011, phase: 1.35, axes: [-.17, .23, -.085], spin: -.57 },
    { r: .85, w: .078, h: .019, phase: 2.15, axes: [.24, -.18, .13], spin: .64 },
    { r: .73, w: .029, h: .012, phase: 3.4, axes: [-.26, -.14, .17], spin: -.71 },
    { r: .61, w: .064, h: .015, phase: 4.25, axes: [.16, .29, -.11], spin: .53 },
    { r: .49, w: .031, h: .011, phase: 5.3, axes: [-.2, .21, .16], spin: -.82 }
];
function turn3(v, angles) {
    let [x, y, z] = v;
    const [ax, ay, az] = angles;
    let yy = y * Math.cos(ax) - z * Math.sin(ax), zz = y * Math.sin(ax) + z * Math.cos(ax);
    y = yy;
    z = zz;
    let xx = x * Math.cos(ay) + z * Math.sin(ay);
    zz = -x * Math.sin(ay) + z * Math.cos(ay);
    x = xx;
    z = zz;
    xx = x * Math.cos(az) - y * Math.sin(az);
    yy = x * Math.sin(az) + y * Math.cos(az);
    return [xx, yy, z];
}
function quad(ctx, p, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let k = 1; k < 4; k++)
        ctx.lineTo(p[k][0], p[k][1]);
    ctx.closePath();
    ctx.fill();
}
function toneLevel(time, tones, playing) {
    if (!playing || !tones.length)
        return 0;
    let lo = 0, hi = tones.length - 1;
    while (lo <= hi) {
        const m = (lo + hi) >> 1, e = tones[m];
        if (time < e.start)
            hi = m - 1;
        else if (time >= e.end)
            lo = m + 1;
        else
            return clamp(Math.min((time - e.start) / .018, (e.end - time) / .035), 0, 1);
    }
    return 0;
}
function drawFullArmillary(ctx, cx, cy, S, t, signature, bright, quality = 60) {
    const project = v => { const f = 3.8 / (3.8 + v[2] * .37); return [cx + v[0] * S * f, cy + v[1] * S * f]; };
    const quads = [];
    const ringCount = clamp(signature.ringCount || 4, 3, 8);
    for (let i = 0; i < ringCount; i++) {
        const ring = ringTypes[i % ringTypes.length], phase = ring.phase + Math.floor(i / ringTypes.length) * .87, angles = [.56 + i * .43 + t * ring.axes[0] + Math.sin(t * .091 + phase) * .32,
            .35 + i * .69 + t * ring.axes[1] + Math.cos(t * .083 + phase) * .36,
            phase * .7 + t * ring.axes[2] + Math.sin(t * .064 + phase) * .24];
        const spin = t * ring.spin + phase;
        const band = ring.w * (1 + (signature.ratio - .38) * (i % 2 ? -.17 : .32) + signature.density * .05);
        const radiusOffset = i >= ringTypes.length ? .12 + (i - ringTypes.length) * .09 : 0;
        const points = [];
        for (let j = 0; j <= quality; j++) {
            const theta = j / quality * PI2 + spin, co = Math.cos(theta), si = Math.sin(theta), r0 = ring.r - radiusOffset - band / 2, r1 = ring.r - radiusOffset + band / 2;
            points.push({ li: turn3([co * r0, si * r0, -ring.h], angles), lo: turn3([co * r1, si * r1, -ring.h], angles),
                ui: turn3([co * r0, si * r0, ring.h], angles), uo: turn3([co * r1, si * r1, ring.h], angles),
                inner: turn3([-co, -si, 0], angles), outer: turn3([co, si, 0], angles), up: turn3([0, 0, 1], angles), down: turn3([0, 0, -1], angles), theta });
        }
        for (let j = 0; j < quality; j++) {
            const a = points[j], b = points[j + 1];
            for (const [surface, keys, normKey] of [['inner', ['li', 'ui', 'ui', 'li'], 'inner'], ['outer', ['lo', 'uo', 'uo', 'lo'], 'outer'], ['face', ['ui', 'uo', 'uo', 'ui'], 'up'], ['shadow', ['li', 'lo', 'lo', 'li'], 'down']]) {
                const vertices = keys.map((key, index) => index < 2 ? a[key] : b[key]);
                const meanZ = vertices.reduce((sum, v) => sum + v[2], 0) / 4, normal = a[normKey];
                const inward = surface === 'inner', outward = surface === 'outer' || surface === 'shadow';
                // Inward surfaces catch light from the pearl; outward surfaces remain dark.
                const base = inward ? [185, 151, 96] : outward ? [76, 64, 45] : [151, 123, 80];
                const directional = .5 + .5 * clamp(normal[0] * -.29 + normal[1] * -.51 + normal[2] * -.55, -1, 1);
                const glint = Math.pow(Math.max(0, .5 + .5 * Math.sin(a.theta * 2 + spin * 1.35)), 8);
                const light = (inward ? .55 : outward ? .20 : .38) + directional * (inward ? .35 : outward ? .14 : .27) + glint * (inward ? .25 : .12);
                const multiplier = .58 + light + (inward ? .22 : outward ? .06 : .12) * bright;
                const rgb = base.map(n => Math.round(clamp(n * multiplier, 0, 255)));
                quads.push({ z: meanZ, p: vertices.map(project), color: `rgb(${rgb.join(',')})` });
            }
        }
    }
    quads.sort((a, b) => b.z - a.z);
    for (const p of quads)
        if (p.z >= 0)
            quad(ctx, p.p, p.color);
    drawPearl(ctx, cx, cy, S, bright);
    for (const p of quads)
        if (p.z < 0)
            quad(ctx, p.p, p.color);
}
function drawPearl(ctx, cx, cy, S, bright) {
    const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, S * (.54 + .13 * bright));
    halo.addColorStop(0, `rgba(252,222,164,${.25 + .26 * bright})`);
    halo.addColorStop(.32, `rgba(219,174,106,${.085 + .14 * bright})`);
    halo.addColorStop(1, 'rgba(205,158,85,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, S * (.54 + .13 * bright), 0, PI2);
    ctx.fill();
    const r = S * (.112 + .007 * bright), orb = ctx.createRadialGradient(cx - r * .32, cy - r * .38, 1, cx, cy, r);
    orb.addColorStop(0, '#fff2d5');
    orb.addColorStop(.37, '#f4deae');
    orb.addColorStop(.75, '#dbb977');
    orb.addColorStop(1, '#a88149');
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, PI2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,239,207,${.055 + .25 * bright})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r * .93, 0, PI2);
    ctx.fill();
}
function drawMini(ctx, x, y, r, t, seed, bright) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.27);
    glow.addColorStop(0, `rgba(225,196,137,${.06 + .20 * bright})`);
    glow.addColorStop(1, 'rgba(225,196,137,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 1.27, y - r * 1.27, r * 2.54, r * 2.54);
    for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(seed * 2.8 + k * 1.3 + t * (k % 2 ? -.17 : .12));
        const fac = .19 + .78 * Math.abs(Math.cos(t * (k % 2 ? -.13 : .14) + seed + k));
        ctx.scale(1, fac);
        ctx.beginPath();
        ctx.arc(0, 0, r * (.95 - k * .17), 0, PI2);
        ctx.lineWidth = Math.max(.75, r * (k === 0 ? .08 : .04));
        ctx.strokeStyle = k === 0 ? '#c7a66c' : k === 1 ? '#765f41' : '#dbbd83';
        ctx.stroke();
        ctx.restore();
    }
    const orb = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, Math.max(3, r * .22));
    orb.addColorStop(0, '#fff0c9');
    orb.addColorStop(1, '#c39b5e');
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.7, r * .15), 0, PI2);
    ctx.fill();
}
function drawNebula(ctx, x, y, r, seed, t, active = false) {
    // Distant collections are unresolved aggregates, not enlarged word armillaries.
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, r * 1.55);
    cloud.addColorStop(0, active ? 'rgba(243,220,167,.65)' : 'rgba(197,185,140,.32)');
    cloud.addColorStop(.3, active ? 'rgba(174,184,123,.33)' : 'rgba(117,150,114,.20)');
    cloud.addColorStop(1, 'rgba(19,56,39,0)');
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.55, r * 1.10, seed * 1.9, 0, PI2);
    ctx.fill();
    for (let i = 0; i < 14; i++) {
        const angle = i * 2.399 + seed * 9, rad = r * (.12 + .8 * hash(i, seed * 10));
        const px = x + Math.cos(angle + t * .007) * rad, py = y + Math.sin(angle + t * .008) * rad * .55;
        ctx.fillStyle = `rgba(233,208,159,${.25 + .45 * hash(i, 3)})`;
        ctx.beginPath();
        ctx.arc(px, py, .45 + hash(i, 2) * 1.1, 0, PI2);
        ctx.fill();
    }
}
class CelestialReceiver {
    constructor({ canvas, scope, getPlayback, onWord, onGroup, onBack }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.scope = scope;
        this.getPlayback = getPlayback;
        this.onWord = onWord;
        this.onGroup = onGroup;
        this.onBack = onBack;
        this.layout = (0, celestial_layout_js_1.createCelestialLayout)([]);
        this.tones = [];
        this.signatures = [];
        this.yaw = .32;
        this.pitch = .24;
        this.t = 0;
        this.last = 0;
        this.raf = 0;
        this.active = false;
        this.drag = null;
        this.railOffset = 0;
        this.railTouched = false;
        this.hits = [];
        this.lastTap = 0;
        this.lastPoint = null;
        this.focusMix = 0;
        this.parallax = { x: 0, y: 0 };
        this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas);
        canvas.addEventListener('pointerdown', e => this.pointerDown(e));
        canvas.addEventListener('pointermove', e => this.pointerMove(e));
        canvas.addEventListener('pointerup', e => this.pointerUp(e));
        canvas.addEventListener('pointercancel', () => { this.drag = null; });
        canvas.addEventListener('dblclick', e => { if (this.scope.view !== 'overview' && !this.hit(this.point(e)))
            this.onBack(); });
    }
    configure(words, tones) {
        this.layout = (0, celestial_layout_js_1.createCelestialLayout)(words);
        this.railOffset = 0;
        this.railTouched = false;
        this.tones = tones || [];
        this.signatures = words.map(word => (0, celestial_layout_js_1.wordSignature)(this.tones, word));
        this.t = 0;
        this.focusMix = this.scope.view === 'focus' ? 1 : 0;
    }
    resize() {
        const r = this.canvas.getBoundingClientRect();
        this.w = Math.max(1, r.width);
        this.h = Math.max(1, r.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        this.canvas.width = Math.round(this.w * dpr);
        this.canvas.height = Math.round(this.h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    start() { if (this.active)
        return; this.active = true; this.resize(); this.last = performance.now(); this.raf = requestAnimationFrame(n => this.frame(n)); }
    stop() { this.active = false; cancelAnimationFrame(this.raf); }
    point(e) { const b = this.canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
    hit(p) {
        return this.hits.map(h => ({ ...h, dist: Math.hypot(h.x - p.x, h.y - p.y) }))
            .filter(h => h.dist <= h.radius).sort((a, b) => a.dist - b.dist)[0] || null;
    }
    pointerDown(e) { if (e.button !== 0)
        return; const p = this.point(e); this.drag = { x: p.x, y: p.y, originalX: p.x, originalY: p.y, moved: false, initialOffset: this.railOffset }; this.canvas.setPointerCapture?.(e.pointerId); }
    pointerMove(e) {
        const p = this.point(e);
        // Pointer movement only shifts near-field atmosphere. Word coordinates never move.
        if (e.pointerType === 'mouse')
            this.parallax = { x: clamp((p.x / this.w - .5) * 2, -1, 1), y: clamp((p.y / this.h - .5) * 2, -1, 1) };
        if (!this.drag)
            return;
        if (Math.hypot(p.x - this.drag.originalX, p.y - this.drag.originalY) > 9)
            this.drag.moved = true;
        if (this.scope.view === 'overview' && this.drag.moved && this.layout.count > 6) {
            const spacing = this.railSpacing();
            const visible = Math.max(1, Math.floor((this.w - 64) / spacing));
            this.railOffset = clamp(this.drag.initialOffset - (p.x - this.drag.originalX) / spacing, 0, Math.max(0, this.layout.count - visible));
            this.railTouched = true;
        }
        if (e.pointerType !== 'mouse' && this.drag.moved)
            this.parallax = { x: clamp((p.x - this.drag.originalX) / 120, -1, 1), y: clamp((p.y - this.drag.originalY) / 120, -1, 1) };
        this.drag.x = p.x;
        this.drag.y = p.y;
    }
    pointerUp(e) {
        if (!this.drag)
            return;
        const moved = this.drag.moved;
        this.drag = null;
        if (moved)
            return;
        const p = this.point(e), hit = this.hit(p), now = performance.now();
        if (hit) {
            if (hit.kind === 'word')
                this.onWord(hit.index);
            else if (hit.kind === 'group')
                this.onGroup(hit.index);
            this.lastTap = 0;
            return;
        }
        if (this.scope.view !== 'overview' && now - this.lastTap < 390 && this.lastPoint && Math.hypot(p.x - this.lastPoint.x, p.y - this.lastPoint.y) < 38) {
            this.onBack();
            this.lastTap = 0;
            return;
        }
        this.lastTap = now;
        this.lastPoint = p;
    }
    worldPoint(p) { return (0, celestial_layout_js_1.orbitalPosition)(p, this.t, this.reduced); }
    project(p, scale, centerX = this.w * .5, centerY = this.h * .46) {
        let { x, y, z } = p;
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cx = Math.cos(this.pitch), sx = Math.sin(this.pitch);
        let xx = x * cy - z * sy, zz = x * sy + z * cy;
        x = xx;
        z = zz;
        let yy = y * cx - z * sx;
        z = y * sx + z * cx;
        y = yy;
        const depth = clamp(5 / (5 + z * .36), .48, 1.7);
        return { x: centerX + x * scale * depth, y: centerY + y * scale * depth, z, depth };
    }
    background(bright) {
        const { ctx, w, h, t } = this;
        const bg = ctx.createRadialGradient(w * .48, h * .47, 1, w * .49, h * .47, Math.max(w, h) * .77);
        bg.addColorStop(0, '#234333');
        bg.addColorStop(.50, '#09251a');
        bg.addColorStop(1, '#020b08');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        const overview = this.scope.view === 'overview' || this.scope.view === 'group';
        const glow = ctx.createRadialGradient(w * .50, h * .47, 1, w * .5, h * .47, Math.max(w, h) * (.39 + bright * .10));
        glow.addColorStop(0, `rgba(226,194,135,${overview ? .018 : .035 + (bright * .15)})`);
        glow.addColorStop(1, 'rgba(221,180,105,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 105; i++) {
            const drift = this.reduced ? 0 : t;
            const near = i % 4 === 0, parallax = near ? this.parallax : { x: 0, y: 0 };
            const x = (hash(i, 1) * w + Math.sin(drift * .018 + i) * 7 + parallax.x * 9 + w * 2) % w, y = (hash(i, 3) * h + Math.cos(drift * .012 + i) * 6 + parallax.y * 7 + h * 2) % h;
            const a = .13 + .28 * (.5 + .5 * Math.sin(t * .19 + i));
            ctx.fillStyle = `rgba(${i % 4 ? '187,202,168' : '226,207,154'},${a})`;
            ctx.beginPath();
            ctx.arc(x, y, .35 + hash(i, 6) * .85, 0, PI2);
            ctx.fill();
        }
        ctx.lineWidth = .6;
        ctx.strokeStyle = 'rgba(183,155,97,.065)';
        for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.ellipse(w * .5, h * .47, w * (.55 + k * .11), h * (.21 + k * .06), -.19 + k * .17, 0, PI2);
            ctx.stroke();
        }
    }
    railSpacing() { const n = this.layout.count; return n <= 6 ? Math.max(48, Math.min(94, (this.w - 78) / Math.max(1, n))) : clamp(this.w < 480 ? 75 : 94, 66, 110); }
    drawOverview(playback, bright) {
        const { ctx, w, h } = this, n = this.layout.count;
        this.hits = [];
        if (!n) {
            ctx.fillStyle = '#c3c9ad';
            ctx.textAlign = 'center';
            ctx.font = '13px Georgia';
            ctx.fillText(playback.loaded ? 'No reliable word boundaries' : 'Open a recording in Quiet', w / 2, h * .48);
            return;
        }
        if (n === 1) {
            this.drawFocus(playback, bright);
            return;
        }
        const spacing = this.railSpacing(), left = 36, right = w - 36, visible = Math.max(1, Math.floor((right - left) / spacing));
        const active = this.scope.wordAt(playback.position);
        // Follow playback until the user deliberately scrolls the rail. A touch gesture
        // changes only the viewport, never the transport's playback position.
        if (!this.railTouched && active >= 0 && n > visible) {
            const target = clamp(active - Math.floor(visible / 2), 0, Math.max(0, n - visible));
            this.railOffset += (target - this.railOffset) * .12;
        }
        this.railOffset = clamp(this.railOffset, 0, Math.max(0, n - visible));
        const cy = h * .46, first = Math.max(0, Math.floor(this.railOffset) - 1);
        const last = Math.min(n, Math.ceil(this.railOffset) + visible + 2);
        // The rail is an optical shelf rather than a line or a collection of cards.
        const baseY = cy + clamp(h * .20, 36, 80);
        const line = ctx.createLinearGradient(left, 0, right, 0);
        line.addColorStop(0, 'rgba(199,171,109,0)');
        line.addColorStop(.15, 'rgba(199,171,109,.22)');
        line.addColorStop(.85, 'rgba(199,171,109,.22)');
        line.addColorStop(1, 'rgba(199,171,109,0)');
        ctx.strokeStyle = line;
        ctx.lineWidth = .7;
        ctx.beginPath();
        ctx.moveTo(left, baseY);
        ctx.lineTo(right, baseY);
        ctx.stroke();
        for (let i = first; i < last; i++) {
            const railLeft = n <= 5 ? (w - n * spacing) / 2 : left;
            const x = railLeft + spacing * (i - this.railOffset + .5);
            if (x < 12 || x > w - 12)
                continue;
            const isActive = active === i, selected = this.scope.queued === i;
            const r = Math.min(30, Math.max(18, spacing * .31));
            const illumination = isActive ? bright : 0;
            drawMini(ctx, x, cy, r, this.t, i * .21, illumination);
            if (isActive && illumination > .03) {
                const halo = ctx.createRadialGradient(x, cy, r * .2, x, cy, r * 1.55);
                halo.addColorStop(0, `rgba(242,211,151,${.13 * illumination})`);
                halo.addColorStop(1, 'rgba(242,211,151,0)');
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(x, cy, r * 1.55, 0, PI2);
                ctx.fill();
            }
            ctx.font = (isActive ? 'bold ' : '') + '11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillStyle = isActive ? '#f2dfb1' : selected ? '#dbc38d' : '#a8bba6';
            ctx.fillText(String(i + 1), x, baseY + 20);
            if (isActive) {
                ctx.strokeStyle = 'rgba(238,210,154,.75)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, cy, r * 1.13, 0, PI2);
                ctx.stroke();
            }
            this.hits.push({ kind: 'word', index: i, x, y: cy, radius: Math.max(30, spacing * .43) });
        }
        if (n > visible) {
            const trackLeft = left + 10, trackWidth = right - left - 20, thumb = Math.max(24, trackWidth * visible / n);
            const range = Math.max(1, n - visible), trackY = h - 92;
            ctx.fillStyle = 'rgba(188,169,115,.18)';
            ctx.fillRect(trackLeft, trackY, trackWidth, 1);
            ctx.fillStyle = 'rgba(224,194,133,.65)';
            ctx.fillRect(trackLeft + (trackWidth - thumb) * this.railOffset / range, trackY - 1, thumb, 3);
        }
    }
    drawGroup(playback, bright) {
        const { layout, scope, ctx, w, h } = this;
        this.hits = [];
        const group = layout.groups[scope.group];
        if (!group)
            return;
        const points = layout.points.slice(group.first, group.last).map((p, i) => ({ pos: this.worldPoint(p), index: group.first + i }));
        const center = (0, celestial_layout_js_1.groupPosition)(group, this.t, this.reduced);
        const projected = points.map(p => ({ ...this.project({ x: p.pos.x - center.x * 2.1, y: p.pos.y - center.y * 1.8, z: p.pos.z - center.z * 2.1 }, Math.min(w * .28, h * .34)), index: p.index })).sort((a, b) => b.z - a.z);
        const activeWord = scope.wordAt(playback.position);
        for (const p of projected) {
            const r = clamp(18 * p.depth, 9, 28), on = activeWord === p.index ? bright : 0;
            drawMini(ctx, p.x, p.y, r, this.t, p.index * .26, on);
            this.hits.push({ kind: 'word', index: p.index, x: p.x, y: p.y, radius: Math.max(22, r * 1.4) });
        }
    }
    drawFocus(playback, bright) {
        const { ctx, w, h, scope, layout } = this, index = scope.selected;
        this.hits = [];
        if (index < 0 || !layout.points[index])
            return;
        const S = Math.min(w * .33, h * .34, 235), cx = w * .5, cy = h * .46;
        const center = this.worldPoint(layout.points[index]);
        const otherIndices = layout.points.map((_, i) => i).filter(i => i !== index);
        // Actual positions in the celestial system; no synthetic edge columns or clamping.
        const nearby = otherIndices.map(i => {
            const point = this.worldPoint(layout.points[i]);
            const relative = { x: point.x - center.x, y: point.y - center.y, z: point.z - center.z };
            return { ...this.project(relative, Math.min(w * .29, h * .35), cx, cy), index: i };
        }).filter(p => p.x >= 12 && p.x <= w - 12 && p.y >= 28 && p.y <= h - 74 && Math.hypot(p.x - cx, p.y - cy) > S * .40)
            .sort((a, b) => b.z - a.z);
        for (const p of nearby.slice(0, 26)) {
            const r = clamp(10 * p.depth, 3, 14);
            drawMini(ctx, p.x, p.y, r, this.t, p.index * .31, 0);
            this.hits.push({ kind: 'word', index: p.index, x: p.x, y: p.y, radius: Math.max(20, r * 1.55) });
        }
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 2.4);
        halo.addColorStop(0, `rgba(239,206,146,${.06 + .10 * bright})`);
        halo.addColorStop(1, 'rgba(216,178,108,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);
        drawFullArmillary(ctx, cx, cy, S, this.t, this.signatures[index] || { ratio: .34, density: .5 }, bright, this.reduced ? 42 : 56);
        this.hits.push({ kind: 'center', index, x: cx, y: cy, radius: S * .96 });
    }
    drawLoopReturn(playback) {
        const age = playback.loopCompletionAge;
        if (!(age >= 0 && age < .72))
            return;
        const ctx = this.ctx, focus = this.scope.view === 'focus';
        let x = this.w * .5, y = this.h * .46, r = Math.min(this.w * .33, this.h * .34, 235);
        if (!focus) {
            const current = this.scope.wordAt(Math.max(0, this.scope.interval().end - .001));
            const hit = this.hits.find(h => h.kind === 'word' && h.index === current);
            if (!hit)
                return;
            x = hit.x;
            y = hit.y;
            r = Math.max(14, Math.min(36, hit.radius * .85));
        }
        const progress = Math.min(1, age / .55), opacity = Math.pow(1 - progress, 1.7) * .68;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r * (1.05 + progress * .33), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(243,207,137,${opacity})`;
        ctx.lineWidth = Math.max(1.1, 2.7 * (1 - progress));
        ctx.shadowColor = 'rgba(242,198,116,.85)';
        ctx.shadowBlur = 12 + 16 * (1 - progress);
        ctx.stroke();
        ctx.restore();
    }
    frame(now) {
        if (!this.active)
            return;
        const maximumFramesPerSecond = this.w < 640 ? 27 : 30;
        if (now - this.last < 1000 / maximumFramesPerSecond) {
            this.raf = requestAnimationFrame(n => this.frame(n));
            return;
        }
        const dt = Math.min(.06, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        if (!document.hidden)
            this.t += dt * (this.reduced ? .1 : clamp(Number(this.getPlayback().rate) || 1, .5, 2.2));
        const playback = this.getPlayback(), bright = toneLevel(playback.position, this.tones, playback.playing);
        this.background(bright);
        if (this.scope.view === 'focus')
            this.drawFocus(playback, bright);
        else if (this.scope.view === 'group')
            this.drawGroup(playback, bright);
        else
            this.drawOverview(playback, bright);
        this.drawLoopReturn(playback);
        this.raf = requestAnimationFrame(n => this.frame(n));
    }
}
exports.CelestialReceiver = CelestialReceiver;

},
"js/listen/living-field.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLivingField = createLivingField;
// A perceptual instrument: physical movement encodes onset density, sustained sound,
// and recovery during silence. It does not imply automatic decoding.
function createLivingField(canvas) {
    const context = canvas.getContext('2d');
    let raf = 0, last = 0, energy = 0, memory = 0;
    const motes = Array.from({ length: 13 }, (_, i) => ({ a: i * 2.39996, r: .18 + (i % 5) * .115, phase: i * .7 }));
    let getPosition = () => 0, getDuration = () => 1, getPlaying = () => false, envelope = [];
    function configure({ position, duration, playing, events }) { getPosition = position; getDuration = duration; getPlaying = playing; envelope = events || []; }
    function frame(t) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        const seconds = getPosition();
        const active = envelope.some(e => seconds >= e.start && seconds < e.end);
        const elapsed = Math.min(.06, Math.max(0, (t - last) / 1000));
        last = t;
        const target = active && getPlaying() ? 1 : 0;
        energy += (target - energy) * Math.min(1, elapsed * (target ? 10 : 2.3));
        memory += (energy - memory) * Math.min(1, elapsed * 1.1);
        context.clearRect(0, 0, w, h);
        const cx = w * .5, cy = h * .51, scale = Math.min(w, h) * .4;
        const halo = context.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.4);
        halo.addColorStop(0, `rgba(172,185,132,${.07 + memory * .13})`);
        halo.addColorStop(1, 'rgba(15,43,30,0)');
        context.fillStyle = halo;
        context.fillRect(0, 0, w, h);
        motes.forEach((m, i) => {
            const drift = (getPlaying() ? seconds * .12 : 0) + Math.sin(t * .00022 + m.phase) * .12;
            const radius = scale * m.r * (1 + energy * .13);
            const x = cx + Math.cos(m.a + drift) * radius * 1.8;
            const y = cy + Math.sin(m.a + drift) * radius * .95;
            const size = (i % 4 === 0 ? 3.5 : 2.1) * dpr * (1 + energy * (i % 3 === 0 ? 1.1 : .35));
            const light = context.createRadialGradient(x, y, 0, x, y, size * 6);
            light.addColorStop(0, `rgba(248,221,164,${.7 + energy * .24})`);
            light.addColorStop(.2, `rgba(216,193,128,${.25 + energy * .3})`);
            light.addColorStop(1, 'rgba(216,193,128,0)');
            context.fillStyle = light;
            context.beginPath();
            context.arc(x, y, size * 6, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = '#e9d9aa';
            context.beginPath();
            context.arc(x, y, size * .52, 0, Math.PI * 2);
            context.fill();
        });
        context.strokeStyle = `rgba(190,179,118,${.11 + memory * .2})`;
        context.lineWidth = dpr;
        context.beginPath();
        context.ellipse(cx, cy, scale * .72 * (1 + memory * .13), scale * .41 * (1 + memory * .12), -.23, 0, Math.PI * 2);
        context.stroke();
        raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
    } }
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    return { configure, start, stop };
}

},
"js/listen/quiet-controller.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initQuiet = initQuiet;
const signal_analysis_js_1 = require("./signal-analysis.js");
const clean_morse_js_1 = require("../audio/clean-morse.js");
const listening_transport_js_1 = require("../audio/listening-transport.js");
const living_field_js_1 = require("./living-field.js");
const receiver_scope_js_1 = require("./receiver-scope.js");
const signal_envelope_js_1 = require("./signal-envelope.js");
const celestial_receiver_js_1 = require("./celestial-receiver.js");
const library_js_1 = require("../storage/library.js");
const $ = id => document.getElementById(id);
const clock = t => `${Math.floor((t || 0) / 60)}:${String(Math.floor((t || 0) % 60)).padStart(2, '0')}`;
function initQuiet() {
    const audio = new listening_transport_js_1.ListeningTransport();
    let recordId = null, loaded = false, raf = 0, lastNotes = '', notesTimer = 0, loading = 0;
    let mode = 'quiet', words = [], tones = [], selectionArmed = false;
    let fireflyFrame = 0;
    const scope = new receiver_scope_js_1.ReceiverScope();
    const error = message => { $('listenError').textContent = message || ''; };
    const duration = () => Number.isFinite(audio.duration) ? audio.duration : scope.duration;
    const notify = () => document.dispatchEvent(new Event('morse:library-updated'));
    const living = (0, living_field_js_1.createLivingField)($('livingCanvas'));
    living.configure({ position: () => audio.currentTime, duration: () => duration(), playing: () => !audio.paused, events: [] });
    let renderer, rendererFailed = false;
    try {
        renderer = new celestial_receiver_js_1.CelestialReceiver({ canvas: $('receiverCanvas'), scope,
            getPlayback: () => ({ position: audio.visualPosition, playing: audio.isMorseAudible, rate: audio.playbackRate, loaded, loopCompletionAge: audio.loopCompletionAge }),
            onWord: i => focusWord(i), onGroup: i => enterGroup(i), onBack: () => stepOut() });
    }
    catch (e) {
        rendererFailed = true;
        console.error('Receiver renderer initialization failed', e);
        $('receiverHint').textContent = 'The celestial renderer could not start. Playback and word navigation remain available.';
        renderer = { layout: { name: 'RECEIVER', groups: [] }, start() { }, stop() { }, configure() { }, resize() { } };
    }
    function updateReceiverControls() {
        const focused = scope.view === 'focus' && scope.selected >= 0;
        $('receiverTitle').textContent = !words.length ? 'THE RECEIVER' : focused ? 'FOCUSED · WORD ' + (scope.selected + 1) : scope.view === 'group' ? 'PASSAGE ' + (scope.group + 1) : renderer.layout.name.toUpperCase();
        $('receiverCount').textContent = loaded ? `${words.length} ${words.length === 1 ? 'word' : 'estimated words'}` : 'Open a recording in Quiet';
        $('receiverWordNumber').max = String(Math.max(1, words.length));
        if (focused)
            $('receiverWordNumber').value = String(scope.selected + 1);
        $('receiverBack').hidden = scope.view === 'overview' || words.length <= 1;
        $('receiverHint').textContent = rendererFailed ? 'Celestial renderer unavailable; use the Word number and transport below' : !loaded ? 'Load a WAV in Quiet first' : !words.length ? 'No reliable boundaries; whole recording remains playable' : focused ? `Word ${scope.selected + 1} of ${words.length} · Double tap empty sky to return` : scope.view === 'group' ? `Passage ${scope.group + 1} · Touch a word to focus` : renderer.layout.count > 35 ? 'Touch a luminous cluster to explore' : 'Touch a celestial body to focus; move the pointer to explore nearby stardust';
        $('receiverStatus').textContent = focused ? `WORD ${scope.selected + 1} · ${clock(words[scope.selected].start)}–${clock(words[scope.selected].end)}` : scope.view === 'group' ? 'CELESTIAL FAMILY' : '';
        for (const id of ['receiverLoop', 'listenLoop'])
            $(id).setAttribute('aria-pressed', String(scope.loop));
        const pause = !audio.paused;
        $('receiverPlay').textContent = pause ? 'Ⅱ' : '▶';
        $('receiverPlay').setAttribute('aria-label', pause ? 'Pause' : 'Play');
        $('receiverSpeed').textContent = Number(audio.playbackRate.toFixed(2)) + '×';
        const atEnd = loaded && words.length > 0 && currentWordIndex() >= words.length - 1;
        $('receiverNext').disabled = !loaded || !words.length || atEnd;
        $('receiverPrevious').disabled = !loaded;
    }
    function showMode(next) {
        mode = next === 'receiver' ? 'receiver' : 'quiet';
        // Changing rooms does not create a new player, seek, or silently begin playback.
        if (mode === 'quiet') {
            scope.overview();
            scope.setLoop(scope.loop);
        }
        $('listenStage').hidden = mode !== 'quiet';
        $('listenView').classList.toggle('receiver-active', mode === 'receiver');
        $('receiverInstrument').hidden = mode !== 'receiver';
        document.querySelectorAll('[data-listen-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.listenMode === mode)));
        living.stop();
        if (mode === 'receiver') {
            // Receiver begins as an open observatory, never underneath an expanded note editor.
            const panel = $('listenNotesPanel');
            if (!panel.hidden) {
                panel.hidden = true;
                $('listenNotesToggle').setAttribute('aria-expanded', 'false');
                $('listenView').classList.remove('notes-open');
                document.body.classList.remove('notes-writing', 'native-notes-keyboard');
                $('listenNotesText').blur();
                document.documentElement.style.removeProperty('--tg-visual-height');
                void saveNotes();
            }
            renderer.start();
        }
        else
            renderer.stop();
        updateReceiverControls();
    }
    function seekTo(time) { if (!loaded)
        return; audio.currentTime = Math.max(0, Math.min(duration(), time)); update(); }
    function focusWord(index) {
        if (!loaded || !words.length)
            return;
        const start = scope.focus(index);
        if (start === null)
            return;
        audio.pause();
        seekTo(start);
        selectionArmed = true;
        updateReceiverControls();
    }
    function enterGroup(index) {
        if (!loaded)
            return;
        audio.pause();
        scope.enterGroup(index);
        updateReceiverControls();
    }
    function stepOut() {
        if (!loaded)
            return;
        audio.pause();
        const position = scope.back();
        if (position !== null)
            seekTo(position);
        selectionArmed = false;
        updateReceiverControls();
    }
    // Restart always replays the current word; Next advances one whole word.
    // A word is identified by its measured interval, not by an inferred letter gap.
    function currentWordIndex() {
        if (!words.length)
            return -1;
        if (scope.view === 'focus' && scope.selected >= 0)
            return scope.selected;
        const position = audio.currentTime;
        const sounding = scope.wordAt(position);
        if (sounding >= 0)
            return sounding;
        const following = words.findIndex(word => word.start > position + .015);
        if (following >= 0)
            return following;
        return Math.max(0, Math.min(words.length - 1, scope.queued));
    }
    function playWord(index) {
        if (!loaded || index < 0 || index >= words.length)
            return;
        focusWord(index);
        void togglePlayback();
    }
    function restartCurrentWord() {
        if (!loaded)
            return;
        const index = currentWordIndex();
        if (index < 0) {
            audio.pause();
            seekTo(0);
            selectionArmed = true;
            void togglePlayback();
            return;
        }
        playWord(index);
    }
    function playNextWord() {
        if (!loaded || !words.length)
            return;
        const index = currentWordIndex();
        if (index >= words.length - 1)
            return;
        playWord(index + 1);
    }
    async function togglePlayback() {
        if (!loaded) {
            error('Open a WAV in Quiet first.');
            return;
        }
        try {
            if (!audio.paused) {
                audio.pause();
                updateReceiverControls();
                return;
            }
            const region = scope.interval();
            const reset = selectionArmed || audio.currentTime < region.start || audio.currentTime >= region.end - .012;
            if (reset)
                audio.currentTime = region.start;
            const cue = reset || audio.currentTime <= region.start + .015;
            selectionArmed = false;
            error('');
            await audio.play({ start: region.start, end: region.end, loop: scope.loop,
                gap: scope.view === 'focus' ? .36 : .62, cue });
            updateReceiverControls();
        }
        catch (e) {
            error('Playback failed: ' + e.message);
            console.error(e);
        }
    }
    document.querySelectorAll('[data-listen-mode]').forEach(b => b.addEventListener('click', () => showMode(b.dataset.listenMode)));
    $('receiverPrevious').addEventListener('click', restartCurrentWord);
    $('receiverNext').addEventListener('click', playNextWord);
    $('receiverPlay').addEventListener('click', () => void togglePlayback());
    $('receiverLoop').addEventListener('click', () => toggleLoop());
    $('receiverBack').addEventListener('click', stepOut);
    $('receiverFind').addEventListener('click', () => focusWord(Math.max(0, Math.min(words.length - 1, Math.round(Number($('receiverWordNumber').value) || 1) - 1))));
    $('receiverWordNumber').addEventListener('keydown', e => { if (e.key === 'Enter')
        $('receiverFind').click(); });
    const receiverSpeedMenu = $('receiverSpeedMenu');
    $('receiverSpeed').addEventListener('click', () => {
        receiverSpeedMenu.hidden = !receiverSpeedMenu.hidden;
        $('receiverSpeed').setAttribute('aria-expanded', String(!receiverSpeedMenu.hidden));
    });
    for (const button of receiverSpeedMenu.querySelectorAll('[data-receiver-rate]'))
        button.addEventListener('click', () => {
            receiverSpeedMenu.hidden = true;
            $('receiverSpeed').setAttribute('aria-expanded', 'false');
            void setSpeed(button.dataset.receiverRate);
        });
    document.addEventListener('pointerdown', event => {
        if (!event.target.closest('.receiver-speed-wrap')) {
            receiverSpeedMenu.hidden = true;
            $('receiverSpeed').setAttribute('aria-expanded', 'false');
        }
    });
    function toggleLoop() {
        const playing = !audio.paused, region = scope.interval();
        scope.setLoop(!scope.loop);
        if (playing) {
            audio.pause();
            void audio.play({ start: region.start, end: region.end, loop: scope.loop,
                gap: scope.view === 'focus' ? .36 : .62, cue: false }).catch(e => error('Loop failed: ' + e.message));
        }
        updateReceiverControls();
    }
    showMode('quiet');
    function update() {
        const d = duration(), p = d ? Math.min(1, audio.currentTime / d) : 0;
        $('listenCurrent').textContent = clock(audio.currentTime);
        $('listenDuration').textContent = clock(d);
        $('listenSeek').value = String(Math.round(p * 1000));
        $('listenTraceLight').style.left = `${p * 100}%`;
        $('listenPlay').textContent = audio.paused ? '▶' : 'Ⅱ';
        $('listenPlay').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
        updateReceiverControls();
    }
    function animateFirefly(now) {
        const light = $('listenTraceLight');
        const activePlayback = !audio.paused;
        const intensity = (0, signal_envelope_js_1.signalEnvelope)(audio.visualPosition, tones, audio.isMorseAudible);
        const breathing = .5 + .5 * Math.sin(now * .00175);
        // The ambient pulse continues at rest. During playback, only measured tones
        // create a strong flare; there is no independent blinking animation.
        const glow = activePlayback ? intensity : .19 + .12 * breathing;
        light.style.setProperty('--firefly-glow', glow.toFixed(3));
        light.style.setProperty('--firefly-scale', (1 + .25 * glow).toFixed(3));
        light.style.boxShadow = activePlayback ? `0 0 ${4 + 22 * glow}px ${1 + 9 * glow}px rgba(247,224,169,${(.12 + .70 * glow).toFixed(3)}), 0 0 ${9 + 55 * glow}px ${2 + 18 * glow}px rgba(211,192,126,${(.05 + .32 * glow).toFixed(3)})` : `0 0 ${9 + 17 * glow}px ${2 + 9 * glow}px rgba(247,224,169,.74), 0 0 ${25 + 48 * glow}px ${8 + 17 * glow}px rgba(211,192,126,.32)`;
        fireflyFrame = requestAnimationFrame(animateFirefly);
    }
    fireflyFrame = requestAnimationFrame(animateFirefly);
    function animate() {
        update();
        const completion = audio.loopCompletionAge;
        $('receiverLoop').style.setProperty('--loop-return', completion >= 0 ? String(Math.max(0, 1 - completion / .5)) : '0');
        if (!audio.paused)
            raf = requestAnimationFrame(animate);
    }
    function stopAnimation() { cancelAnimationFrame(raf); $('receiverLoop').style.setProperty('--loop-return', '0'); update(); }
    audio.addEventListener('play', () => { cancelAnimationFrame(raf); animate(); });
    audio.addEventListener('pause', stopAnimation);
    audio.addEventListener('seeked', update);
    audio.addEventListener('loadedmetadata', () => { if (loaded && scope.duration === 0)
        scope.duration = duration(); update(); });
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('ended', () => { stopAnimation(); selectionArmed = true; });
    audio.addEventListener('error', () => error('The audio could not be played. Try a PCM WAV recording.'));
    async function saveNotes() { if (!recordId)
        return; const notes = $('listenNotesText').value; if (notes === lastNotes)
        return; lastNotes = notes; try {
        await (0, library_js_1.putMessage)({ id: recordId, notes });
        notify();
    }
    catch (e) {
        error('Could not save notes: ' + e.message);
    } }
    async function load(blob, name, { id = null, persist = true, notes = null, meta = null } = {}) {
        if (!(blob instanceof Blob)) {
            error('No playable audio was provided.');
            return;
        }
        const token = ++loading;
        loaded = false;
        words = [];
        tones = [];
        scope.reset([], 0);
        renderer.configure([], []);
        audio.pause();
        updateModeControls();
        error('');
        try {
            await audio.load(blob);
        }
        catch (e) {
            loaded = false;
            error('Could not decode WAV: ' + e.message);
            return;
        }
        if (token !== loading)
            return;
        recordId = id || (0, library_js_1.messageId)();
        loaded = true;
        $('listenName').textContent = name || 'Received message';
        $('listenMeta').textContent = 'WAV · saved locally';
        $('listenEmpty').hidden = true;
        $('listenStage').classList.add('has-audio');
        $('listenNotesText').value = notes ?? '';
        lastNotes = $('listenNotesText').value;
        notesCaret = 0;
        notesEnd = 0;
        requestAnimationFrame(drawNotesCaret);
        update();
        if (persist) {
            try {
                await (0, library_js_1.putMessage)({ id: recordId, kind: 'received', title: name || 'Received message', audio: blob, notes: lastNotes, ...(meta ? { morseMeta: meta } : {}) });
                notify();
            }
            catch (e) {
                error('Recording opened, but library saving failed: ' + e.message);
            }
        }
        if (token !== loading)
            return;
        try {
            let analysis;
            if (meta?.chars?.length && meta.wpm) {
                analysis = (0, clean_morse_js_1.exactAnalysis)(meta.chars, meta.wpm, duration());
            }
            else {
                const buffer = audio.buffer, mono = new Float32Array(buffer.length);
                for (let c = 0; c < buffer.numberOfChannels; c++) {
                    const data = buffer.getChannelData(c);
                    for (let i = 0; i < mono.length; i++)
                        mono[i] += data[i] / buffer.numberOfChannels;
                }
                analysis = (0, signal_analysis_js_1.detectSignal)(mono, buffer.sampleRate, buffer.duration);
            }
            if (token === loading) {
                words = analysis.words || [];
                tones = analysis.tones || [];
                scope.reset(words, Math.max(duration(), words.at(-1)?.end || 0));
                renderer.configure(words, tones);
                scope.setGroups(renderer.layout.groups);
                selectionArmed = false;
                audio.setMorseEvents(tones, { pitch: meta?.pitch || 600, profile: meta?.soundProfile || 'classic' });
                if (meta?.chars?.length) {
                    try {
                        await audio.setMode('clean');
                    }
                    catch (e) {
                        console.warn('Clean synthesis unavailable', e);
                    }
                }
                updateModeControls();
                updateReceiverControls();
                living.configure({ position: () => audio.visualPosition, duration: () => duration(), playing: () => audio.isMorseAudible, events: tones });
            }
        }
        catch (e) {
            if (token === loading) {
                words = [];
                tones = [];
                scope.reset([], duration());
                renderer.configure([], []);
                updateModeControls();
                updateReceiverControls();
                console.warn('Word detection unavailable', e);
                error('Word detection unavailable; full recording playback remains available.');
            }
        }
    }
    // Native Android VIEW/SEND intents arrive through the same WAV loading pathway as file-picker imports.
    window.morseOpenAndroidWav = async function (base64, name) {
        try {
            const binary = atob(base64), bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++)
                bytes[i] = binary.charCodeAt(i);
            document.querySelector('[data-workspace="listen"]')?.click();
            await load(new Blob([bytes], { type: 'audio/wav' }), name || 'Received message.wav');
        }
        catch (e) {
            error('Unable to open shared WAV: ' + e.message);
        }
    };
    document.dispatchEvent(new Event('morse:android-import-ready'));
    for (const id of ['listenFile', 'listenFileEmpty'])
        $(id).addEventListener('change', async (e) => { const file = e.target.files?.[0]; if (file)
            await load(file, file.name); e.target.value = ''; });
    $('listenFromCompose').addEventListener('click', () => {
        let answered = false;
        document.dispatchEvent(new CustomEvent('morse:request-export', { detail: { accept: async (blob, meta) => { answered = true; await load(blob, meta?.title || 'Composed message', { meta }); }, reject: reason => { answered = true; error(String(reason)); } } }));
        if (!answered)
            error('Compose is not ready. Create a message first or open a WAV.');
    });
    $('listenPlay').addEventListener('click', () => void togglePlayback());
    $('listenBack').addEventListener('click', () => { if (loaded)
        seekTo(Math.max(scope.interval().start, audio.currentTime - 3)); });
    $('listenLoop').addEventListener('click', toggleLoop);
    $('listenSeek').addEventListener('input', e => { if (duration())
        seekTo(duration() * Number(e.target.value) / 1000); });
    const speed = $('listenSpeedFine');
    async function setSpeed(v) {
        const n = Math.max(.5, Math.min(2, Number(v) || 1));
        if (!loaded) {
            audio.rate = n;
            speed.value = String(n);
            $('listenSpeedLabel').textContent = `${n}×`;
            updateReceiverControls();
            return;
        }
        $('listenSpeedLabel').textContent = `Preparing ${n}×…`;
        try {
            await audio.setSpeed(n);
            error('');
        }
        catch (e) {
            error('Speed change failed: ' + e.message);
            console.warn(e);
        }
        speed.value = String(audio.playbackRate);
        $('listenSpeedLabel').textContent = `${Number(audio.playbackRate.toFixed(2))}×`;
        document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === audio.playbackRate)));
        updateReceiverControls();
    }
    function updateModeControls() {
        for (const b of document.querySelectorAll('[data-audio-mode]')) {
            b.disabled = b.dataset.audioMode === 'clean' && !tones.length;
            b.setAttribute('aria-pressed', String(b.dataset.audioMode === audio.mode));
        }
    }
    async function setAudioMode(mode) {
        if (!loaded)
            return;
        error('');
        try {
            await audio.setMode(mode);
            updateModeControls();
            updateReceiverControls();
        }
        catch (e) {
            error('Audio mode unavailable: ' + e.message);
        }
    }
    document.querySelectorAll('[data-audio-mode]').forEach(b => b.addEventListener('click', () => void setAudioMode(b.dataset.audioMode)));
    $('listenFineToggle').addEventListener('click', () => { const visible = speed.hidden; speed.hidden = !visible; $('listenFineToggle').setAttribute('aria-expanded', String(visible)); });
    speed.hidden = true;
    speed.addEventListener('change', () => void setSpeed(speed.value));
    document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => void setSpeed(b.dataset.speed)));
    speed.value = '1';
    $('listenSpeedLabel').textContent = '1×';
    updateModeControls();
    $('listenSoundToggle').addEventListener('click', () => { const p = $('listenSoundPanel'); p.hidden = !p.hidden; $('listenSoundToggle').setAttribute('aria-expanded', String(!p.hidden)); });
    $('listenVolume').addEventListener('input', e => audio.volume = Number(e.target.value) / 100);
    const noteArea = $('listenNotesText'), noteKeys = $('listenNotesKeys');
    const touchCaret = $('notesTouchCaret');
    function notesCaretPosition(index) {
        const text = noteArea.value.slice(0, index), style = getComputedStyle(noteArea);
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        ctx.font = style.font;
        const padLeft = parseFloat(style.paddingLeft) || 0, padTop = parseFloat(style.paddingTop) || 0;
        const available = Math.max(40, noteArea.clientWidth - padLeft - (parseFloat(style.paddingRight) || 0));
        let line = 0, width = 0;
        for (const ch of text) {
            if (ch === '\n') {
                line++;
                width = 0;
                continue;
            }
            const w = ctx.measureText(ch).width;
            if (width + w > available && width > 0) {
                line++;
                width = 0;
            }
            width += w;
        }
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35;
        return { x: padLeft + width, y: padTop + line * lineHeight - noteArea.scrollTop };
    }
    function drawNotesCaret() {
        const pos = notesCaretPosition(notesCaret);
        touchCaret.style.left = `${Math.max(6, Math.min(noteArea.clientWidth - 10, pos.x))}px`;
        touchCaret.style.top = `${Math.max(4, Math.min(noteArea.clientHeight - 20, pos.y))}px`;
        touchCaret.setAttribute('aria-valuemax', String(noteArea.value.length));
        touchCaret.setAttribute('aria-valuenow', String(notesCaret));
    }
    function moveNotesCaret(delta) {
        notesCaret = Math.max(0, Math.min(noteArea.value.length, notesCaret + delta));
        notesEnd = notesCaret;
        noteArea.setSelectionRange(notesCaret, notesCaret);
        drawNotesCaret();
    }
    function pointToCaret(x, y) {
        const style = getComputedStyle(noteArea), padLeft = parseFloat(style.paddingLeft) || 0;
        const padTop = parseFloat(style.paddingTop) || 0;
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35;
        const line = Math.max(0, Math.round((y + noteArea.scrollTop - padTop) / lineHeight));
        const lines = noteArea.value.split('\n');
        let offset = 0;
        for (let i = 0; i < Math.min(line, lines.length - 1); i++)
            offset += lines[i].length + 1;
        const value = lines[Math.min(line, lines.length - 1)] || '';
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        ctx.font = style.font;
        let width = 0, closest = 0, best = Infinity;
        for (let i = 0; i <= value.length; i++) {
            const d = Math.abs(width - (x - padLeft));
            if (d < best) {
                best = d;
                closest = i;
            }
            if (i < value.length)
                width += ctx.measureText(value[i]).width;
        }
        notesCaret = Math.min(noteArea.value.length, offset + closest);
        notesEnd = notesCaret;
        noteArea.setSelectionRange(notesCaret, notesCaret);
        drawNotesCaret();
    }
    touchCaret.addEventListener('pointerdown', event => { event.preventDefault(); touchCaret.setPointerCapture(event.pointerId); });
    touchCaret.addEventListener('pointermove', event => {
        if (!touchCaret.hasPointerCapture(event.pointerId))
            return;
        event.preventDefault();
        const r = noteArea.getBoundingClientRect();
        pointToCaret(event.clientX - r.left, event.clientY - r.top);
    });
    touchCaret.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            moveNotesCaret(event.key === 'ArrowLeft' ? -1 : 1);
        }
    });
    for (const [id, d] of [['notesCaretLeft', -1], ['notesCaretRight', 1]]) {
        const button = $(id);
        button.addEventListener('pointerdown', e => e.preventDefault());
        button.addEventListener('click', () => moveNotesCaret(d));
    }
    noteArea.addEventListener('scroll', drawNotesCaret);
    window.addEventListener('resize', drawNotesCaret);
    let notesCaret = 0, notesEnd = 0;
    function captureCaret() { notesCaret = noteArea.selectionStart; notesEnd = noteArea.selectionEnd; drawNotesCaret(); }
    function positionWriting() {
        if ($('listenNotesPanel').hidden)
            return;
        // Keep the instrument stationary; the Notes textarea owns its own scrolling.
        // On Android, VisualViewport reports the space left after the IME appears.
        if (document.body.classList.contains('native-notes-keyboard')) {
            const v = window.visualViewport;
            if (v)
                document.documentElement.style.setProperty('--tg-visual-height', `${Math.round(v.height)}px`);
        }
    }
    $('listenNotesToggle').addEventListener('click', () => {
        const panel = $('listenNotesPanel');
        panel.hidden = !panel.hidden;
        const opened = !panel.hidden;
        $('listenNotesToggle').setAttribute('aria-expanded', String(opened));
        $('listenView').classList.toggle('notes-open', opened);
        document.body.classList.toggle('notes-writing', opened);
        if (opened) {
            noteKeys.hidden = false;
            $('listenNotesKeyboard').setAttribute('aria-expanded', 'true');
            // No focus here: opening Notes must not summon the Android keyboard.
            requestAnimationFrame(positionWriting);
            requestAnimationFrame(drawNotesCaret);
        }
        else {
            noteArea.blur();
            document.body.classList.remove('native-notes-keyboard');
            document.documentElement.style.removeProperty('--tg-visual-height');
        }
    });
    noteArea.addEventListener('input', () => { captureCaret(); clearTimeout(notesTimer); notesTimer = setTimeout(() => void saveNotes(), 250); });
    for (const eventName of ['click', 'keyup', 'select'])
        noteArea.addEventListener(eventName, captureCaret);
    noteArea.addEventListener('focus', () => { document.body.classList.add('native-notes-keyboard'); if (mode === 'receiver')
        renderer.stop(); setTimeout(positionWriting, 180); setTimeout(positionWriting, 420); });
    noteArea.addEventListener('blur', () => { document.body.classList.remove('native-notes-keyboard'); document.documentElement.style.removeProperty('--tg-visual-height'); if (mode === 'receiver')
        renderer.start(); });
    window.visualViewport?.addEventListener('resize', positionWriting);
    $('listenNotesKeyboard').addEventListener('click', () => { noteKeys.hidden = !noteKeys.hidden; $('listenNotesKeyboard').textContent = noteKeys.hidden ? 'Show keys ⌃' : 'Hide keys ⌄'; $('listenNotesKeyboard').setAttribute('aria-expanded', String(!noteKeys.hidden)); });
    document.querySelectorAll('[data-note]').forEach(b => {
        b.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse')
            e.preventDefault(); });
        b.addEventListener('click', () => {
            const v = b.dataset.note, start = Math.min(notesCaret, noteArea.value.length), end = Math.min(notesEnd, noteArea.value.length);
            const insert = v === 'newline' ? '\n' : v === 'backspace' ? '' : v;
            const from = v === 'backspace' && start === end ? Math.max(0, start - 1) : start;
            noteArea.setRangeText(insert, from, end, 'end');
            captureCaret();
            noteArea.dispatchEvent(new Event('input', { bubbles: true }));
            // Do not focus the textarea; Morse keys must work without opening the native keyboard.
            b.classList.remove('pulse');
            void b.offsetWidth;
            b.classList.add('pulse');
            setTimeout(() => b.classList.remove('pulse'), 950);
        });
    });
    document.addEventListener('morse:library-open-audio', async (e) => { const entry = e.detail; const saved = entry.audio ? entry : await (0, library_js_1.getMessage)(entry.id); if (saved?.audio)
        await load(saved.audio, saved.title, { id: saved.id, persist: false, notes: saved.notes, meta: saved.morseMeta || ((saved.chars?.length && saved.wpm) ? { chars: saved.chars, wpm: saved.wpm, pitch: saved.pitch, soundProfile: saved.soundProfile } : null) }); });
    document.addEventListener('morse:workspace', e => { if (e.detail.name === 'compose') {
        audio.pause();
        renderer.stop();
        living.stop();
        void saveNotes();
    }
    else if (mode === 'receiver')
        renderer.start(); });
    window.addEventListener('pagehide', () => { cancelAnimationFrame(fireflyFrame); audio.pause(); renderer.stop(); void saveNotes(); });
    update();
    requestAnimationFrame(drawNotesCaret);
}

},
"js/listen/receiver-scope.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiverScope = void 0;
// The receiver owns exactly one selection and one loop preference. The HTMLAudioElement
// remains the only playback clock; this class has no timers or media dependencies.
class ReceiverScope {
    constructor() { this.reset([], 0); }
    reset(words, duration) {
        this.words = words.map((word, index) => ({ ...word, index }));
        this.duration = Math.max(0, Number(duration) || 0);
        this.view = this.words.length === 1 ? 'focus' : 'overview';
        this.selected = this.words.length === 1 ? 0 : -1;
        this.group = -1;
        this.queued = 0;
        this.loop = false;
        this.groups = [];
    }
    setGroups(groups) { this.groups = groups; }
    interval() {
        return this.selected >= 0 && this.view === 'focus'
            ? this.words[this.selected]
            : { start: 0, end: this.duration };
    }
    focus(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.words.length)
            return null;
        this.selected = index;
        this.queued = index;
        this.view = 'focus';
        return this.words[index].start;
    }
    enterGroup(index) {
        if (!this.groups[index])
            return null;
        this.group = index;
        this.selected = -1;
        this.view = 'group';
        return this.groups[index].start;
    }
    back() {
        if (this.words.length <= 1)
            return null;
        if (this.view === 'focus') {
            const last = this.selected;
            this.queued = Math.min(this.words.length - 1, last + 1);
            this.selected = -1;
            if (this.groups.length > 1) {
                const parent = this.groups.findIndex(group => last >= group.first && last < group.last);
                this.group = Math.max(0, parent);
                this.view = 'group';
            }
            else {
                this.group = -1;
                this.view = 'overview';
            }
            return this.words[last + 1]?.start ?? this.duration;
        }
        if (this.view === 'group') {
            this.view = 'overview';
            this.group = -1;
            return this.words[this.queued]?.start ?? this.duration;
        }
        return null;
    }
    overview() { this.view = this.words.length === 1 ? 'focus' : 'overview'; this.selected = this.words.length === 1 ? 0 : -1; this.group = -1; }
    neighbor(direction) {
        if (!this.words.length)
            return null;
        const from = this.view === 'focus' ? this.selected : this.queued;
        const next = Math.max(0, Math.min(this.words.length - 1, from + direction));
        if (this.view === 'focus')
            this.focus(next);
        else
            this.queued = next;
        return this.words[next].start;
    }
    setLoop(enabled) { this.loop = Boolean(enabled); return this.loop; }
    wordAt(time) {
        // In the inter-word silence the visual indicator rests, not guesses a word.
        let low = 0, high = this.words.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1, w = this.words[mid];
            if (time < w.start)
                high = mid - 1;
            else if (time >= w.end)
                low = mid + 1;
            else
                return mid;
        }
        return -1;
    }
}
exports.ReceiverScope = ReceiverScope;

},
"js/listen/signal-analysis.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectSignal = detectSignal;
exports.detectWordRegions = detectWordRegions;
exports.analyzeAudio = analyzeAudio;
// Deterministic envelope analysis. Silence boundaries are hypotheses for imported WAVs,
// not decoded text. Generated-message metadata can supersede them in a later release.
function detectSignal(samples, sampleRate, duration) {
    if (!samples?.length || !Number.isFinite(sampleRate) || sampleRate <= 0)
        return { words: [], tones: [] };
    const hop = Math.max(1, Math.round(sampleRate * .012));
    const energies = [];
    for (let i = 0; i < samples.length; i += hop) {
        let sum = 0, count = 0;
        for (let j = i; j < Math.min(samples.length, i + hop); j++) {
            sum += samples[j] * samples[j];
            count++;
        }
        energies.push(Math.sqrt(sum / Math.max(1, count)));
    }
    let peak = 0;
    for (const value of energies)
        if (value > peak)
            peak = value;
    if (peak < .0003)
        return { words: [], tones: [] };
    const threshold = Math.max(.0006, peak * .14);
    const active = energies.map(e => e >= threshold);
    // Bridge small envelope dips caused by waveform envelopes, not real Morse gaps.
    for (let i = 1; i < active.length - 1; i++)
        if (!active[i] && active[i - 1] && active[i + 1])
            active[i] = true;
    const runs = [];
    let start = -1;
    for (let i = 0; i <= active.length; i++) {
        if (i < active.length && active[i] && start < 0)
            start = i;
        if ((i === active.length || !active[i]) && start >= 0) {
            const end = i;
            if (end - start >= 2)
                runs.push({ start: start * hop / sampleRate, end: Math.min(duration, end * hop / sampleRate) });
            start = -1;
        }
    }
    if (!runs.length)
        return { words: [], tones: [] };
    const gaps = runs.slice(1).map((r, i) => r.start - runs[i].end).filter(g => g > .015).sort((a, b) => a - b);
    // Estimate Morse dot length from shorter measured tone durations and gaps.
    const durations = runs.map(r => r.end - r.start).filter(n => n > .025).sort((a, b) => a - b);
    const dot = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * .28))] : .08;
    // Morse word spacing is seven units. Do not inflate this threshold from the
    // shortest *observed* gap: a recording of single-element words may contain
    // no intra-letter or inter-letter gaps at all.
    const wordThreshold = Math.max(.15, Math.min(1.5, dot * 4.6));
    const words = [];
    let first = runs[0].start;
    for (let i = 1; i < runs.length; i++) {
        if (runs[i].start - runs[i - 1].end >= wordThreshold) {
            words.push({ start: first, end: runs[i - 1].end });
            first = runs[i].start;
        }
    }
    words.push({ start: first, end: runs[runs.length - 1].end });
    return { tones: runs, words: words.filter(r => r.end - r.start > .025).map((r, i) => ({ ...r, id: `word-${i + 1}`, label: `Passage ${i + 1}`, confidence: 'inferred' })) };
}
function detectWordRegions(samples, sampleRate, duration) { return detectSignal(samples, sampleRate, duration).words; }
async function analyzeAudio(blob) {
    const bytes = await blob.arrayBuffer();
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType)
        return [];
    const context = new AudioContextType();
    try {
        const buffer = await context.decodeAudioData(bytes);
        const channels = buffer.numberOfChannels, length = buffer.length;
        const samples = new Float32Array(length);
        for (let c = 0; c < channels; c++) {
            const data = buffer.getChannelData(c);
            for (let i = 0; i < length; i++)
                samples[i] += data[i] / channels;
        }
        return detectSignal(samples, buffer.sampleRate, buffer.duration);
    }
    finally {
        await context.close().catch(() => { });
    }
}

},
"js/listen/signal-envelope.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VISUAL_AUDIO_LAG_SECONDS = void 0;
exports.signalEnvelope = signalEnvelope;
exports.audiblePosition = audiblePosition;
// Evaluate the actual measured tone intervals at the authoritative audio position.
// The short ramps prevent clicks in the light while keeping silence unilluminated.
function signalEnvelope(position, tones, playing, attack = .018, release = .035) {
    if (!playing || !Number.isFinite(position) || !tones?.length)
        return 0;
    let low = 0, high = tones.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1, tone = tones[mid];
        if (position < tone.start)
            high = mid - 1;
        else if (position >= tone.end)
            low = mid + 1;
        else
            return Math.max(0, Math.min(1, (position - tone.start) / attack, (tone.end - position) / release));
    }
    return 0;
}
// The transport already reports output-timeline-adjusted position. Applying a
// second fixed delay causes false timing near short dits.
exports.VISUAL_AUDIO_LAG_SECONDS = 0;
function audiblePosition(outputTime) { return Math.max(0, outputTime); }

},
"js/navigation.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initNavigation = initNavigation;
// Workspace navigation is independent of audio initialization.
// Both workspaces remain mounted so switching preserves their state.
function initNavigation() {
    const compose = document.getElementById('composeView');
    const listen = document.getElementById('listenView');
    const buttons = [...document.querySelectorAll('[data-workspace]')];
    if (!compose || !listen || buttons.length === 0) {
        throw new Error('Workspace navigation elements are missing.');
    }
    function show(name) {
        if (name !== 'compose' && name !== 'listen')
            return;
        compose.hidden = name !== 'compose';
        listen.hidden = name !== 'listen';
        for (const button of buttons) {
            const active = button.dataset.workspace === name;
            button.setAttribute('aria-selected', String(active));
            button.classList.toggle('active', active);
        }
        document.dispatchEvent(new CustomEvent('morse:workspace', { detail: { name } }));
    }
    for (const button of buttons) {
        button.addEventListener('click', () => show(button.dataset.workspace));
    }
    show('compose');
}

},
"js/storage/event-log.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSessions = loadSessions;
exports.saveSession = saveSession;
exports.loadProfile = loadProfile;
exports.saveProfile = saveProfile;
exports.loadHistory = loadHistory;
exports.archiveMessage = archiveMessage;
exports.clearLearningData = clearLearningData;
const KEY = 'morse-composer-v03-events';
const PROFILE = 'morse-composer-v03-profile';
const HISTORY = 'morse-composer-v03-history';
const MAX_SESSIONS = 30;
const MAX_EVENTS = 1500;
function read(key, fallback) { try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
}
catch {
    return fallback;
} }
function write(key, value) { try {
    localStorage.setItem(key, JSON.stringify(value));
}
catch { } }
function loadSessions() { return read(KEY, []); }
function saveSession(session) {
    const sessions = loadSessions().filter(s => s.id !== session.id);
    if (session.events.length)
        sessions.push({ ...session, events: session.events.slice(-MAX_EVENTS) });
    write(KEY, sessions.slice(-MAX_SESSIONS));
}
function loadProfile() { return read(PROFILE, null); }
function saveProfile(profile) { write(PROFILE, profile); }
function loadHistory() { return read(HISTORY, []); }
function archiveMessage(chars) {
    if (!chars.length)
        return;
    write(HISTORY, [{ date: new Date().toISOString(), chars }, ...loadHistory()].slice(0, 40));
}
function clearLearningData() { try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(PROFILE);
}
catch { } }

},
"js/storage/library.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMessage = exports.getMessage = exports.listMessages = void 0;
exports.openLibrary = openLibrary;
exports.putMessage = putMessage;
exports.messageId = messageId;
exports.renameMessage = renameMessage;
// The library stores WAV bytes and their notes together, locally in IndexedDB.
const DB_NAME = 'morse-composer-library';
const STORE = 'messages';
function openLibrary() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE))
            db.createObjectStore(STORE, { keyPath: 'id' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function transact(mode, action) {
    const db = await openLibrary();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode), store = tx.objectStore(STORE);
        let result;
        try {
            result = action(store);
        }
        catch (error) {
            db.close();
            reject(error);
            return;
        }
        tx.oncomplete = () => { db.close(); resolve(result?.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
    });
}
const listMessages = async () => { const rows = await transact('readonly', s => s.getAll()); return rows.sort((a, b) => b.updatedAt - a.updatedAt); };
exports.listMessages = listMessages;
const getMessage = id => transact('readonly', s => s.get(id));
exports.getMessage = getMessage;
const deleteMessage = id => transact('readwrite', s => s.delete(id));
exports.deleteMessage = deleteMessage;
async function putMessage(entry) {
    const old = await (0, exports.getMessage)(entry.id);
    const now = Date.now();
    return transact('readwrite', s => s.put({ ...old, ...entry, createdAt: old?.createdAt || now, updatedAt: now }));
}
function messageId() { return crypto.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
async function renameMessage(id, title) { const clean = String(title).trim().slice(0, 120); if (!clean)
    throw new Error("A title is required."); const existing = await (0, exports.getMessage)(id); if (!existing)
    throw new Error("Message not found."); await putMessage({ id, title: clean, titleMode: 'manual' }); return clean; }

},
"js/storage/storage.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaults = exports.DRAFT_KEY = exports.KEY = void 0;
exports.load = load;
exports.loadDraft = loadDraft;
exports.save = save;
exports.KEY = 'morse-composer-v21';
exports.DRAFT_KEY = 'morse-composer-v21-draft';
exports.defaults = { chars: [], pitch: 600, soundProfile: 'classic', speed: 15, volume: 40, sendBand: 'comfortable', autoTempo: true, guidance: 'gentle', showDecoded: true };
function load() {
    try {
        const old = JSON.parse(localStorage.getItem(exports.KEY) || '{}');
        // Opening always starts clean. The last composition is a recoverable draft.
        return { ...exports.defaults, ...old, chars: [] };
    }
    catch {
        return { ...exports.defaults };
    }
}
function loadDraft() { try {
    const value = JSON.parse(localStorage.getItem(exports.DRAFT_KEY) || '[]');
    return Array.isArray(value) ? value : [];
}
catch {
    return [];
} }
function save(state) { try {
    const { chars, ...settings } = state;
    localStorage.setItem(exports.KEY, JSON.stringify(settings));
    localStorage.setItem(exports.DRAFT_KEY, JSON.stringify(chars));
}
catch { } }

},
"js/workspace-shell.js":function(module,exports,require){
// Navigation is independent of the Compose and Listen modules.
(function () {
    const views = { compose: document.getElementById('composeView'), listen: document.getElementById('listenView') };
    const tabs = [...document.querySelectorAll('[data-workspace]')];
    function open(name) {
        if (!views[name])
            return;
        for (const [id, view] of Object.entries(views)) {
            view.hidden = id !== name;
            view.setAttribute('aria-hidden', String(id !== name));
        }
        for (const tab of tabs) {
            const active = tab.dataset.workspace === name;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        }
        document.dispatchEvent(new CustomEvent('morse:workspace', { detail: { name } }));
    }
    for (const tab of tabs)
        tab.addEventListener('click', () => open(tab.dataset.workspace));
    window.MorseWorkspace = Object.freeze({ open });
    open('compose');
})();

},
};
const cache=Object.create(null);
function resolve(from,requested){const a=from.split("/");a.pop();for(const p of requested.split("/")){if(p==="..")a.pop();else if(p!=="."&&p)a.push(p);}return a.join("/");}
function load(id){if(cache[id])return cache[id].exports;const factory=modules[id];if(!factory)throw new Error("Missing module "+id);const module={exports:{}};cache[id]=module;factory(module,module.exports,requested=>load(resolve(id,requested)));return module.exports;}
try{load("js/app.js");}catch(e){console.error(e);const el=document.getElementById("listenError");if(el)el.textContent="Application startup failed: "+e.message;}
})();