# GODGAME bridge outline batching release

Publishes independently approved source 15d852ba9996bfb927c0f1ffc85c94a6b6b76b36, based on c845caddaa7a7c1d9da9124503b110fe2383af75 from live d66a31a8dd79852256974bb5f5a81d9bb4a087be. Root HTML and candidate.html are byte-identical: 8503720 bytes, SHA256 521b7cb719db05c838150333fc3620ca06664bfaa0aeb32ecc35c49edd115b76.

Five separately culled construction outlines share one material and each use one mesh. Opening software-WebGL world calls fall from 268 to 238 with desktop shadows and from 165 to 150 in a wide shadowless single view. Matched triangles are unchanged. Savings taper with bridge construction and disappear when all outlines are gone; this is not a Quest FPS claim. See qa-overlay/performance/SCENERY_REVIEW.md and evidence/.

All eight existing hosted browser cases retain their assertions. Workflows only update the expected HTML hash. Previous release kits, Shrine, licenses and .nojekyll remain unchanged.

## Reproduce the approved source

The bundle contains full reviewed history for deterministic baseline comparisons.

```text
git clone --branch perf/local-scenery-batches reviewed-source.bundle source
cd source
npm ci --ignore-scripts
node build.cjs
node qa/performance/bridge-batching.test.mjs
node qa/xr-village/run-checks.mjs
node qa/performance/scenery-simulation.mjs
node qa/performance/run-checks.mjs
```

The rebuilt HTML must match the exact hash above. Existing-browser measurement instructions are in the review guide. No dependency upgrade is included.

## Rollback

Branch rollback/pre-bridge-batching-20261023 preserves d66a31a8dd79852256974bb5f5a81d9bb4a087be. Revert this release integration through the normal PR workflow to restore it. Physical Quest acceptance remains the user's test.
