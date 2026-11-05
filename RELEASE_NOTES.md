# Telegrapher 1.3 — Release notes and device acceptance

## Release purpose
Mobile viewport ownership and stable transitions between listening and transcription. This release does not add Signal or Detail.

## Manual acceptance on Android
1. Open Compose: header, message, Gathering Light, Play and Share Audio are visible above the system navigation bar.
2. Compose HI, play it, confirm the strip returns to its first tile before playback; confirm WAV export still works.
3. Open Listen with no recording, then import a WAV. Confirm the firefly and all transport controls fit without scrolling.
4. Start playback, open Notes, and confirm the compact field does not overlap playback or the Brass Helmsman.
5. Confirm the audio does not pause, restart, seek, or change speed when Notes opens/closes.
6. Use Dit, Dah, Space and Backspace; the Android keyboard must remain closed.
7. Tap the writing surface: verify Play/Pause and Back 3 Seconds remain visible above the keyboard; text can scroll within Notes.
8. Close the keyboard, then Notes: expanded Quiet should return without overlap or unwanted scrolling.
9. Reopen the recording from Library; verify its notes persist across app restart.
10. Test on both a short and a tall Android viewport, including a phone with three-button navigation if available.

## Known verification gaps
Browser automation was attempted but blocked by the runtime. Android SDK and Gradle are unavailable here, so no APK was compiled. Real Android keyboard behavior remains unverified. The current build should be treated as a release candidate until the above tests pass.
