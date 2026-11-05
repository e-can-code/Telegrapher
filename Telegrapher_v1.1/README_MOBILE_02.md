# Foundation 0.2 — Android phone refinement

Reopen this Android Studio project and Build > Build APK(s). This preserves the original application ID and project signing configuration.

## Changes
- Compact one-row Library / From Compose / Open WAV actions.
- Removed Quiet eyebrow; compressed transport and speed controls.
- Quiet viewport uses remaining phone height when Notes is closed.
- Notes mode compresses the viewport, focuses the editor, and scrolls to expose it above the keyboard.
- Android ACTION_VIEW and ACTION_SEND WAV intents open Listen with the recording loaded and paused at 0.

## Test on device
1. Open Listen with no recording; verify controls and stage fit without scrolling in portrait.
2. Compose and use From Compose; listen and open Library.
3. Open a WAV from Android Files using Open with Morse Composer; verify Listen is active and playback is paused at start.
4. Share a WAV to Morse Composer; verify same behavior.
5. Open Notes with the keyboard visible; verify the writing area and playback controls remain reachable.
6. Test a short and a tall Android display, font scaling, and landscape.

## Limitations
- Imported WAVs must be RIFF/WAVE and at most 12 MB via Android intents.
- A real-device acceptance pass is required; JavaScript syntax checks alone cannot validate WebView, Android intents, or soft-keyboard resizing.
- On very short screens or large accessibility font sizes, scrolling may still be necessary to avoid clipping controls.
