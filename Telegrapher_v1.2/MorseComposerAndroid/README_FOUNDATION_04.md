# Foundation 0.4 — Compose touch polish

Two focused changes from Foundation 0.3:

1. Suppress Android WebView tap-highlight rectangles on the circular Morse key while preserving visible focus for keyboard users.
2. Move the existing `clearBtn` action from the More menu into the main Compose edit toolbar, between Space and Backspace. This uses the existing full-message clear handler, which archives the previous message and keeps Undo available.

No change to Compose input timing, Quiet, Notes, Library, WAV generation, or the Android native bridge.

Build: open `MorseComposerAndroid` in Android Studio; Build > Build APK(s).

Validation: source structure, JavaScript syntax and automated tests. Android touch behavior requires phone testing.
