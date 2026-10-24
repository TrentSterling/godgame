# Navigation CPU release

Publishes independently reviewed source 989940e6ed8d447f59f61ccda18a64ac0a28367b from live 2cb3d9af0f96ec3e4661983de0e2026ac51fd140. Root and candidate HTML are byte-identical: 8516233 bytes, SHA256 7fd2d69432ba5be28afbca952a128a990428826fe862b8343c6b2ec4dc65c187.

Terrain interpolation preserves exact results while avoiding temporary closures and result objects. Navigation uses scalar footprint heights when it does not need a point. Identical support/bounds callbacks share one query, reducing a complete footprint from 18 support reads to 9. There is no coordinate or frame cache; dynamic bridge state remains current.

Independent review passed 156,904 exact terrain points, 12,583 footprints, six bridge states and 13 native simulation phases with identical serialized state, physics snapshots, operation cadence and HUD. See independent-review.json and qa-overlay/performance/budget-cpu-evidence.json. Sampled allocation volume and host CPU timings are not live heap or Quest FPS.

Sticky grabs, controllers, monitor, renderer and resolution are unchanged. All eight hosted browser cases retain their assertions. Workflow changes are expected hashes only. Prior release kits, Shrine, licenses and .nojekyll are preserved.

Clone reviewed-source.bundle on perf/quest-sticky-budget to reproduce the source. With existing pinned dependencies: node build.cjs; node qa/performance/terrain-budget.test.mjs; node qa/performance/budget-simulation.mjs; node qa/xr-village/run-checks.mjs. Rollback branch rollback/pre-navigation-cpu-20261024 preserves 2cb3d9af0f96ec3e4661983de0e2026ac51fd140.
