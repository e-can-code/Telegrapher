# Signal reliability rebuild — development build

The Signal instrument now uses `SignalTransport` as its only audio-clock authority. It plays decoded WAV data through Web Audio `AudioBufferSourceNode` with native loopStart/loopEnd boundaries. `SignalSelectionModel` owns a single active time interval. The existing Phosphor renderer reads transport time and does not issue playback commands.

Quiet and Detail continue using the existing native HTML audio player. Entering Signal pauses the native player; leaving Signal pauses Web Audio and transfers the time position back. This isolates the new transport while preserving existing listening functionality.

Limitations: Web Audio playback-rate changes pitch. Short loops may click at abrupt waveform boundaries. Native Web Audio source looping is sample-accurate at normal playback rate, but audible acceptance still requires real-browser testing. Gesture recognizer and structural inference remain the existing implementations pending dedicated Android verification.

Do not label this release stable until browser and Android acceptance tests pass.
