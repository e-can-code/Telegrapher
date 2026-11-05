# Telegrapher 2.3.1 — Receiver Compatibility Hotfix

The previous 2.3 web ZIP included the Receiver but depended on native ES-module imports, which may not load from a locally opened HTML file in some desktop browsers. The new web package includes a prebuilt standalone classic-script entry point. No web build step is needed.

**Test first:** Extract the complete web archive and open `index.html`. Select Listen → Receiver. An empty recording should show instructions; after importing a WAV in Quiet, Receiver should show numbered word armillaries. Try focusing Word 2 and returning to the overview. For persistent Library testing, serve over HTTP or publish to GitHub Pages.

**Browser checks performed:** Built web script passes syntax validation; Chromium using an inlined application fixture displayed Receiver without a WAV and with a five-word WAV at mobile and desktop viewport sizes. Source test suite passes. Direct browser navigation to a real local or deployed URL is restricted in the build environment; Firefox, GitHub Pages cache upgrades and Android hardware remain unverified.

**Android:** Version code 24; no functionality changes beyond shared release metadata. Previous Android Receiver behavior is retained. Rebuild APK in Android Studio and sign with the matching update certificate.
