"""
Build the elevation grid and the map tiles from the Forestry Corporation GeoPDF.

See README.md in this directory for what this produces and why. Run from the
repository root:

    python3 scripts/data/build_assets.py path/to/CH_VULCAN-70.PDF
"""
import gzip
import json
import math
import os
import re
import sys
import urllib.request

import numpy as np
import pymupdf
from PIL import Image
from pyproj import Transformer

DEM_ZOOM = 12                      # ~31.7 m here, which is what SRTM carries
TILE_ZOOMS = (11, 12, 13, 14)      # z14 is ~7.9 m; the sheet is 1:50,000
SHEET_DPI = 180                    # ~7.05 m/px, just finer than z14
PALETTE = 128                      # line art and flat fills; 128 is lossless-looking
TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
OUT_TERRAIN = 'public/terrain'
OUT_MAP = 'public/map'


def read_georeference(path):
    """Pull the GeoPDF corner registration straight out of the file.

    Read from the original bytes, not from a re-serialised copy: PyMuPDF may
    repack these objects into compressed streams, where the arrays are no
    longer findable as text.
    """
    raw = open(path, 'rb').read()
    gpts = re.search(rb'/GPTS\s*\[([^\]]*)\]', raw)
    lpts = re.search(rb'/LPTS\s*\[([^\]]*)\]', raw)
    bbox = re.search(rb'/Viewport.{0,120}?/BBox\s*\[([^\]]*)\]', raw, re.S)
    if not (gpts and lpts and bbox):
        raise SystemExit('no GeoPDF registration found — is this the right sheet?')
    g = [float(v) for v in gpts.group(1).split()]
    b = [float(v) for v in bbox.group(1).split()]
    corners = list(zip(g[0::2], g[1::2]))            # (lat, lon), LPTS order
    return corners, b


def sheet_frame(corners):
    """The sheet's extent in MGA zone 55, where it is a true rectangle."""
    to55 = Transformer.from_crs('EPSG:4283', 'EPSG:28355', always_xy=True)
    pts = [to55.transform(lon, lat) for lat, lon in corners]
    # LPTS order is (0,1) (0,0) (1,0) (1,1): south-west, north-west, north-east, south-east
    (_, _), (e_nw, n_nw), (e_ne, _), (_, n_sw) = pts
    width = e_ne - e_nw
    height = n_nw - n_sw
    closure = max(abs(pts[1][1] - pts[2][1]), abs(pts[0][0] - pts[1][0]))
    if closure > 5:
        raise SystemExit(f'sheet is not rectangular in MGA55 (closes to {closure:.1f} m)')
    print(f'sheet {width/1000:.1f} x {height/1000:.1f} km, closes to {closure:.2f} m')
    return e_nw, n_nw, width, height


