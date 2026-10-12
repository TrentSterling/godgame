# Isolated Village art preview: real browser evidence

This is a test-only candidate under qa/. The root live index.html is unchanged. It uses the isolated art build over the inherited v21 Village mechanics; it is not the final integrated v22 mechanics build. Do not merge or deploy this testing PR.

Frozen candidate01 SHA-256: 19d80dfbc738c695465959e94b15318ca5cf18b49e621c98ef776b340b88d814

Two independent jobs run the exact PR head and verify the candidate hash:

- preview: startup, honest gameplay overview, raycast-verified worker selection, physical drag and Escape release, plus real Playwright WebM video
- play: visible Garden sign order and physical delivery, then a bounded ordinary brace-to-bridge route with real Shift-click Lightning when raiders appear; failure still uploads screenshots and state rather than inventing construction

All gameplay actions use actual browser mouse and keyboard inputs. Read-only QA state/projection and the supplied manual step API are used for observation and simulation advancement. The Playwright input clock is installed before page load and paused afterward to prevent slow software rendering from turning short clicks into long holds. Idle rendering samples six times per simulated second; gestures use sixty. The native physics still subdivides at 1/120 second. No HP, resource, job, worker pose, construction, outcome or camera state is written by the harness.

Uses official pinned GitHub actions and pinned Playwright 1.57.0, official Chromium, contents:read, no saved checkout credentials, no secrets or deployment. Each job is bounded to 30 minutes and its browser step to 15 minutes. Evidence always uploads, including on a failed test. Early preview artifacts are separate so they can be inspected while broader play finishes.

This is actual software-rendered browser evidence. It is not a frame-rate benchmark, HMD/WebXR proof, human-feel review, concept art, or native renderer reconstruction.
