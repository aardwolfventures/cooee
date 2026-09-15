# Building the map and terrain assets

The app ships two generated assets, both committed to `public/`:

| Asset | What | Size |
| --- | --- | --- |
| `public/terrain/elevation.bin.gz` | ~30 m elevation grid over the sheet | 1.25 MB |
| `public/map/{z}/{x}/{y}.png` | the Forestry sheet as web-mercator tiles, z11-z14 | 12 MB |

They change only if the map sheet changes, so this is not part of `pnpm build`.
It is recorded here because the app now ships derived data, and derived data
with no recipe is data nobody can check.

## Inputs

- **`CH_VULCAN-70.PDF`** — the Forestry Corporation of NSW hunting map for
  Vulcan State Forest, 1:50,000, GDA94 / MGA zone 55, 20 m contours. A GeoPDF:
  the georeferencing is embedded in the page's `/Viewport` `/Measure` `/GPTS`
  and `/LPTS` arrays and is read straight out of the file, not fitted by hand.
  **The supplied sheet expired 31 March 2023.** Its hunting-exclusion zoning is
  therefore not current — see the note in the main README.
- **AWS Terrain Tiles** (`terrarium`), SRTM-derived, from the AWS Open Data
  registry. Sampled at z12, ~31.7 m at this latitude, which is the resolution
  the underlying SRTM actually carries; finer zooms only interpolate.

## Running it

Needs Python with `pymupdf`, `pillow`, `numpy` and `pyproj`:

```sh
pip install pymupdf pillow numpy pyproj
python3 scripts/data/build_assets.py path/to/CH_VULCAN-70.PDF
```

### Elevation only, anywhere

The elevation step needs no PDF — it fetches terrain tiles for a box. This
builds the grid on its own, over country of your choosing:

```sh
python3 scripts/data/build_assets.py --dem south,west,north,east
python3 scripts/data/build_assets.py --dem -34.2,149.4,-33.5,150.1
```

It prints the box in kilometres before fetching anything, and refuses a box
needing more than 400 source tiles, on the grounds that one that large is more
likely a typo than an intention.

This exists to make the relief layer testable. It is the one thing the app can
always draw, and the question of whether shaded relief and contours are enough
on their own to walk to someone cannot be answered over country you only know
through the sheet lying on top of it.

The party is positioned relative to `ORIGIN` in `src/sim/terrain.ts`, so a grid
built somewhere else draws relief where the mates are not. The command prints
the `ORIGIN` line to paste if you want to move them onto it.

## How the sheet is warped

The four `/GPTS` corners project to a rectangle in MGA zone 55 that closes to
within 0.8 m over 40 km, so the sheet-to-ground transform is an exact affine in
that projection rather than an approximation. Tiles are then resampled from a
mip pyramid — one level per zoom — so z11 is box-filtered down rather than
point-sampled out of a 7 m/px raster.

Re-running this reproduces the elevation grid byte for byte. The tiles come out
visually identical but not byte-identical: Pillow's octree quantiser picks
slightly different palettes between runs, so a few per cent of antialiased
pixels land in a neighbouring bucket. Expect a large diff and no visible change.

Alignment was checked against the elevation model, which comes from a
completely independent source: the sheet's drawn creek lines sit at the 30th
percentile of local elevation where a random point sits at the 48th, and that
signal decays to the random baseline once the sheet is nudged 250 m in any
direction. The two datasets agree on where the gullies are.
