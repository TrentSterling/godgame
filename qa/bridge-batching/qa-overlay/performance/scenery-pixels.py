import json
from pathlib import Path
import numpy as np
from PIL import Image

out = Path(__file__).parent / 'generated'
rows = []
for before in sorted(out.glob('baseline-bridge-*.png')):
    after = before.with_name(before.name.replace('baseline-', 'candidate-', 1))
    a, b = np.asarray(Image.open(before).convert('RGBA')), np.asarray(Image.open(after).convert('RGBA'))
    assert a.shape == b.shape
    delta = np.abs(a.astype(np.int16) - b.astype(np.int16))
    rows.append(dict(view=before.stem.removeprefix('baseline-'), pixels=int(a.shape[0]*a.shape[1]), changedPixels=int(np.any(delta, axis=2).sum()), maxChannelDifference=int(delta.max()), meanAbsoluteChannelDifference=float(delta.mean())))
assert len(rows) == 8
report = dict(scope='Eight matched screenshots: four bridge construction states and two camera/shadow configurations. Pixel differences are reported, not hidden by a tolerance.', rows=rows)
(out/'scenery-pixels.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
