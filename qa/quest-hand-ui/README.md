# Quest hand/UI release

This release publishes the exact build from reviewed source commit 7bf720e6b3b805c80fe082cfd65c1e1ac8e0d366. It adds fingertip contact for world-space buttons, respects hand/UI depth, accepts Meta's emulated hand ray, and limits visual retention to two missed samples or 50 ms. Invalid grip tracking cancels interaction immediately. Existing pinch and controller input remain.

The user approved publication. Actual Quest touch, flicker and tracking remain user-tested acceptance items; no headset success is claimed. Performance tuning is outside this release.

## Identity and reproduction

Root index.html and candidate.html are identical: SHA256 0fc797800189e78e628cf81adf1f261b92ccae6656890e13a785de8803927e90, 8497864 bytes. The previous release 6c3957c2555dc8f4956ac534174eeea63d399a68 is preserved in Git and in the existing priority-feedback kit. Shrine, licenses and earlier candidates are unchanged.

Extract the source archive identified in release-checkpoint.json, apply the existing priority-feedback source overlay first, then apply this directory's source-overlay and qa-overlay. With the pinned dependencies, run:

```text
npm ci --ignore-scripts
node build.cjs
node qa/xr-village/run-checks.mjs
```

The build must match the hash above. evidence/native-summary.json records passing production-callback/Rapier checks in non-rendering mocked DOM/WebXR; evidence/hand-ui.json records the nine focused hand/UI groups. The existing four-case ordinary-input and four-scope browser acceptance workflows run against the exact new release bytes before merge. GitHub Pages and the public witness verify deployment separately.

## Quest retest

Exit the old XR session and reload the public page. Try hands before entry, then controllers-to-hands in-session. Touch PLAY / DONE, press pause/resume, hold contact to ensure no repeats, withdraw and press again, and try point-and-pinch. Switch back to controllers and exit/re-enter. Report remaining flicker, failed buttons, or hands drawing behind nearer UI. Read input diagnostics through SETTLEMENTQA.context.villageXR.state() when an authorized device connection is available.
