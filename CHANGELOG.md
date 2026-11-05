# Telegrapher 2.3.1 — Web Receiver restoration

## Fixed
- Replaced the web edition's native ES-module entry point with a prebuilt classic JavaScript bundle generated from the same canonical modules. This avoids browser `file://` module-loading failures and reduces sensitivity to partial module caching.
- Included the complete browser bundle in the versioned offline resource list (`telegrapher-v2.3.1`).
- Added a visible startup error if the bundle itself is missing, rather than silently presenting a nonfunctional page.
- Updated the browser title to match the distributed release.

## Preserved
- Compose optional message names, Library title persistence and named WAV exports introduced in 2.3.
- Receiver's ordered word rail, focused Living Metal Armillary, source selection, looping, playback speed, Notes, and Room navigation.
- Quiet's firefly, Compose's Gathering Light, the Brass Helmsman, native Android file handling and existing audio engine.

## Platform difference
- The web edition starts from `js/telegrapher-bundle.js` (classic script); the Android WebView edition retains its existing working ES-module entry point. The underlying application source files remain identical.
- Android project version name `2.3.1`, version code `24`; application ID unchanged.

This is a compatibility hotfix rather than a change to audio synthesis or visual design.
