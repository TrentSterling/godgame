# Village worker feedback

After an ordinary click selects a worker and orders Garden work, the accepted v24 build's confirmation expires after three seconds. Its panel then says only that the worker is selected. The job and any queued destination disappear from the panel while work continues.

This candidate keeps the existing panel and displays the worker's live activity. For example, it shows "Gathering food at Garden." or "Delivering food to Pantry then Quarry." The latter remains until the delivery completes and the queued role takes effect. Clearing selection removes the panel. The same message fits the existing XR status rows, wrapping on words when necessary. Existing notices, danger, held-object guidance and pause retain their desktop priority.

Only three existing runtime modules change, plus one new presentation helper. Economy, physics, assignment commands, source selection, navigation and art are unchanged. Ordinary delivery notifications are not added to the notice channel.

## Evidence

- `evidence/baseline-after-notice.png` shows the reproduced live-build weakness.
- `evidence/candidate-after-notice.png` and `candidate-queued-after-notice.png` show the persistent activity and queued destination.
- `evidence/candidate-queued-narrow.png` verifies the same panel at 640 pixels wide.
- `candidate-feedback-report.json` records ordinary Chrome mouse/keyboard inputs with real-time simulation and read-only state observations. No game-state injection, projected target automation or manual simulation stepping was used. The selected worker gathered food, accepted a queued Quarry order while carrying, delivered food, then changed role; selection clear and pause also passed. No page errors.
- `xr-feedback-report.json` and `xr-queued-synthetic.png` cover a synthetic tracked-ray order through the actual Chrome/Three renderer and exact desktop restoration on exit. These are mocked XR inputs and a pumped XR clock. They do not establish headset, tracking, stereo, comfort or hardware performance.
- `startup-native.json` passes the four inherited startup cases against the final source. `xr-native.json` passes transformed picking, lifecycle, native interactions and placement cancellation.
- `worker-feedback.test.mjs` checks current/queued jobs including same-role Island Garden reassignment, delivery, empty pantry, load capacity, pickup, withdrawal, missing/dead selections, higher-priority HUD states, no row mutation, XR wrapping, and HUD bounds at 390/640/1440 pixels.

The original source archive rebuilt to the exact accepted HTML hash before editing. `manifest.json` binds the accepted baseline, final candidate, source delta and evidence. 109 of 112 existing runtime modules are byte-identical. Original art and licenses were not edited.

## Reproduce and integrate

The original review kit is preserved by commit `090b3dc`. The approved release integration copies its exact `candidate.html` to root `index.html` and updates the existing release identity checks. `release-checkpoint.json` identifies this integration. `manifest.json` and the reports retain their original pre-publication status; they are review evidence, not a claim that the site has deployed. Shrine v24 and the previous startup candidate remain unchanged.

1. Extract the accepted Library v24 source archive identified in `manifest.json` into a new folder. The handoff ZIP includes its unchanged bytes as `baseline-source-v24.zip`.
2. Copy `source-overlay/src` over the extracted `src` folder, or apply `source-changes.patch`. Copy `worker-feedback.test.mjs` into its `qa` directory.
3. Run `npm ci --ignore-scripts`, `node build.cjs`, and `node qa/worker-feedback.test.mjs`. The rebuilt HTML must match `candidateHTML.sha256` in the manifest.
4. Run the inherited startup and XR native suites as documented in their scripts. For the browser scripts, set `CANDIDATE_HTML` to the candidate HTML path, `PLAYWRIGHT_MODULE` to an installed Playwright module, and `XR_MOCK_PATH` to this kit's `mock-webxr.js`. Defaults retain the exact Windows paths used here; Chrome's executable path is in the scripts. Run `node browser-playtest.cjs --candidate` and `node browser-xr-feedback.cjs` from a directory containing an `evidence` folder.
5. Verify the rebuilt HTML against `release-checkpoint.json`. PR checks rerun the inherited startup and village browser suites against the new root. After merge, the public witness must confirm the exact HTML and unchanged Shrine hashes. Do not reuse v24's sealed checkpoint as proof for changed source.

The dated source checkpoint and release receipt accompany the handoff. Publication is established only by the merged commit and successful public witness. No real headset result is available.
