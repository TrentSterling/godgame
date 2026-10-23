# Quest tracking retention, grab following and cadence monitor

Candidate is based on source `15d852ba9996bfb927c0f1ffc85c94a6b6b76b36`, published as `b13137d1b6b2c2b840c76f44ed9b29f47847d73b`. Main was rechecked at that same published commit before packaging. No publication is included in this source candidate. Independent review and normal release CI must pass before publishing.

## Confirmed causes and limits

`settlement-xr.js` previously called `clearHand` on the first unavailable grip-joint sample and `releaseAll` on the first invalid viewer pose. Both remove existing grabs. Visual retention stopped after two samples or 50 ms, so its effective duration depended on callback rate.

`physics.js` used the same 0.24 m/s physical limit for XR anchor following and the extra flick velocity. Its XR spring used mass-normalized stiffness 55 and damping 9, versus desktop 480 and 40. A target moving at 0.6 m/s necessarily outruns the old anchor.

There is no confirmed app-level explanation for the reported entire-world disappearance on a single missing pose. The old bridge does not hide the placed scene on a null viewer pose; reference-space reset does hide it and require placement. Installed Three 0.160 retains eye transforms when `getViewerPose` is null. Browser/compositor suppression remains possible and unmeasured. The new cache only preserves application rendering while the browser continues supplying usable render callbacks and targets. It cannot force a compositor to display a frame or override system visibility.

## Runtime changes

- `settlement-xr.js`: 160 ms time-based hand/controller visual and existing-grab retention. Missing samples set `tracked=false`, cancel pending UI/poke/select intent and freeze the existing anchor target. They cannot create a grab, activate UI or sample a throw. A recovered held pinch continues the same joint; an open pinch releases. Throw sampling is suppressed for 80 ms after reacquisition. Sustained loss, source removal, hidden/blurred session, reference reset, UI actions and session end safely cancel. Controller button release remains authoritative even with an unavailable pose.
- `xr-view-retention.js`: preallocated render-only cache of last real viewer and eye transforms/projections. It expires after 160 ms, and resets on visibility/reference/session changes. It is never returned as an XR pose or used to authorize interaction. Simulation remains paused while viewer tracking is invalid. Diagnostic counters distinguish missing/emulated viewer, reference reset, visibility changes, missing hand joints and retained grabs.
- `physics.js`: separate 1.2 m/s XR anchor follow cap and existing desktop spring coefficients. Dynamic bodies, collision solver, CCD, anatomy and 120 Hz stepping remain. Sampled extra flick remains capped at 0.24 m/s; this is not a cap on existing physical body velocity. Throw smoothing is time-based. New suspend/rebase APIs invalidate throw history without deleting the joint.
- `performance-monitor.js` and main integration: measured animation-callback FPS, average callback interval in ms and complete-application-frame draw calls. A one-second bounded ring and 4 Hz text refresh use fixed geometry buffers. Renderer counters explicitly cover world/shadow/HUD passes and already include XR eyes. Desktop is noninteractive DOM; XR is one mesh per eye, placed clear of the captured menus. It reports neither GPU time nor configured headset refresh rate. Visibility/mode changes reset cadence history.

XR render scale, foveation, resolution selection, saves, gameplay cadence and existing batching are unchanged. There is no library upgrade, audio path or device configuration change.

## Evidence

