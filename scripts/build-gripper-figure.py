"""Build the gripper-layout figure (M3 page) from the figures of Doehner et al. (2026).

The two source figures (random and Bayesian-optimised gripper layouts) render
the formed part at different scales and carry baked-in anchor labels. This
script registers both renders on their shared black target contour, removes
everything outside the sheet (labels, tick marks), makes the background
transparent and crops both to the same square frame. It also recovers the
gripper positions and orientations from the PDF placement matrices, so the
website can draw the grippers as vector glyphs on top.

Usage (from the website directory):

    python scripts/build-gripper-figure.py [path/to/gripper_frame]

Requires `pdfimages` (poppler), `mutool` (MuPDF) and Python packages numpy,
Pillow and SciPy. Writes src/assets/images/part-{random,optimised}.png and
src/data/grippers.json.
"""
import json
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'c_repo/c-proposal/figures/gripper_frame'
PDFS = {'random': 'random_grippers_v2.pdf', 'optimised': 'optimal_grippers.pdf'}
OUT = 1200  # output size in pixels (square)
PAD = 0.13  # margin around the sheets for the gripper glyphs, relative to the sheet size


def placements(pdf):
    """Part and gripper-icon transforms from `mutool trace` (device space, y pointing down)."""
    trace = subprocess.run(['mutool', 'trace', str(pdf)], capture_output=True, text=True, check=True).stdout
    rows = [
        ([float(v) for v in m.group(1).split()], int(m.group(2)))
        for m in re.finditer(r'<fill_image [^>]*transform="([^"]+)" width="(\d+)" height="(\d+)"', trace)
    ]
    part = next(t for t, w in rows if w > 1000)
    icons = [t for t, w in rows if w == 381]
    return part, icons


def components(mask):
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    return lab, ndi.find_objects(lab), ndi.sum(mask, lab, index=np.arange(1, n + 1))


def load(key, tmp):
    pdf = SRC_DIR / PDFS[key]
    subprocess.run(['pdfimages', '-png', '-f', '1', '-l', '1', str(pdf), str(tmp / key)], check=True)
    im = np.asarray(Image.open(tmp / f'{key}-000.png').convert('RGB')).astype(np.int16)
    # target contour: the dark component with the largest bounding box
    _, objs, _ = components(im.max(axis=2) < 80)
    c = max(objs, key=lambda s: (s[0].stop - s[0].start) * (s[1].stop - s[1].start))
    # sheet: the largest non-white component, holes filled
    lab, _, sizes = components(im.min(axis=2) < 238)
    sheet = ndi.binary_fill_holes(lab == int(np.argmax(sizes)) + 1)
    part, icons = placements(pdf)
    return dict(im=im, H=im.shape[0], W=im.shape[1], contour=(c[1].start, c[0].start, c[1].stop, c[0].stop),
                sheet=sheet, part=part, icons=icons)


def main():
    with tempfile.TemporaryDirectory() as t:
        data = {k: load(k, Path(t)) for k in PDFS}
    r, o = data['random'], data['optimised']

    # optimised raster -> random raster, by matching the contour bounding boxes
    rx0, ry0, rx1, ry1 = r['contour']
    ox0, oy0, ox1, oy1 = o['contour']
    s = ((rx1 - rx0) / (ox1 - ox0) + (ry1 - ry0) / (oy1 - oy0)) / 2
    to_r = {'random': lambda x, y: (x, y), 'optimised': lambda x, y: (rx0 + (x - ox0) * s, ry0 + (y - oy0) * s)}

    # square frame around both sheets, in random-raster coordinates
    corners = []
    for k, d in data.items():
        ys, xs = np.nonzero(d['sheet'])
        corners += [to_r[k](xs.min(), ys.min()), to_r[k](xs.max(), ys.max())]
    xs, ys = zip(*corners)
    side = max(max(xs) - min(xs), max(ys) - min(ys))
    size = side * (1 + 2 * PAD)
    fx = (min(xs) + max(xs)) / 2 - size / 2
    fy = (min(ys) + max(ys)) / 2 - size / 2

    grippers = {}
    for k, d in data.items():
        img = Image.fromarray(np.dstack([d['im'].astype(np.uint8), (d['sheet'] * 255).astype(np.uint8)]), 'RGBA')
        img.putalpha(img.getchannel('A').filter(ImageFilter.GaussianBlur(1.2)))
        scale = 1 if k == 'random' else 1 / s
        x0 = fx if k == 'random' else ox0 + (fx - rx0) / s
        y0 = fy if k == 'random' else oy0 + (fy - ry0) / s
        k_px = size / OUT * scale
        img.transform((OUT, OUT), Image.AFFINE, (k_px, 0, x0, 0, k_px, y0), resample=Image.BICUBIC).save(
            ROOT / f'src/assets/images/part-{k}.png', optimize=True)

        A, _, _, D, E, F = d['part']
        items = []
        for a, b, c, dd, e, f in d['icons']:
            cx, cy = a * 0.5 + c * 0.5 + e, b * 0.5 + dd * 0.5 + f  # icon centre
            px, py = to_r[k]((cx - E) / A * d['W'], (cy - F) / D * d['H'])
            icon = math.hypot(a, b) / A * d['W'] * (s if k == 'optimised' else 1)
            items.append(dict(x=round((px - fx) / size, 4), y=round((py - fy) / size, 4),
                              rot=round(math.degrees(math.atan2(b, a))) % 360, size=round(icon / size, 4)))
        grippers[k] = items

    (ROOT / 'src/data/grippers.json').write_text(json.dumps(grippers, indent=1) + '\n')
    print('wrote part-random.png, part-optimised.png and grippers.json')


if __name__ == '__main__':
    main()
