# Foundation 0.5 — Android Compose refinement

This edition is based on Foundation 0.4. It preserves the Compose instrument, input timing, editing, playback, sharing, Quiet, Notes, and Library.

Changes:
- Static adaptive launcher icon derived from the Gathering Light at its smallest resting sphere. Android automatically masks it to launcher shape. Legacy raster mipmaps are included.
- Shorter Play and Share audio controls on phone-width screens, with a 44px minimum touch target.
- Android WebView bottom padding responds to the system navigation inset.
- Version code 5, version name 0.5. Application ID unchanged.

Build: Open MorseComposerAndroid in Android Studio, sync Gradle, then Build APK(s).

Verify on device: icon in launcher; no bottom-bar overlap; Play and Share reachable; Compose input and audio unchanged; Listen/Library unaffected.

No APK compilation or physical-device validation was possible in the authoring environment.
