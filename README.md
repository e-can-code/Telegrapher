# Telegrapher 2.5 — Receiver web compatibility hotfix

This edition restores the complete **Receiver** to the web distribution while preserving Compose message naming, Quiet, Notes, Library, the Living Metal Armillary and the sound engine introduced in 2.2.

## Running the web app

Extract the entire `Telegrapher_wv2.5.zip`. Keep `index.html`, `js/`, and `styles/` together.

- **Quick preview:** Open `index.html` in a desktop browser. The release now uses a prebuilt classic browser script, so its main controls and Receiver no longer depend on loading ES modules over `file://`. Some browsers restrict local persistent storage; use HTTP for reliable Library functionality.
- **Recommended local use:** From the extracted directory run `python -m http.server 8000`, then open `http://localhost:8000`.
- **GitHub Pages:** Copy the **contents** of the extracted web ZIP into the repository's Pages publishing root. `index.html` belongs directly at that root, not inside another version-named folder. All asset URLs are relative.

The distributed website requires **no build step**. `js/telegrapher-bundle.js` is the browser entry point, compiled from the existing `js/` application modules. The original source modules remain in the archive for diagnostics and continued development. Do not replace the bundle with `js/app.js` in the distributed HTML: native ES modules may not load from local file URLs.

The service worker now uses cache `telegrapher-v2.5` and pre-caches the new browser bundle. After replacing an older GitHub Pages version, refresh the page to receive the updated files. **Do not delete site data or IndexedDB to fix a cache issue**; the Library is local to that storage.

## Compose naming

The optional **Name this message** field becomes the Library title and shared WAV filename. A blank field preserves automatic naming. The title travels from Compose to Listen; clearing the composition clears its name. Message naming and the WAV renderer are unchanged from 2.3.

## Listen and Receiver

Open a WAV in Quiet (or choose From Compose) and then select Receiver. The ordered, numbered word instruments should appear. Tap a word to focus; double-tap empty space to return. Previous, Play/Pause, Loop, Next, Notes, Original/Clean sound selection, and speed controls remain available. Imported word boundaries are estimated from tone and silence; noisy recordings can be imperfectly segmented.

A quiet mechanical start cue is **audio-only**. The firefly and Receiver lights illuminate only Morse tones, never the cue. For speed adjustments, Original WAV uses buffered time-stretch; Clean Morse uses reconstructed events. At different rates the Clean mode preserves the selected pitch and Morse timing relationships.

## Android Studio edition

`Telegrapher_v2.5.zip` contains the Android Studio project, with application ID `org.morsecomposer.foundation`, version name `2.5` and version code `24`. Extract and open in Android Studio, then use **Build > Build APK(s)**. To update without uninstalling and losing local storage, sign the APK with the same signing key as the installed app. Android retains the ES-module startup that was already functioning; it uses the same application source as the web edition.

## Verification and limits

Run `node --test tests/*.test.js` to validate application logic. The bundled browser startup has been exercised in Chromium using an inlined fixture at phone and desktop sizes, including importing a five-word WAV into Receiver. The build environment blocks normal browser navigation to localhost and local file URLs, so **actual Firefox, GitHub Pages, file:// and Android installation still require user testing**. See `RELEASE_NOTES.md` and `in_next.txt`.

## Receiver 2.5 controls

The left circular transport control restarts the current word. The right control selects and plays the next word; it is inactive on the last word. The Loop control remains independent. At each loop completion a short visual acknowledgement appears around the outer Armillary and Loop control, not in the Morse light.
