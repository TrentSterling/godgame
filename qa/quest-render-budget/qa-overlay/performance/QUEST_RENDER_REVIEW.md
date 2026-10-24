# Diffuse XR rendering and local sign batches

Baseline source is `be71df7671bf82038f326b64e70b06f98ac30711`, the independently approved grouped-grab/controller-hand release now live as `195e4972c7615b3c81043e75118e8ab9c91d2e6f`. This candidate changes three runtime modules. It preserves all interaction work, the earlier navigation optimization, tracking, sticky grip, simulation, save and resolution paths. The four non-main interaction modules are identical to that baseline. Main differs only by the render-budget import, initialization, render bracket and QA context exposure.

Candidate HTML: 8,526,887 bytes, SHA256 `b9e92a752e52462a95e3b5c1fa8d2f49b2414c62215fce1df74ec0522929139a`. Baseline HTML: 8,522,079 bytes, SHA256 `d8b6e70255d8538d9b1253b76be5756eb25d26837a7ab521256009aefc9e62b5`.

`xr-render-budget.js` temporarily substitutes cached Lambert materials for eligible opaque, nonmetal Standard materials during the XR world draw. It preserves texture/color/alpha/render flags, geometry, skeletons and picking identities, then restores exact source material references in `finally`. It skips custom callbacks, physical/metallic/transparent materials and environment lighting. This is per-fragment diffuse lighting without GGX/specular, not vertex lighting or a geometry LOD. `settlement-main.js` creates one budget and brackets the world render. Desktop materials are unchanged. `settlement-world-cues.js` merges each sign's static decoration locally; independently animated signs, text, highlights, hit plates and culling remain separate.

CPU verification commands, using the existing pinned Three 0.160 and Rapier 0.21:

```
node build.cjs
node qa/xr-village/run-checks.mjs
node --test qa/performance/xr-render-budget.test.mjs
node qa/performance/cue-batching.test.mjs
node qa/performance/budget-render-simulation.mjs
node qa/performance/xr-render-budget-profile.mjs
python qa/performance/quest-budget-pixels.py qa/performance/evidence/quest-budget-interactions-20261024
node qa/performance/budget-render-evidence.mjs
```

All fourteen native suites and thirteen deterministic phases pass with exact public state, native physics, callback/cadence counts and HUD. Eight material lifecycle checks pass. Local sign batching preserves 64,800 vertices/normals, 1,728 picking rays, 384 culling tests and eight UI states. Warm begin/end traversal plus synchronization measured 0.008138905 ms per host frame across 20,000 iterations; the sampler attributed 16,400 transient bytes total (0.82 bytes per iteration), with no new materials after warmup. This is a sampling estimate on the host, not a proof of zero allocation, Quest CPU time or live heap usage.

Final frozen evidence is `evidence/quest-budget-interactions-20261024/`, with per-file SHA256 manifest and content-hash PNG names. Actual Three rendering on the RTX 5070 Ti uses a matched synthetic XR pose, 1280x720 single-sample RGBA8/depth24 external framebuffer and ABBA run order. All twenty-eight sets of 24 asynchronous GPU queries passed without disjoint or GL errors; readback is outside timed frames. Camera matrices, scene matrix, UI mode, tracking validity and eye count match. Controlled 72 Hz sample timestamps do not measure headset cadence.

| Scene | Calls before | Calls after | Non-monitor triangles |
| --- | ---: | ---: | ---: |
| Desktop including shadows/HUD | 239 | 217 | 176,034 |
| XR mono | 171 | 149 | 92,449 |
| XR mono with controllers | 179 | 157 | 103,491 |
| XR stereo with controllers | 358 | 314 | 206,982 |
| XR mono with hands | 177 | 155 | 103,491 |
| XR stereo with hands | 354 | 310 | 206,982 |
| XR stereo after bridge completion | 374 | 330 | 206,862 |

Stereo numbers already include both eyes. Geometry is unchanged; monitor glyph triangles vary with displayed draw counts. XR shadows were already disabled. Stereo hand GPU medians were 0.1326–0.1345 ms baseline and 0.1079–0.1087 ms candidate; controller stereo was 0.1369–0.1506 ms and 0.1200–0.1236 ms respectively. Desktop timing was noisy, with no timing improvement claimed. These tiny host durations do not establish Quest FPS or compositor performance. The 22-call-per-eye reduction is from sign decoration batching, while the material tier reduces shader work.

The now-live controller rigs already cost four extra calls and 10,978 extra non-monitor triangles per eye compared with their former shells. This render candidate retains that interaction release and its transparent double-sided rune passes; it does not claim to optimize hand geometry or remove that cost. Two native rays remain two line submissions per mono controller frame.

Desktop PNGs are byte-identical. XR menu pixels, FPS line and monitor panel silhouette compare exactly; only draw-count digits and intended world lighting differ. Mean full-image RGB difference is 0.64–1.04 on a 0–255 scale. Some model/tool previews falsely displayed missing UI despite equal decoded RGBA pixels; the root independently reproduced menu equality from immutable files. Earlier wrong-loop or overwritten diagnostic receipts are excluded. No runtime workaround was added for an image-preview discrepancy.

The original CPU-only-parent rendering candidate is frozen separately at `d6829c4933735ea23dfc0d58cd950b3a9f6ad1de`; `evidence/quest-budget-20261024/` retains that provenance. It is not the release candidate or the latest measurement. The final exact-state receipt started against the approved PR14 head, abbreviated `178f095`; source identity is full `be71df...` throughout. PR14 subsequently merged as `195e4972...` with identical baseline HTML bytes.

Independent source review and required CI remain release gates. Physical Quest lighting/readability, performance and control acceptance remain user-tested. No publication or headset access occurred in this task. Owned muted headless browser and both hardware claims were closed/released; no physical input, focus, pointer lock or audio tests occurred.
