# Construction priority acknowledgement

An ordinary sign click can change construction priority while a stone carrier continues a committed delivery to the previous site. The published build updates the world sign but writes the confirmation to an unused notice variable, leaving the player without an explanation.

This candidate acknowledges accepted choices for three simulation seconds in the existing desktop panel and XR status row. It says "Bridge is now the construction priority." when there is no conflicting committed stone delivery, or "Bridge is next after current deliveries." when an alive stone carrier is already delivering elsewhere. Stores uses "Stores now has priority for spare stone."

The acknowledgement is a fallback below existing notices and is hidden while food is held. The existing Pantry destination sign remains available. Input cancellation and desktop worker selection clear the acknowledgement. All economy, budgets, committed deliveries, physics, art, navigation and HUD layout modules are unchanged.

## Identity and scope

- Baseline merge: `70b3f726952422b608618ab04fee40a1845525e7`.
- Candidate HTML SHA256: `fff7bad7f5dce9114a522c140f5adb1613b0e04734305bc62f3547371bdf6f79` (8,495,013 bytes).
- Only `settlement-main.js` changes; the other 112 runtime modules are byte-identical.
- Original review commit `c585731` preserves the candidate-only checkpoint. The approved release integration copies its exact HTML to root `index.html` and updates the existing release identity checks. Shrine and earlier review kits remain unchanged. `release-checkpoint.json` identifies this integration; the original manifest retains the historical pre-publication state.

## CPU evidence

`evidence/focused-native.json` passes five cases against actual application callbacks with native Rapier and non-rendering DOM/WebXR fixtures:

1. Accepted construction sign click, fixed inventory/physics, existing panel bounds at 390/640/1440px, expiry, Stores shortcut and paused rejection.
2. A naturally produced committed Brace carrier keeps its load, owner and destination when priority switches to Bridge; the acknowledgement explains the commitment.
3. Actual low-resource economy models produce access, garden and defense budget rejections. Their results pass through the application's command/feedback path, preserving the original error messages and live inventory.
4. Mocked XR sign input produces the complete acknowledgement in the existing status-row glyph geometry.
5. A naturally produced food load is grabbed through mocked XR input before the acknowledgement expires. The Pantry sign still says "BRING FOOD HERE", and the acknowledgement yields in desktop and XR.

The released baseline fails the new accepted-sign acknowledgement assertion, recorded in `evidence/baseline-regression.json`. Four inherited startup cases, four native XR suites and the previously published worker-feedback contracts also pass. These tests use fixture targeting, stepped simulation and mocked XR. They do not establish ordinary browser rendering or headset behavior.

## Reproduce

Extract `Godgame-worker-order-feedback-20261015-source.zip` identified in `manifest.json`. Copy `source-overlay/src/settlement-main.js` over its `src/settlement-main.js`, and place `native-input.mjs` and `run-checks.cjs` in its `qa/priority-feedback/` directory. Run:

```text
npm ci --ignore-scripts
node build.cjs
node qa/priority-feedback/run-checks.cjs
python qa/startup-planning/run.py
node qa/xr-village/run-checks.mjs
node qa/worker-feedback.test.mjs
```

The generated HTML must match the candidate hash above. The inherited source archive's release seal describes the baseline; this directory's manifest describes the candidate delta.

## Browser evidence and release

`browser-evidence/verification-receipt.json` records the completed local Chrome checks and Library screenshot IDs. Ordinary keyboard/mouse input verified accepted Brace priority, switching to Bridge while the same stone carrier remained committed to Brace, 1440px/640px layouts and message expiry. The budget cases are separate scripted rendering fixtures, not ordinary gameplay depletion. Mock WebXR verified the full status message, held-food Pantry guidance and desktop camera restoration; no headset result is available. No browser page errors occurred.

The first synthetic Bridge ray did not activate the sign. Only the harness ray origin was moved closer; the complete rerun passed against unchanged candidate bytes. Both reports remain recorded.

Publication is authorized for this tested fix. Existing PR checks rerun against the exact new root; merge and public deployment receipts establish publication separately.
