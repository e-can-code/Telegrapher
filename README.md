# Telegrapher 2.2 — The Sound Engine

Telegrapher is a local-first Morse correspondence instrument. This edition stabilizes the web Receiver and listening audio without changing the approved Compose, Quiet, Notes, Library, and Celestial Receiver designs.

## Web edition

The `index.html` at the root is the application entry point. The distribution has no build step and uses relative asset paths. To run locally, extract the web ZIP, open a terminal in the extracted folder, then run:

```sh
python -m http.server 8000
```

Open `http://localhost:8000` in Firefox or Chromium. Do not double-click `index.html` to test persistent library storage: browsers restrict JavaScript modules and IndexedDB on local file URLs. For GitHub Pages, publish the **contents** of the web ZIP at the configured publishing root. A v2.2 service worker updates the older offline cache. On an upgraded installation, refresh the page after the new service worker activates if necessary. **Do not delete site storage or Library data** to force an update.

## Audio: Original WAV and Clean Morse

Open a recording in Quiet using **Open WAV**, **From Compose**, or Library. The audio-source selector offers:

- **Original WAV** (default for imports): the actual imported audio. At changed speeds, a buffered, pitch-preserving WSOLA time-stretch is applied. The source file is not modified. For unusual noisy recordings, listen critically: original-audio stretching is approximate and may retain artifacts.
- **Clean Morse** (available when tone intervals have been recognized): a newly synthesized signal based on measured dits, dahs, and silence. This is a *reconstruction*, never a replacement for the original WAV. For recordings sent directly from Compose with exact character metadata, Clean Morse is the default and follows exact composition events.

Speed settings from **0.5× to 2×** change the Morse pace, not the clean signal's pitch. The visible presets are 0.5×, 0.75×, 1×, and 1.25×. Press **Fine** to open the temporary fine-adjustment slider. The Receiver's compact speed button cycles through 0.5×, 0.75×, 1×, 1.25×, 1.5×, and 2×.

A quiet, deliberate **mechanical start cue remains enabled by default**. It is audio-only: the firefly and Receiver do not flare for the cue. It can be disabled via the existing `telegrapher-start-cue` local preference if needed. Morse begins after the cue's short audible decay.

## Playback and lighting

- Quiet, Receiver, and their controls share a single Web Audio listening transport.
- The transport owns the source position, region selection, speed, loop, and audio scheduling.
- The firefly breathes at rest. During active playback, the independently timed breathing stops and only detected Morse tone envelopes produce flares. Silence and the start cue do not.
- Receiver uses the same light timeline. The ordered word rail shows words chronologically; select one to focus its Living Metal Armillary, and double-tap empty space to return. Previous/Next, Replay, Loop and speed controls remain available.
- Loop gaps are scheduled in the audio output buffer and do not modify the imported recording or create a false visual Morse event.

Imported word boundaries are inferences from pauses. Do not treat them as automatic translations or guaranteed segmentation. If a recording cannot be decoded, the app should still make full-recording playback available.

## Android Studio edition

Extract the separately provided `Telegrapher_v2.2.zip` and open its Android project directory in Android Studio. After Gradle synchronization, use **Build > Build APK(s)**; the debug APK ordinarily appears in `app/build/outputs/apk/debug/`.

The application ID remains `org.morsecomposer.foundation`, version code is **22**, and the version name is `2.2`. To update an installed application without losing local data, sign the new APK with the same key used for the existing installation. Do not uninstall the old app as a workaround. Android's native file opening, file sharing, vibration, WebView, and system-bar handling remain in the thin Android wrapper.

## Verification

Run automated tests from the web directory with `node --test tests/*.test.js` (or `npm test`). The source and browser integration checks are documented in the release notes. Interactive Chromium tests used an inlined, otherwise identical application-module fixture because direct localhost/file navigation is restricted in the build environment. Thus a true GitHub Pages session, Firefox session, Android compilation and physical phone listening remain release acceptance checks, not claimed passes.

Read `CHANGELOG.md`, `RELEASE_NOTES.md`, and `in_next.txt` for the detailed change record and remaining risks.
