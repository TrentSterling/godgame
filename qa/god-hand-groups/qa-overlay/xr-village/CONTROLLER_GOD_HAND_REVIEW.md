# Controller god-hand visual helper

Baseline source: `8f60f766c748f81cf665866ebdeed717104c3cba`. The runtime integration file `src/settlement-xr.js` is deliberately unchanged. The separate owner is changing grab ownership and will integrate this helper into that branch.

## Behavior and ownership

`createControllerGodHand(rig)` reuses one existing articulated god-hand rig. Construct it once after creating the rig, before either source animates it. `update(gripPose, inverseSceneMatrix, {trigger, squeeze})` poses its existing bones and returns whether the visual has a valid grip pose. It creates no geometry, material, texture, collider, input source or ray. Input values are visual presentation only; the helper cannot grab, release, click or change simulation state.

The four authored rig poses are blended continuously: open (neither input), pinch (trigger), point (squeeze) and fist (both). `controllerFingerAmount(button, eventHeld)` supports analog, digital and event-only controllers. Source diagnostics remain `controller-posed` and `handTracking:false`; these are authored poses, not measured finger tracking.

The hand is authored at 0.055 metres per model unit. Its grip centre maps exactly to the current grip position. The finger axis points opposite grip-space +Y (towards the arm), and the dorsal face points +X for right / -X for left. Physical controller fit and artistic orientation still require Quest inspection. This mapping uses the [WebXR grip-space definition](https://www.w3.org/TR/webxr/#dom-xrinputsource-gripspace), independently from the native target ray.

Real `retargetHand` writes manual bone matrices. The helper restores authored local translations/scales and automatic bone matrices when controllers take over. Before applying real hand-joint data, call `releaseToTracking()` if `isControllerPosed()` is true. That returns the group's transform ownership; real articulated retargeting still owns all current joint data.

## Integration proposal

`controller-god-hand.integration.patch` changes only `src/settlement-xr.js`, against the baseline above. It is a proposal, not an applied runtime change. `git apply --check` succeeds on this checkout; the proposed source also bundles successfully with installed esbuild. Reconcile it with the active sticky-grab state machine instead of applying it blindly.

The proposed changes:

- Create one helper per existing `playerHands[side]` rig.
- Remove the controller cylinder shell, preserving the independent marker group and target-ray line.
- Show the existing rig for a valid controller grip, including when aim data is missing or rejected. Missing aim disables the ray and interactions, while valid grip data still poses the visual.
- Blend trigger/squeeze values without changing the controller button/action logic.
- Mark the visual as `controller-posed` or `tracked-hand` in diagnostics, separately from current source tracking validity.
- Restore group/bone ownership when switching between controller posing and actual tracked joint retargeting.
- Retain visual policy for both source kinds rather than hiding every non-hand source in `holdRecentVisual`. This does not authorize stale input.

Do not parent or derive the target ray from the god-hand model. The controller grip and target ray are distinct spaces and may have different orientations. Do not keep the old controller shell visible behind the hand. Do not change sticky-grab ownership policy in this visual integration.

Each existing rig contains two meshes/materials and one texture. The helper adds none. Making both rigs visible in controller mode while removing the two shell meshes has an estimated net cost of one additional visible mesh per controller (before stereo duplication); this is a source census, not measured renderer/GPU evidence.

## Verification

Run `node qa/xr-village/controller-god-hand.test.mjs` from the repository root. It passes seven check groups:

- Analog, digital and event-only visual input normalization.
- Both hands reproduce four authored endpoints and 25 analog combinations each.
- Grip centres, axes and physical scale remain correct through scene translation, rotation and nonuniform scale.
- Independently authored native target-ray endpoints remain unchanged.
- Eight real-joint/controller transition cycles per side restore matrix ownership.
- Null, emulated, nonfinite and invalid-quaternion grip poses hide controller visuals; invalid scene matrices are rejected.
- Exact original mesh, geometry, material and texture identities remain unchanged throughout.

The repeatable receipt is `controller-god-hand-evidence.json`. These are CPU-only Three.js 0.160 tests using synthetic grip/joint data. They do not verify hardware alignment, Quest controls, browser rendering or comfort.

After root integration, rerun native controller/hand UI lifecycle tests and add assertions for valid-grip/missing-ray visibility, source switching, no shell duplication, and active-session controllers showing both hands. Actual Quest visual alignment and ray readability remain user acceptance checks. No browser, GPU, audio, focus or physical input was used for this helper task.
