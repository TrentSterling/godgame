# Bounded groups and controller god hands

Baseline source: `989940e6ed8d447f59f61ccda18a64ac0a28367b`, now published as `3b33a7f0c959ccd374e11617a8b2d2d41a19144c`. The previously approved navigation optimization is preserved exactly. The sticky hand-grip state machine remains byte-identical to live source `8e51eabecb36fd852b684461d45e9d43ba9d1f54`.

## Interaction contract

Each hand acquires at most three distinct nearby characters in GRAB mode. The first contact retains the existing 28 mm physical reach. Extra contacts must be within 45 mm of the hand, sorted by distance, character ID and collider handle. They are selected once on acquisition; sweeping a held group over other characters does not collect more. A character already owned by either hand or desktop cannot be acquired again. Scenery blocks extra contacts; the already selected primary character does not block its own group. Resources and rocks remain single-object grabs.

Every member keeps a separate existing Rapier spring, its original local contact and fixed translation offset. Springs, damping, cadence, collisions and the 1.2 m/s anchor follow cap are unchanged. At most six XR anchors/joints can exist. Missing tracking freezes all member anchors and clears throw evidence without releasing ownership. Recovery permits throwing only after every anchor is within the existing settled tolerance; the live 45 mm / three fresh samples / 60 ms hand release policy is unchanged. Controller groups preserve trigger-OR-squeeze release semantics. Explicit object destruction safely cancels the affected hand's entire group without a flick; session/reset cleanup clears all groups.

Intentional placement is evaluated separately for each released character. Held group members cannot trigger UI. The existing status panel shows left/right counts, and all held attachment rings share one instanced draw per eye per hand. This does not merge character geometry or alter save/economy data.

The existing controller visual helper `61f6092f137454d64cba3b419bae3ca3ff7c461b` is reused. It poses the same articulated stone rigs from trigger/squeeze values and removes the old controller cylinders. The native target ray stays independent of the model. A valid grip still shows the model when the target ray is unavailable, without authorizing interaction. Tracked hand joints resume ownership when available. Diagnostics distinguish `controller-posed` from actual articulated hand tracking. Controller grip mapping follows the [WebXR grip-space convention](https://www.w3.org/TR/webxr/#dom-xrinputsource-gripspace); physical fit remains a Quest acceptance item.

## Validation

Run with the existing pinned Three 0.160 and Rapier 0.21 dependencies:

```
node build.cjs
node qa/xr-village/run-checks.mjs
node qa/performance/interaction-simulation.mjs
```

Fourteen native/CPU suites passed, including all prior sticky/lifecycle/placement/follow tests. New tests cover three-member groups, independent two-plus-two ownership, fixed membership/offsets, occlusion and deterministic selection at 0.024/0.030/0.036 scales, repeated open noise and missing joints, one-frame to thirty-second losses, source churn, bounded recovery, all-three deliberate throws, paused release, controller combined buttons and destruction cleanup. Controller tests include fifty analog blends, sixteen tracked/controller transitions, valid-grip/missing-ray visuals, exact grip centres, unchanged mesh/material identities and no duplicate shells.

Thirteen baseline/candidate simulation phases match exact public gameplay, serialized Rapier worlds, callback counts and HUD. Only explicitly added visual/group diagnostic fields are excluded. These scenarios do not hold bodies; separate native group tests cover that behavior.

## Actual renderer evidence and cost

Owned muted headless Chromium on the RTX 5070 Ti rendered a matched fixed 1280x720 synthetic XR fixture. Animation callback installation precedes session entry, as in production r160. Every XR capture has zero missing viewer frames and controlled 72 Hz timestamps. This is not a headset FPS measurement. Canvas pixels were copied synchronously after an untimed render; no runtime capture mode or drawing-buffer setting was changed beyond the established QA `?capture` entry.

- Desktop: 239 calls in both builds; canvas PNG bytes match exactly.
- Two controllers, mono: 175 to 179 calls.
- Two controllers, stereo: 350 to 358 calls, already counting both eyes.
- Actual group captures show three left-held characters and independent two-plus-two groups. Rings remain one instanced submission per hand per eye.

The first test expectation was wrong: two meshes per hand was not two submissions. The existing transparent, double-sided rune renders twice. Two complete rigs therefore add four calls per eye over the two old shells, and 10,978 non-monitor triangles per mono frame (21,956 stereo). Geometry, materials and rune rendering were preserved; no unreviewed LOD or visual downgrade was added. The original failed estimate and corrected validation of the completed ten captures are both retained. The validator does not claim another browser run occurred.

Relevant runtime review is five modules: `controller-god-hand.js`, `physics.js`, `settlement-main.js`, `settlement-xr.js`, `xr-grab-feedback.js`. Evidence is under `evidence/interactions/`; browser harness and post-capture validator are beside this guide. No local mouse/keyboard/focus, pointer lock, audio test or headset access occurred. Owned browser and hardware claims were closed/released.

## Pending acceptance

Independent source review and required release CI precede publication. On Quest, verify controller model orientation and ray readability, group selection radius/limit, two-hand groups, fast throws, prolonged tracking loss and deliberate release. Desktop/native tests do not establish compositor behavior or Quest performance. The separate Lambert/sign-batching candidate is not included here.
