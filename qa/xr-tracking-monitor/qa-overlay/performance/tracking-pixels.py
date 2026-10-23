from pathlib import Path
from PIL import Image
import numpy as np
import json

out = Path(__file__).parent / 'generated'
rows = []
for view, rect in [('desktop', (990, 50, 1280, 105)), ('xr', (535, 15, 745, 65))]:
    before = np.array(Image.open(out / f'baseline-tracking-{view}.png').convert('RGB'))
    after = np.array(Image.open(out / f'candidate-tracking-{view}.png').convert('RGB'))
    assert before.shape == after.shape == (720, 1280, 3)
    changed = np.any(before != after, axis=2)
    x1, y1, x2, y2 = rect
    outside = changed.copy()
    outside[y1:y2, x1:x2] = False
    rows.append(dict(view=view, changedPixels=int(changed.sum()), outsideMonitorPixels=int(outside.sum()), monitorMask=rect))
    assert not outside.any(), rows[-1]
report = dict(passed=True, scope='Exact same world pixels outside explicit monitor rectangles; synthetic XR and software WebGL, not headset evidence.', rows=rows)
(out / 'tracking-pixels.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
