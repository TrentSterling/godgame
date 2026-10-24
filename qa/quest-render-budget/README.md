# Quest rendering budget release

Publishes independently reviewed source 500154398e8eed6f6df1a3e29da9e0aa3f6ef3b4 from live 195e4972c7615b3c81043e75118e8ab9c91d2e6f. Root and candidate HTML are byte-identical: 8526887 bytes, SHA256 b9e92a752e52462a95e3b5c1fa8d2f49b2414c62215fce1df74ec0522929139a.

Each sign's static decorations share local batches while text, highlights, picking and independent motion remain intact. XR temporarily uses cached diffuse materials for eligible opaque nonmetal Standard materials; original references are restored after rendering. Desktop shading, resolution, geometry, controls, sticky grips, multi-grab, controller hands, simulation and saves are preserved.

Matched actual renderer calls: desktop 239 to 217; controller stereo 358 to 314; tracked hands 354 to 310; completed bridge 374 to 330. Stereo counts already include both eyes. Geometry is unchanged and XR shadows were already disabled. Existing controller models still add four calls and 10,978 non-monitor triangles per eye versus former shells; this patch does not hide that cost.

Fourteen native suites, eight material lifecycle checks, thirteen exact phases, 64,800 vertex/normal checks, 1,728 picking rays and 384 culling checks passed. Frozen seven-scene ABBA evidence includes all 28 valid GPU-query sets and exact raw-pixel menu/readability comparisons. Desktop PNG bytes match. Immutable files resolve misleading tool previews; no runtime workaround was made. Host timings are not Quest FPS. See qa-overlay/performance/QUEST_RENDER_REVIEW.md and the final quest-budget-interactions-20261024 evidence.

All eight hosted release assertions remain intact; workflow edits update expected hashes only. Prior kits, Shrine, licenses and .nojekyll are preserved. Clone reviewed-source.bundle on perf/quest-render-interactions to reproduce the source with the pinned dependencies. Rollback branch rollback/pre-quest-render-budget-20261024 preserves 195e4972c7615b3c81043e75118e8ab9c91d2e6f. Actual Quest acceptance remains user-tested.
