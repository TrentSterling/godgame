# Persistent tracked-hand grip

Source baseline: `8f60f766c748f81cf665866ebdeed717104c3cba`, verified published as `30719b515eb4ea9ffd9287c2afeda1ab15494b3a`. This candidate supersedes the previous hand-grab timeout contract. It does not include multi-grab, controller hand models or Quest rendering changes; those are separate work in progress.

## Behavior

An existing tracked-hand grab has explicit idle, held, suspended and recovering states. Missing joints, missing input sources, viewer loss, callback interruptions, visibility changes and source replacement suspend ownership without an expiration time. The same Rapier joint and anchor remain. Missing input freezes the anchor and clears throw/poke/select evidence. Visual pose retention remains separately bounded at 160 ms; current tracking validity is never fabricated.

A hand closes for new acquisition below 22 mm after the existing fresh-open arming checks. Once held, release requires a thumb/index gap greater than 45 mm in at least three distinct fresh samples spanning 60 ms. Ambiguous, pinched or missing samples reset release confirmation. A single noisy open estimate during fast movement does not release. These defaults require Quest feel testing.

Reacquired pinches keep the same object and follow with the existing 1.2 m/s physical anchor cap. Throw sampling stays disabled until the anchor is within 12 mm of the fresh target and remains settled for 80 ms. An XR timestamp interval over 50 ms independently invalidates throw freshness, even when simulation time barely advances. Sparse but valid opening samples can still release responsively, without adding an old impulse. Opening on reacquisition releases without stale impulse. Intentional valid-open placement is separate from permission to add a flick. Physics stepping, springs, collision/CCD, desktop and controller button policies are unchanged.

Held hands do not activate UI from hover/poke/pinch. Other-hand menus remain usable, and paused simulation retains ownership while accepting a confirmed tracked opening. A controller merely appearing does not steal the hand grip; an armed fresh controller press explicitly hands over. Session end, reference reset, explicit table relocation/reset, mission termination and object destruction clean up. Main's desktop pointer-cancel event no longer cancels XR hand grips.

## Files to review

- `src/xr-hand-grip.js`: release evidence and recovery state.
- `src/settlement-xr.js`: all transient-loss paths, source identity transitions, held-input routing and explicit cleanup.
- `src/physics.js`: validity guards for destroyed native handles; unchanged spring/follow limits.
- `src/settlement-main.js`: intentional release versus flick, paused/input UI handling and desktop-event isolation.

## Verification

Run from this checkout with its existing pinned dependencies; no browser installation or headset setup is needed:

```
node build.cjs
node qa/xr-village/run-checks.mjs
node qa/performance/sticky-simulation.mjs
node qa/performance/monitor.test.mjs
node qa/performance/batching.test.mjs
node qa/performance/bridge-batching.test.mjs
```

The new `sticky-grip.test.mjs` exercises production XR callbacks with native Rapier, both hands, one-frame through 30-second gaps, repeated missing frames, intermittent open noise, fast-motion deliberate throws, 30/72/90/120 Hz releases, source churn and stale hand end events, passive/intentional controller handover, paused release, held-hand UI overlap, distant reacquisition, bounded catch-up, object destruction and explicit cleanup. It fails against the published baseline because missing tracking releases ownership. Existing hand timeout assertions were deliberately replaced with exact-joint retention assertions; controller timeout and combined-button assertions remain.

The 13-phase simulation comparison uses the current published source baseline and compares exact gameplay state, serialized Rapier worlds and callback counts. Only the new grip diagnostic object is excluded. No held-body trajectory is present in those phases; separate native grip/follow tests cover that behavior. The monitor and prior batching regression suites remain unchanged.

Independent reviewer `/root/grab_follow` found a stale-throw blocker in the first candidate: a 150 ms callback gap advanced native simulation time only 16.7 ms and reused old throw velocity. The corrected state machine uses XR timestamps for this decision. Re-review found the acquisition timestamp also needed seeding to cover the first held sample. `throw-gap.test.mjs` reproduces both failures at 51 ms and verifies both hands at 49/50/51/100/150 ms during a hold and immediately after acquisition, plus sparse valid-open releases. Twenty-five pure state-machine cases cover exact threshold, first samples, duplicate timestamps, missing evidence and 80 ms recovery. The amended candidate requires independent re-review; no failed candidate was published.

All evidence is synthetic/native CPU execution, not Quest acceptance, headset FPS or compositor proof. This change adds no render meshes, materials, shaders or draw passes. No browser, OS input, focus, pointer lock or audio was used in this pass. Required independent review and release CI precede publication. The previous live rollback remains available.

## Quest acceptance still needed

Hold a character through brief occlusion, several seconds without hand tracking, source switching and rapid movements. Still-pinched recovery must retain ownership; a clear opening should release after a short confirmation. Try a deliberate throw after continuous tracking and an opening immediately after reacquisition. Verify the latter does not add a stale flick, menus remain usable from the other hand, and ending/resetting the session cleans up. Browser/compositor world disappearance is separate and remains unverified.
