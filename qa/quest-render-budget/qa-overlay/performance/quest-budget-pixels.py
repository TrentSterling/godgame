"""Read-only pixel validation of one immutable matched browser evidence directory.

Requires the already available Pillow/numpy environment; never launches a browser.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(sys.argv[1])
report = json.loads((root / "quest-budget-owned-fbo-browser.json").read_text())
assert report["pass"] and report["browserClosed"]
captures = {(c["variant"], c["label"]): c for c in report["captures"]}
rows = []
for label in dict.fromkeys(c["label"] for c in report["captures"]):
    pair = []
    for variant in ["baseline", "candidate"]:
        item = captures[variant, label]
        path = root / item["name"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]
        pixels = np.asarray(Image.open(path).convert("RGBA"))
        assert pixels.shape == (720, 1280, 4)
        pair.append(pixels)
    baseline, candidate = pair
    delta = np.abs(baseline.astype(np.int16) - candidate.astype(np.int16))
    if label == "desktop":
        assert np.array_equal(baseline, candidate), "Desktop canvas must be identical"
    else:
        # The fixed matched pose puts the setup menu entirely in this region.
        assert np.array_equal(baseline[70:300], candidate[70:300]), label + " menu"
        assert np.count_nonzero(baseline[70:252, :, 3]) > 40000, "Menu cannot be blank"
        # FPS line and opaque panel silhouette remain exact. Draw-call digits
        # legitimately differ on the second line and use the same panel bounds.
        assert np.array_equal(baseline[:40], candidate[:40]), label + " FPS line"
        assert np.array_equal(baseline[:70, :, 3], candidate[:70, :, 3]), label + " monitor panel"
    rows.append({
        "label": label,
        "differentPixels": int(np.count_nonzero(np.any(delta, axis=2))),
        "meanRGBDifference": float(delta[:, :, :3].mean()),
        "maxRGBDifference": int(delta[:, :, :3].max()),
        "menuDifferentPixels": int(np.count_nonzero(np.any(delta[70:300], axis=2))),
        "baselineMenuOpaquePixels": int(np.count_nonzero(baseline[70:252, :, 3])),
        "candidateMenuOpaquePixels": int(np.count_nonzero(candidate[70:252, :, 3])),
    })
print(json.dumps({"pass": True, "scope": "Exact decoded PNG pixels, not image preview cache; lighting differences reported, not hidden by a tolerance.", "rows": rows}, indent=2))