- Seven native suites: transformed picking, bridge lifecycle, real gameplay interactions, real worker placement, hand UI, tracking retention, and grab follow comparison. All passed with 117 source files, 13 test files and three runtime assets unchanged during the suite.
- Tracking suite includes one/two-frame gaps, irregular 11/38/47/66 ms intervals, sustained loss, explicit release, missing-contact UI, visibility, disconnect, reference reset, long interruptions, emulated viewer poses and session ending. It now also executes 36 recovery cases across hand, viewer and controller pose loss: fresh recovery at 159/160/161/200 ms after one missing sample at 150 ms, irregular missing samples at 11/49/96/150 ms, or no intervening missing callback. Retention includes exactly 160 ms and expires above it before fresh input can overwrite the last-valid timestamp. Expired grabs require open input before rearming. Sixteen controller event cases cover either button alone and both release orders across event-only, gamepad-only and mixed input sources.
- 18 matched native head-hold trajectories across scales 0.024/0.030/0.036 and target speeds 0.1/0.3/0.6 m/s. At scale 0.03 and 0.6 m/s, mean/max physical head error changes from 277/543 mm to 7.6/9.8 mm. Four floor/wall scenarios retain collision and anatomical-joint stability. Desktop/touch native snapshots are byte-identical. These are synthetic target trajectories with real Rapier, not Quest latency measurements.
- Thirteen production simulation phases preserve gameplay state, serialized native physics and callback counts. Only explicitly added diagnostics are excluded from state comparison. Those phases contain no held-body trajectory, which is covered separately.
- Twelve monitor CPU checks. The corrected candidate's 20,000-callback harness took 11.514 ms total on this host, with unchanged 245,088-byte geometry buffers. That is harness CPU cost, not device timing or a GPU benchmark.
- Forced SwiftShader Chromium with actual Three renderer: desktop world remains 238 calls / 172,818 triangles in the opening and 258 / 172,698 after bridge completion. Existing HUD remains one call. Synthetic mono XR changes 180 to 181 calls; synthetic stereo changes 360 to 362. Monitor cost is one call and approximately 546 triangles per eye for the displayed text. The 72 FPS shown in synthetic captures comes from deliberately supplied 72 Hz timestamps, not headset performance.
- One/two null viewer samples still submit 181 draws and retain the same eye transform in the real Three/mock-provider test. Sustained loss expires rendering, and reacquisition restores the exact scene placement. This does not reproduce a real compositor.
- Matched desktop and mono-XR captures have zero changed world pixels outside explicit monitor rectangles. Mobile and stereo captures are included. All local browsers were owned, muted, headless and closed. SwiftShader was verified before loading the game; hardware GPU claims were left with their owner and a separate CPU browser claim was released.

Receipts and images are under `evidence/tracking-*`. Generated raw outputs remain under `generated/` and `../xr-village/generated/` in the owned checkout.

## Reproduce and review

Use Node with the pinned existing dependencies. Do not install browser software or change headset/security settings for this review.

```text
node build.cjs
node qa/xr-village/run-checks.mjs
node qa/performance/monitor.test.mjs
node qa/performance/tracking-simulation.mjs
node qa/performance/bridge-batching.test.mjs
node qa/performance/batching.test.mjs
```

The browser harness is `qa/performance/tracking-browser.cjs`, with `PLAYWRIGHT_PATH` pointing to existing Playwright, `PLAYWRIGHT_BROWSERS_PATH` to its existing compatible cache, and `BASELINE_HTML` to the published b13137d HTML (SHA256 `521b7cb719db05c838150333fc3620ca06664bfaa0aeb32ecc35c49edd115b76`). Coordinate a CPU browser lease and use the script's forced muted software backend. Existing captures can be reviewed without launching anything. `tracking-pixels.py` compares the generated matched captures.

Review the lifecycle semantics and time boundaries, rejection of stale input, explicit release after a gap, prevention of flick on rebase, preservation of controller switching, native collision stress and unchanged desktop behavior. Check Three r160 camera-cache assumptions and monitor layout/counter boundaries. The old sustained-loss tests now feed 13 missing samples to exercise the 160 ms timeout; new tests separately assert short-gap retention, so the previous cancellation assertions were retained at the new boundary.

Independent review of the first candidate found two uncovered boundaries. The new execution tests first failed on hand recovery at 161 ms, then (after the expiry fix) on event-only trigger release while squeeze remained held. The corrected bridge checks last-valid viewer and input age before fresh pose/pinch processing, and uses one combined trigger-or-squeeze predicate for fresh input, invalid-pose polling and release-event cancellation. Both regression groups now pass. The earlier guide's 0.045 trajectory scale was a documentation error; actual coverage is 0.036 as listed above.

Official references checked against installed code: [Three r160 WebXRManager](https://raw.githubusercontent.com/mrdoob/three.js/r160/src/renderers/webxr/WebXRManager.js), [WebXR pose semantics](https://www.w3.org/TR/webxr/), [Rapier spring signature](https://rapier.rs/javascript3d/classes/JointData.html#spring). Installed versions remain Three 0.160.0 and Rapier 0.21.0.

## User-owned Quest acceptance

Enter with hands active, then also test controllers-first and switch in-session. Hold a villager while moving normally and briefly occluding a hand; the existing hold should survive a short sample gap, but opening fingers must release. A sustained loss must cancel without a flick. Test pause/resume by fingertip, switch back to controllers, and exit/reenter. Check monitor readability and report callback FPS/ms/draws in the slow scene. If the whole world still vanishes, capture the new viewer/visibility/reset diagnostics through an already authorized setup; the monitor alone cannot identify compositor suppression. No real Quest acceptance or FPS improvement is claimed here.
