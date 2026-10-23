This candidate starts from reviewed source `c845caddaa7a7c1d9da9124503b110fe2383af75`, published in `d66a31a8dd79852256974bb5f5a81d9bb4a087be`. Remote main and both previous local checkouts were unchanged when work started and were checked again before handoff. The isolated branch is `perf/local-scenery-batches`. Publication is pending independent review.

The only runtime change is in `src/settlement-world.js`: each of five bridge construction outlines becomes one opaque mesh instead of four bars. All twenty duplicate basic materials become one shared material. Each batch remains in its original independently visible section group and replaces the bars in the visible-surface picker's scenery list. Temporary bar geometries are disposed after copying. No geometry is removed, no collider or bridge update logic changes, and no animated object is merged. The five bounds are about 1.115 x 0.035 x 3.575 game units each.

The baseline census counted 40 bridge-plan draws (20 color plus 20 shadow), the largest named repeated static group. Other repeated groups include dynamic load stones (16), quarry outcrops (10), causeway piers (8), shelter posts (8), and shared hero visuals (8). Buildings and much environment art were already merged. Atlasing would not reduce the bridge-plan draws further: the selected objects are untextured and have identical material settings.

Actual `renderer.info` counters include the world and shadow pass with `autoReset=false`; the desktop HUD is counted separately. A wrapper around `renderBufferDirect` accounts for every counted submission and records object/material identity. Both builds use existing Playwright 1.58.2 and headless Chromium with an explicitly muted, verified ANGLE SwiftShader backend. No local physical input, pointer lock, foreground window, audio test or hardware GPU is used. Every browser closes in `finally`. These are desktop single-camera measurements, not stereo XR, GPU time or Quest FPS.

| Delivered bridge sections | Desktop shadows before / after | Wide shadowless before / after |
|---|---:|---:|
| 0 | 268 / 238 | 165 / 150 |
| 1 | 266 / 242 | 164 / 152 |
| 3 | 262 / 250 | 162 / 156 |
| 5 | 258 / 258 | 160 / 160 |

Opening savings are 30 calls (11.2%) with shadows and 15 calls (9.1%) without shadows. The benefit intentionally disappears when the construction outlines are gone. All eight matched triangle counts are identical, including 172,818 opening desktop triangles and 90,211 wide-view triangles. The HUD remains one desktop draw. Visible color-material objects decrease from 59 to 40 and renderer geometry objects from 157 to 142; textures remain six. Object counts are not memory-byte measurements.

The standalone HTML is 8,503,720 bytes, SHA256 `521b7cb719db05c838150333fc3620ca06664bfaa0aeb32ecc35c49edd115b76`. The baseline HTML is exactly the prior public `02362b3e8a92a4225ca05ec01377928b00de266a4354bdbf63cd41869e5dbf1d` build. Dependencies, hand/UI code, resolution, foveation and simulation cadence remain unchanged.

Validation evidence in `evidence/scenery-*.json` and `evidence/bridge-batching.json`:

- 720 vertices, normals and UVs match the original bars; color/material/shadow properties are preserved. Twenty temporary source geometries are released exactly once.
- 125 frustum checks verify conservative coverage and separate culling of distant sections. There is no whole-bridge batch.
- 945 production visible-surface-picker rays match at native scale and two translated/rotated tabletop scales. Nine construction/update sequences preserve byte-identical native Rapier snapshots, collider handles, independent outline visibility and completion behavior, including repeated or decreasing update inputs.
- All five existing native XR/picker/controller/placement/hand-UI suites pass using mocked DOM/WebXR and real Rapier. These are not actual headset tests.
- Thirteen deterministic production phases match complete public state, Rapier hashes, all simulation/presentation callback counts and desktop HUD refresh after XR exit. The fixture includes running, paused, XR placement/running/pause, controller/hand menu paths, a callback gap, economy production, meals, raid, lost loads and terminal state.
- The older CPU performance suite also passes its original state, physics, callback and snapshot-reduction assertions, including both sampled and unsampled runs. Its strict changed-module list adds only `settlement-world.js` to account for this patch.
- Eight screenshot pairs have six pixel-identical pairs. The opening desktop pair differs at three pixels (maximum channel delta 5/255), and opening shadowless pair at two pixels (maximum delta 4/255), out of 921,600 pixels per image. Original captures were visually inspected and remain in `generated/`; their hashes are in `evidence/scenery-images.json`.

Reproduce from the source checkout:

```text
node build.cjs
node qa/performance/bridge-batching.test.mjs
node qa/xr-village/run-checks.mjs
node qa/performance/scenery-simulation.mjs
node qa/performance/run-checks.mjs
```

For the browser harness, set `PLAYWRIGHT_PATH` to an existing Playwright module, `PLAYWRIGHT_BROWSERS_PATH` to its existing browser cache, and `BASELINE_HTML` to the exact prior public HTML. It installs nothing. Run `node qa/performance/scenery-browser.cjs`, then `python qa/performance/scenery-pixels.py` (Pillow and NumPy), then `node qa/performance/scenery-evidence.cjs`. `--census` records only the baseline census. The CPU fixture builder accepts explicit baseline source/deployment environment values while retaining its old defaults; no historical assertions were removed.

The reused batching helper uses the installed Three.js 0.160.0 [mergeGeometries implementation](https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/utils/BufferGeometryUtils.js) and [BufferGeometry transforms](https://raw.githubusercontent.com/mrdoob/three.js/r160/src/core/BufferGeometry.js), checked against the matching official revision. No library upgrade was needed.
