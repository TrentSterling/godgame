# Archipelago integrated browser QA

Test-only snapshot of the integrated three-island village and facade pass. Final camera/control work is pending. Not a live release. Root index.html, .nojekyll and licenses are unchanged; do not merge this test-only PR.

Exact PR head and candidate SHA256 are checked before browser startup. Playwright 1.57.0 uses real mouse and keyboard input with read-only state/projection and the supplied manual simulation step. The input clock is stepped to preserve click and drag timing under software rendering. Idle renders use six samples/second and gestures sixty; native physics uses its normal 120 Hz subdivision. This is real Chromium evidence, not human-feel, hardware FPS or HMD proof.

Workflow permissions are contents:read only, official pinned actions, no credential persistence, secrets or deployment. Evidence uploads even on failure. source-identity.json binds candidate bytes to all runtime source modules.
