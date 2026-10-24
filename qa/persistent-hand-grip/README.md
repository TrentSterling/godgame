# Persistent hand-grip release

Publishes independently reviewed source 8e51eabecb36fd852b684461d45e9d43ba9d1f54 from live 30719b515eb4ea9ffd9287c2afeda1ab15494b3a. Root and candidate HTML are byte-identical: 8515767 bytes, SHA256 d506523947486e8f929e0bbfa0e4db75c9832747d7cf7c559b9d9d1e85141a43.

Missing tracking, source churn and callback gaps suspend an existing tracked-hand grab without a timeout. Release requires positively tracked opening greater than45mm across at least3freshsamples spanning60ms. Recovery is bounded and cannot synthesize stale throws. See qa-overlay/performance/STICKY_GRIP_REVIEW.md and evidence/.

This release excludes pending multi-grab, controller hand-model and performance changes. All eight existing hosted browser cases retain their assertions. Workflow edits change only expected artifact hashes. Prior release kits, Shrine, licenses and .nojekyll are preserved.

Clone reviewed-source.bundle on branch fix/persistent-hand-grip to reproduce the full source history. Use existing dependencies, node build.cjs, node qa/xr-village/run-checks.mjs and node qa/performance/sticky-simulation.mjs. Rollback branch rollback/pre-persistent-hand-grip-20261024 preserves 30719b515eb4ea9ffd9287c2afeda1ab15494b3a. Actual Quest tracking, release feel and compositor acceptance remain user-tested.