def lonlat_to_tile(lon, lat, z):
    r = math.radians(lat)
    return ((lon + 180) / 360 * 2 ** z,
            (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z)


def build_elevation(bounds):
    """Fetch terrarium tiles over the sheet and write the packed grid."""
    west, east, south, north = bounds
    x0, x1 = int(lonlat_to_tile(west, north, DEM_ZOOM)[0]), int(lonlat_to_tile(east, south, DEM_ZOOM)[0])
    y0, y1 = int(lonlat_to_tile(west, north, DEM_ZOOM)[1]), int(lonlat_to_tile(east, south, DEM_ZOOM)[1])
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256, 3), dtype=np.uint8)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            url = TERRARIUM.format(z=DEM_ZOOM, x=x, y=y)
            with urllib.request.urlopen(url, timeout=60) as response:
                tile = Image.open(response).convert('RGB')
            mosaic[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = np.array(tile)

    ox, oy = x0 * 256, y0 * 256
    px0, px1 = lonlat_to_tile(west, north, DEM_ZOOM)[0] * 256, lonlat_to_tile(east, south, DEM_ZOOM)[0] * 256
    py0, py1 = lonlat_to_tile(west, north, DEM_ZOOM)[1] * 256, lonlat_to_tile(east, south, DEM_ZOOM)[1] * 256
    c0, c1 = int(math.floor(px0 - ox)), int(math.ceil(px1 - ox))
    r0, r1 = int(math.floor(py0 - oy)), int(math.ceil(py1 - oy))
    crop = mosaic[r0:r1, c0:c1].astype(np.float64)
    elevation = (crop[:, :, 0] * 256 + crop[:, :, 1] + crop[:, :, 2] / 256) - 32768
    grid = np.round(elevation).astype('<i2')

    # Delta along each row before gzip: the grid is smooth, so the differences
    # are tiny and compress to about half what the raw values do.
    delta = grid.copy()
    delta[:, 1:] = grid[:, 1:] - grid[:, :-1]

    os.makedirs(OUT_TERRAIN, exist_ok=True)
    with open(f'{OUT_TERRAIN}/elevation.bin.gz', 'wb') as handle:
        handle.write(gzip.compress(delta.tobytes(), 9))
    meta = {
        'encoding': 'terrarium',
        'zoom': DEM_ZOOM,
        'pixelOriginX': ox + c0,
        'pixelOriginY': oy + r0,
        'width': int(grid.shape[1]),
        'height': int(grid.shape[0]),
        'source': 'AWS Terrain Tiles (terrarium), SRTM-derived, ~30 m',
        'format': 'int16-le row-delta, gzip',
    }
    json.dump(meta, open(f'{OUT_TERRAIN}/elevation.json', 'w'), indent=2)
    print(f'elevation {grid.shape[1]}x{grid.shape[0]}, {grid.min()}-{grid.max()} m')


def build_tiles(page, clip, frame):
    """Render the map frame once, then resample it into web-mercator tiles."""
    e0, n0, width_m, height_m = frame
    pix = page.get_pixmap(clip=clip, dpi=SHEET_DPI, colorspace=pymupdf.csRGB)
    sheet = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    print(f'sheet raster {pix.width}x{pix.height}, {width_m/pix.width:.2f} m/px')

    mips = [sheet]
    while min(mips[-1].shape[:2]) > 8:
        current = mips[-1]
        h, w = current.shape[0] // 2 * 2, current.shape[1] // 2 * 2
        mips.append(current[:h, :w].reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3)).astype(np.uint8))

    to55 = Transformer.from_crs('EPSG:3857', 'EPSG:28355', always_xy=True)
    radius = 6378137.0
    west, east, south, north = sheet_bounds
    total = 0
    for z in TILE_ZOOMS:
        x0, x1 = int(lonlat_to_tile(west, north, z)[0]), int(lonlat_to_tile(east, south, z)[0])
        y0, y1 = int(lonlat_to_tile(west, north, z)[1]), int(lonlat_to_tile(east, south, z)[1])
        tile_res = 2 * math.pi * radius / 2 ** z / 256 * math.cos(math.radians((north + south) / 2))
        level = max(0, min(len(mips) - 1, int(math.floor(math.log2(max(1e-9, tile_res / (width_m / pix.width)))))))
        mip = mips[level]
        mh, mw = mip.shape[:2]
        span = 2 * math.pi * radius / 2 ** z
        for tx in range(x0, x1 + 1):
            for ty in range(y0, y1 + 1):
                xmin = -math.pi * radius + tx * span
                ymax = math.pi * radius - ty * span
                xs = xmin + (np.arange(256) + 0.5) * span / 256
                ys = ymax - (np.arange(256) + 0.5) * span / 256
                gx, gy = np.meshgrid(xs, ys)
                e, n = to55.transform(gx.ravel(), gy.ravel())
                u, v = (e - e0) / width_m, (n0 - n) / height_m
                inside = (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
                if not inside.any():
                    continue
                sx = np.clip((u * mw).astype(np.int32), 0, mw - 1)
                sy = np.clip((v * mh).astype(np.int32), 0, mh - 1)
                out = np.zeros((256 * 256, 4), dtype=np.uint8)
                out[:, :3] = mip[sy, sx]
                out[inside, 3] = 255
                image = Image.fromarray(out.reshape(256, 256, 4), 'RGBA')
                image = image.quantize(colors=PALETTE, method=Image.FASTOCTREE, dither=Image.NONE)
                folder = f'{OUT_MAP}/{z}/{tx}'
                os.makedirs(folder, exist_ok=True)
                image.save(f'{folder}/{ty}.png', optimize=True)
                total += 1
        print(f'  z{z}: mip{level}, {total} tiles so far')
    print(f'{total} tiles')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    doc = pymupdf.open(sys.argv[1])
    page = doc[0]
    corners, bbox = read_georeference(sys.argv[1])
    lats = [c[0] for c in corners]
    lons = [c[1] for c in corners]
    sheet_bounds = (min(lons), max(lons), min(lats), max(lats))
    frame = sheet_frame(corners)
    height = page.rect.height
    clip = pymupdf.Rect(bbox[0], height - bbox[1], bbox[2], height - bbox[3])
    build_elevation(sheet_bounds)
    build_tiles(page, clip, frame)
