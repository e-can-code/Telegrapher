# Morse Composer v0.7.0-dev.1 — Signal core stabilization

This is a development build, not the stable v0.7.0 release. It retains the v0.6.9 visual design and existing Compose, Quiet, Detail, Library and Notes features.

## What changed

- `js/listen/signal-transport.js`: Signal's playback is driven by the Web Audio clock and a single `AudioBufferSourceNode` at a time. The native source loop boundaries are used for short selections. Play, pause, resume, replay, speed, volume and seeking are exposed by one transport API.
- `js/listen/signal-selection-model.js`: validated time-based selection state, independent of zoom and canvas coordinates.
- `js/listen/listen-controller.js`: Signal uses the new transport and selection model. The existing HTMLAudioElement is retained for Quiet and Detail; switching views pauses the outgoing backend and transfers the position. The Phosphor renderer reads Signal transport time.
- `tests/listen/signal-core-v070.test.js`: state and transport tests with a deterministic mock audio clock.

## Known limitations / release blockers

- Real browser playback and Android gesture tests have not passed in this environment. The Chromium smoke attempt timed out. Test with real Firefox and Android before calling the release stable.
- Web Audio playback rate changes pitch; Quiet and Detail retain the browser's pitch-preserving media playback. A pitch-preserving time-stretch implementation is future work.
- Morse segmentation from arbitrary WAVs remains heuristic. Paragraph and sentence boundaries cannot be guaranteed without metadata.
- Existing touch gesture arbitration is inherited and requires further validation. No new visual effects were added.

## Manual acceptance checklist

1. Fresh storage: Listen opens without using Compose; import a WAV.
2. Signal: press Play with no selection; audio and luminous playhead advance.
3. Select phrase, word and letter; the playhead jumps to each region's start.
4. Press Play and hear only the selection. Pause and resume, then Replay.
5. Select a new region while playing; playback restarts at the new region.
6. Test short marks and looping; no unexpected spillover into neighbors.
7. Zoom in, out, Fit, double-tap and pinch; selection and playback remain unchanged.
8. Change volume and listening voice; verify playback responds.
9. Switch Quiet / Signal / Detail and back; confirm playback position and notes.
10. Repeat on Android hardware and desktop Firefox.

## Run

`python -m http.server 8000` then open `http://localhost:8000`.

## Tests

`npm test`
