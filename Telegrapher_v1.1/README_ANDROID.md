# Morse Composer — Foundation 0.1 (Android source)

This is an Android Studio project wrapping the existing Foundation 0.1 web app. The web assets are bundled and served through a local HTTPS-like WebView origin. No internet connection is required.

## Build an APK
1. Open this directory in Android Studio (with Android SDK 35 and JDK 17).
2. Let Gradle sync (requires downloading the Android Gradle plugin on first use).
3. Build > Build Bundle(s) / APK(s) > Build APK(s).
4. Find `app/build/outputs/apk/debug/app-debug.apk` and install on an Android phone.

Or with a working Android SDK and Gradle: `gradle assembleDebug`.

## Current limitations
- This environment has no Android SDK/Gradle, so the APK has not been compiled or installed. This is a buildable source project, **not a verified APK**.
- WAV import uses Android's system file picker. WAV export uses the Android bridge to save to Downloads/MorseComposer on Android 10+.
- Incoming WAV share/view intents are not yet wired to the app's import handler. Use Open WAV inside Listen.
- IndexedDB persists inside the app's WebView data directory, separate from Firefox/Chrome browser storage.
- Real-device checks are required for audio latency, touch, WAV import/export, Library, Notes, and back navigation.
- No Play Store release signing is configured.

## Acceptance tests
1. Launch offline; Compose and Listen both open.
2. Compose a message; export WAV; verify the WAV in Downloads/MorseComposer.
3. From Compose loads the same audio into Listen; Play works.
4. Open WAV from Android file picker; playback and speed control work.
5. Save a recording and notes in Library, restart app, reopen them.
6. Android Back closes dialogs without discarding the recording.
