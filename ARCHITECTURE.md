# Morse Composer v0.5.4 architecture

- `js/workspace-shell.js`: standalone navigation. No dependency on either workspace, audio, or ES module initialization.
- `js/app.js`: independent error-isolated initialization of Listen and Compose.
- `js/compose/`: instrument, editing, illumination, WAV export.
- `js/listen/`: import, media player, seek firefly, selection, waveform and Star Horizon. Does not import Compose or Compose storage.
- `js/audio/`: standardized Morse WAV generation and Compose playback.
- `js/core/`: Morse interpretation, timing, and message representation.
- `js/storage/`: Compose drafts and event logs.

The optional bridge uses `morse:request-export` with callbacks to receive the WAV blob and `morse:compose-availability` to enable the shortcut. Listen never waits for Compose before becoming usable. The native WAV import is the primary workflow.

The Gathering Light and Awakening Rings remain unchanged.


### v0.5.5
Compose boundary placeholders are view-only DOM elements; message serialization remains unchanged. Fine speed is controlled by listen-controller and clamped by listening-speed.


## v0.6.0 state invariants
Listening lens state is owned by `listen-controller.js` and is not reset on workspace navigation. Library audio events pass stable entry IDs to avoid losing associated notes. Rename updates metadata only. `listenQuietScreen`, `signalPanel` and `horizonStudio` are mutually exclusive visual screens; Notes and sound settings remain shared.


## v0.6.1 — Detail instrument
Detail now has its own synchronized transport and silence-derived passage navigation, with letter, word, and approximate phrase levels. The selected passage can be replayed, extended by neighboring segments, or referenced in Notes. Quiet and Signal remain separate. The underlying source WAV and Compose are unchanged. Segmentation is an estimate, not authoritative decoding.

## v0.6.3 Phosphor Receiver
- `js/listen/phosphor-model.js`: pure viewport/zoom math and inferred timing hierarchy. No DOM or audio player dependencies.
- `js/listen/phosphor-renderer.js`: canvas rendering of tones, silences, optical hierarchy, selection, and playback cursor.
- `js/listen/listen-controller.js`: pointer/wheel/pinch interaction, contextual controls, and existing audio/notes integration.
- The waveform uses extracted audio intervals. Phrase boundaries are heuristic; word/letter boundaries are inferred from gaps.
- Signal is for navigation and examination, not automatic transcription. Detail remains the abstract visualization workspace.


### Signal v0.6.4
`phosphor-model.js` computes a conservative, non-authoritative phrase/word/letter hierarchy. `phosphor-renderer.js` draws measured audio energy at the current viewport, with inferred hierarchy behind it and a separate playback cursor. `listen-controller.js` owns the focus, selection, viewport, and playback states; the shared `ListeningPlayer` remains the sole audio transport. This separation protects Quiet, Compose, Detail, Notes, and Library.


## v0.6.5 state separation
Signal zoom history is a viewport concern, independent of selection and audio playback. The main transport clears segment-limited playback before playing the full recording. The audio player retains deferred seeks until metadata becomes available.


## v0.6.7 playback contract
`signalRange()` maps focus to an optional time interval. `syncSignalPlayback()` configures the single audio player, independent of `phosphorView`. `toggleSignalPlayback()` owns the Signal transport button. The contextual toolbar no longer owns a second transport.


## v0.6.8 control organization
Signal playback uses one native audio element; zoom only changes the viewport. The signal shelf contains all transport and magnification actions, while the file header is relocated into a bottom metadata row only in Signal mode. `signalLoopEnabled` controls looping independently from focus.
