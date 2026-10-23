This candidate preserves the published hand/UI source `7bf720e6b3b805c80fe082cfd65c1e1ac8e0d366`, deployed in `02e7fdeff0d856b9c7868bfe75051258d3469c2a`. The CPU cleanup is isolated in `01d9ec2dd129dc7ae3857cc3d7b54d668af2111e`; the following commit adds local scenery batching and evidence. No publication has occurred for this candidate. Independent review precedes release integration and required hosted CI.

The draw-call change touches `settlement-food-art.js`, `settlement-quarry-geology.js` and new `static-scenery-batch.js`. Each garden has a foliage batch and a produce batch. Produce uses the original prefix depletion order through a draw range; it is never rebuilt per frame. Quarry terraces use separate left/back/right chunks. All six merged chunks have bounds smaller than 6.5 game units on every axis. Original individual Rapier colliders remain byte-identical. Moving loads, villagers, ragdolls, hands, transparent objects, world controls and animated objects are excluded. Existing vertex colors/materials are retained; atlas or instancing changes would add scope without additional draw-call savings in these small fixed groups.

Actual `renderer.info` counters from existing headless Chromium through Playwright 1.59.1, verified ANGLE SwiftShader, compare the exact old and new standalone HTML. Counters span world/shadow passes with `autoReset=false`; HUD is measured separately. The wide view is a single desktop camera with shadows disabled, not stereo or real XR.

| Scene | World calls before | After | Triangles before and after |
|---|---:|---:|---:|
| Opening desktop, full crops, shadows | 322 | 268 | 172,818 |
| Wide single view, full crops, no shadows | 192 | 165 | 90,211 |
| Desktop, half crops, shadows | 310 | 268 | 172,098 |
| Wide single view, half crops, no shadows | 186 | 165 | 89,851 |
| Desktop, depleted crops, shadows | 296 | 264 | 171,258 |
| Wide single view, depleted crops, no shadows | 179 | 163 | 89,431 |

HUD remains one draw on desktop. Geometry object counts observed by the renderer change from 160 to 157; texture count stays six. These are object counts, not memory bytes. `evidence/browser-drawcalls.json` includes backend, exact build hashes, all counters and browser cleanup. Screenshots are in `generated/`; `evidence/pixel-comparison.json` records the small rasterization differences. These measurements make no Quest FPS, GPU-time or compositor claim.

CPU cleanup in `settlement-main.js` shares snapshots only within an immediate read phase and skips the desktop HUD while XR is active. `settlement-economy.js` exposes a live scalar outcome getter instead of building snapshots for frame-loop gates. Neither the two economy observation/update phases nor 120 Hz physics cadence is removed. Both world-cue updates remain because the earlier one prepares hover query geometry. XR framebuffer scale and foveation are unchanged.

The deterministic five-second XR phase executes 600 native physics steps and 1,200 economy updates in both versions. Full snapshot constructions fall from 4,200 to 1,560; HUD updates fall from 360 to zero; world-cue updates remain 720. In-process V8 allocation sampling (16 KiB average interval, including objects collected by minor/major GC) estimates 872,738,592 versus 614,322,632 total allocated bytes in that fixture. The snapshot subtree estimate is 432,365,976 versus 164,976,128 bytes. These are sampled host allocations, not retained heap, exact byte totals, Quest memory measurements or stable benchmarks. Host wall-time observations are diagnostic only and may include other work on this shared machine.

Validation:

- Build and all five existing native XR/picker/hand/UI/placement suites pass. Their production callbacks use mock DOM/WebXR and native Rapier, not physical headset tracking.
- Thirteen deterministic phases match complete public state JSON and serialized Rapier world hashes: cold render, running, pause, commands, XR placement/running/pause, 80 ms callback gap, exit/resize refresh, production/meals/raid, lost load and terminal state. Commands, observations, economy updates and physics step counts match.
- Geometry test compares 5,736 vertices, normals and colors against the pre-batching source, checks small bounds, unchanged collider serialization, depletion at five fractions, 140 surface rays and disposal. Transparent input is rejected.
- Outcome getter tests cover playing/failed/won, reset, detached snapshots and rejected commands. Real model production/delivery reaches the winning state.
- No local mouse/keyboard injection, foreground windows, pointer lock, audio, hardware GPU capture, headset debugging or security changes were used. Chromium was headless, explicitly muted and configured for SwiftShader before any game page loaded; it was closed in `finally`.

Reproduction from this source checkout:

```text
node build.cjs
node qa/xr-village/run-checks.mjs
node qa/performance/run-checks.mjs
node qa/performance/batching.test.mjs
```

The CPU comparison requires the historical source commits in this repository. Source hashes in its fixture identities normalize CRLF to LF. Browser measurement requires an existing Playwright installation through `PLAYWRIGHT_PATH`, its existing browser cache through `PLAYWRIGHT_BROWSERS_PATH`, and the reviewed published HTML through `BASELINE_HTML`; it installs nothing. Run `node qa/performance/browser-drawcalls.cjs`. The baseline HTML SHA256 must be `0fc797800189e78e628cf81adf1f261b92ccae6656890e13a785de8803927e90`; candidate is `02362b3e8a92a4225ca05ec01377928b00de266a4354bdbf63cd41869e5dbf1d`, 8,503,547 bytes.

The merge and draw-range APIs were checked against installed Three.js 0.160.0 and official [r160 BufferGeometryUtils](https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/utils/BufferGeometryUtils.js) and [BufferGeometry](https://raw.githubusercontent.com/mrdoob/three.js/r160/src/core/BufferGeometry.js). Heap sampling follows [Node v24.22.1 inspector](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/inspector.md) and the official [V8 inspector protocol](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/js_protocol.pdl). No dependency upgrade was made.
