# GODGAME reviewed performance release

Publishes exact reviewed source c845caddaa7a7c1d9da9124503b110fe2383af75, retaining the preceding hand/UI fix. Root HTML and candidate.html are identical: 8503547 bytes, SHA256 02362b3e8a92a4225ca05ec01377928b00de266a4354bdbf63cd41869e5dbf1d.

Small garden and quarry batches reduce measured software-WebGL opening world calls from 322 to 268 with desktop shadows, and 192 to 165 in a wide shadowless single view. Matched triangle counts are unchanged. This is not Quest FPS evidence. CPU cleanup preserves simulation cadence and complete deterministic gameplay state. See qa-overlay/performance/REVIEW.md and evidence/.

The existing eight required browser cases retain all assertions. Workflow edits only update the accepted artifact hash. Shrine, licenses, prior candidate kits and .nojekyll are preserved. Deployment is established separately by Pages and the public witness.

## Reproduce the reviewed source

reviewed-source.bundle preserves the exact reviewed source and its short local history so the baseline-comparison tests can resolve historical commits. Clone the bundle, verify HEAD c845caddaa7a7c1d9da9124503b110fe2383af75, then use the pinned lockfile:

```text
git clone --branch perf/xr-frame-work reviewed-source.bundle source
cd source
npm ci --ignore-scripts
node build.cjs
node qa/xr-village/run-checks.mjs
node qa/performance/run-checks.mjs
node qa/performance/batching.test.mjs
```

The build must match the hash above. Browser measurement is optional and requires an existing browser installation; reproduction details are in the review. The readable source overlay and source-changes.patch cover only this performance pass; prior hand/UI source is retained in its existing release kit.

## Rollback

The prior live release 02e7fdeff0d856b9c7868bfe75051258d3469c2a is preserved by rollback/pre-performance-20261023. Revert this release integration through the ordinary PR route to restore it. Physical Quest acceptance remains the user's test.

