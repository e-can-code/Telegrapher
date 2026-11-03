# Morse Composer — Foundation 0.1

A deliberately reduced working baseline: Compose, Quiet listening, and correspondence Library. Signal and Detail are removed from the runtime. The original Compose visual instrument and Morse input are retained.

## Start
Run `python -m http.server 8000` in this directory, then open http://localhost:8000.

## Workflows
1. Compose a short message. Share audio downloads a WAV; From Compose opens the same generated WAV in Quiet.
2. Listen opens independently, including with an empty composition. Open WAV loads and locally saves a recording.
3. Library lists received recordings and composed drafts. Selecting an audio entry opens it in Quiet. Notes are saved with the recording ID.
4. Quiet provides one Play/Pause, seeking firefly, rewind, loop, speed, volume, and notes.

## Scope
This version intentionally removes Signal, Detail, structural selections, alternate listening voices, and the lens switch. The Compose visual design and input logic are retained. No backend or external services are required. Audio and Library data stay in the browser's IndexedDB.

## Verification
Run `npm test`. Browser playback and Android touch still require real-device verification; no release should be called stable until those workflows pass.
