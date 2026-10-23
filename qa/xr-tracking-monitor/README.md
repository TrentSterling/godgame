# GODGAME XR tracking and monitor release

Publishes independently approved source 8f60f766c748f81cf665866ebdeed717104c3cba from live b13137d1b6b2c2b840c76f44ed9b29f47847d73b. Root HTML and candidate.html are byte-identical: 8512029 bytes, SHA256 1b8fc09df172f33365b6e99dff278dc79e7aa511e09242883dd0783dce24e809.

Brief pose gaps retain only existing grabs and visuals for up to 160 ms. Expiry is checked before fresh recovery; release uses combined trigger-or-squeeze intent. Invalid tracking cannot initiate grabs, activate UI or generate throws. Physical following is bounded and collision-tested. The monitor reports measured callback FPS, callback milliseconds and complete-frame draw calls, adding one draw per eye. See qa-overlay/performance/TRACKING_REVIEW.md and evidence/.

All eight existing hosted browser cases retain their assertions. Workflows change only expected HTML hashes. Previous release kits, Shrine, licenses and .nojekyll are preserved.

## Reproduce approved source

The source bundle contains full reviewed history for baseline comparisons.

```text
git clone --branch fix/xr-tracking-monitor reviewed-source.bundle source
cd source
npm ci --ignore-scripts
node build.cjs
node qa/xr-village/run-checks.mjs
node qa/performance/tracking-simulation.mjs
node qa/performance/monitor.test.mjs
node qa/performance/bridge-batching.test.mjs
node qa/performance/batching.test.mjs
```

No dependency upgrade is included. See the review guide for existing-browser tests.

## Rollback

Branch rollback/pre-xr-tracking-monitor-20261023 preserves b13137d1b6b2c2b840c76f44ed9b29f47847d73b. Revert this integration through the normal PR workflow to restore it. Physical Quest acceptance remains the user's test; native compositor disappearance is not proven fixed.
