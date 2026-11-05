# Telegrapher 2.2 — Release candidate

**Main objective:** Make Morse audio and illumination behave as one predictable instrument. The mechanical cue remains audio-only; it never drives a Morse light flare.

Web: extract `Telegrapher_wv2.2.zip` and publish its contents, with `index.html` at the root. Android: extract `Telegrapher_v2.2.zip`, open in Android Studio, and build an APK. Source is matched across the two editions.

### Verification completed

- 50 automated JavaScript tests passed, including pitch preservation over 0.5×–2×, exact composition timing, original PCM immutability, and cue/light separation.
- Interactive Chromium test using a real five-word WAV: Receiver initialization, focus, Play/Pause, Clean Morse, 0.5× playback and sound-mode switching passed.
- Interactive Chromium test using a 36-word WAV: all 36 words detected, Word 30 selected, Loop state preserved, and 0.75× original-audio playback passed.
- A 600 Hz carrier stayed within 8 Hz at tested speed settings; actual playback pitch accuracy must also be checked by ear on devices.
- A five-word PCM example retained five detectable word regions and 36 tone events after WSOLA stretching at 0.5×, 0.75×, 1.25× and 2×.

### Still required

Firefox, actual deployed GitHub Pages behavior (including old offline caches), Android Studio build/installation, and physical-device audio/visual synchronization. The automated web tests use an inlined module harness due to restricted browser navigation in this build environment.

### Priorities for user testing

1. Update the deployed web files and verify Receiver displays normally, including after refresh.
2. Play a WAV from the start. Listen for the tiny mechanical cue, then confirm the first **Morse** flare occurs only when the actual Morse tone begins.
3. Compare 1×, 0.75× and 0.5× for both Original WAV and Clean Morse.
4. Loop Word 2, turn Loop off, and return to the whole message. Verify start/stop and visual timing.
5. Confirm Notes, Compose, Library and Android system navigation continue behaving as before.
