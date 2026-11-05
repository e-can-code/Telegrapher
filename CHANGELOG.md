# Telegrapher 2.2 — Sound Engine Stabilization

## Corrected

- Replaced independent playback-rate-driven listening with a single Web Audio buffer transport.
- Removed the fixed 65 ms visual offset as the authoritative light timing model.
- Kept the mechanical start cue audible, but excluded it from the Morse event map and illumination.
- Preserved resting firefly breathing and disabled it during all active playback, including lead-in and loop silence.
- Connected Quiet and Receiver illumination to the buffered transport's output-aware timeline.
- Introduced versioned web asset caching (`telegrapher-v2.2`) and a safer Receiver initialization failure message.

## Added

- Clean Morse resynthesis from exact Compose metadata or detected tone events, preserving pitch and proportionate silence at supported speeds.
- Buffered WSOLA time-stretch for the **original imported WAV**, preserving the recorded audio separately from the optional clean reconstruction.
- Explicit Original WAV / Clean Morse playback-mode controls.
- Compact Fine speed control and 0.5×–2× supported range.
- Output scheduling for single-word and whole-recording looping, including a playback-only gap.
- Audio pitch and event-boundary regression tests.

## Preserved

- Compose's WAV export, Gathering Light, input, haptics, and message editing.
- Quiet's visual design and Receiver's ordered word rail and Celestial Armillary.
- Notes and Library persistence, Android file intents, and navigation-bar clearance.

## Limitations

- The web Renderer was validated through an inlined local Chromium harness, not a deployed GitHub Pages session or Firefox runtime. Real deployment still requires verification.
- Original WAV time stretching remains approximate, especially on highly noisy/complex source audio; Clean Morse is an explicitly selectable alternative.
- Device output/display latency requires listening tests on physical Android hardware. A shared output timeline reduces onset mismatch but cannot eliminate hardware variability.
- No Android APK was compiled in this environment; the Android Studio project is supplied for local compilation.
