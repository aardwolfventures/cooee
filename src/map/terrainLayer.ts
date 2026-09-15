/**
 * Shaded relief and contours drawn from the loaded elevation model.
 *
 * This sits underneath the Forestry Corporation sheet and shows through
 * wherever that sheet is dialled back or has not loaded. Both come off local
 * assets, so the map works with no network at all — which matters for an app
 * whose entire subject is being somewhere without one.
 *
 * It reads the same real DEM as the cross-sections and walk times, so the
 * relief, the printed 20 m contours and the quoted climb all describe the same
 * hillside.
 */
import L from 'leaflet'
import { elevationAt } from '@/sim/terrain'
import { demBounds, isDemLoaded } from '@/sim/dem'

const TILE_PX = 256
/** Elevation samples per tile edge. Upscaled to the tile, which shaded relief
 *  tolerates well and which keeps a tile under a few milliseconds on a phone. */
const GRID = 128

/** Ground metres per pixel at zoom 0, for 256 px tiles. */
const EQUATOR_M_PER_PX = 156543.03392

/**
 * Sun from the north-west at 45 degrees, in (east, south, up).
 *
 * The cartographic convention, and not a free choice: relief lit from the
 * other quarters is read as inverted by most people, ridges becoming gullies.
 * This used to carry +0.5 on the south axis, which lit the country from the
 * south-west while the comment above it claimed north-west.
 */
const SUN = { east: -0.5, south: -0.5, up: Math.SQRT1_2 }

/**
 * How far apart the contours are, by zoom.
 *
 * Twenty metres is right for a 1:50,000 sheet held at arm's length and wrong
 * for a phone showing five kilometres across, where it collapses into a
 * texture that reads as camouflage rather than landform. Every interval here
 * is a multiple of twenty, so every line drawn is also a line on the printed
 * sheet rather than a near-miss beside one.
 */
function contourInterval(zoom: number): number {
  if (zoom >= 14) {
    return 20
  }
  if (zoom === 13) {
    return 40
  }
  if (zoom === 12) {
    return 80
  }
  return 160
}

/**
 * The band of country the ramp spreads itself across.
 *
 * Measured from the grid rather than guessed: the full range is 496-1371 m,
 * but that is the Abercrombie gorge floor and the highest tops, and the middle
 * ninety per cent of the sheet sits between 788 and 1249. Stretching the ramp
 * over the extremes spent most of its contrast on country nobody walks.
 */
const ELEV_MIN = 620
const ELEV_MAX = 1330

interface Stop {
  at: number
  rgb: [number, number, number]
}

/** Valley floor through to pale tops. Muted, so bright mate dots stay loudest. */
const RAMP: Stop[] = [
  { at: 0.0, rgb: [47, 58, 42] },
  { at: 0.35, rgb: [68, 76, 48] },
  { at: 0.62, rgb: [96, 92, 63] },
  { at: 0.82, rgb: [124, 116, 88] },
  { at: 1.0, rgb: [152, 146, 124] },
]

function rampColour(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t))
  for (let i = 1; i < RAMP.length; i += 1) {
    const lo = RAMP[i - 1]!
    const hi = RAMP[i]!
    if (clamped <= hi.at) {
      const span = hi.at - lo.at
      const k = span === 0 ? 0 : (clamped - lo.at) / span
      return [
        lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * k,
        lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * k,
        lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * k,
      ]
    }
  }
  return RAMP[RAMP.length - 1]!.rgb
}

function tileToLon(worldX: number, scale: number): number {
  return (worldX / scale) * 360 - 180
}

function tileToLat(worldY: number, scale: number): number {
  const n = Math.PI - (2 * Math.PI * worldY) / scale
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/**
 * Only draw where the elevation model actually has data.
 *
 * This used to be a box hardcoded around the Vulcan camp, which was correct
 * only for as long as there was exactly one elevation model and it sat there.
 * Reading the loaded grid's own extent means the relief follows the data: build
 * a model for different country and the layer draws over that country instead,
 * with nothing to keep in step by hand.
 *
 * The check matters because `sampleElevation` clamps outside the grid. Drawn
 * anyway, the edge values would smear the border colour across the rest of the
 * world — a shaded hillside stretching to the horizon, describing nothing.
 */
function hasData(coords: L.Coords): boolean {
  if (!isDemLoaded()) {
    return false
  }
  const bounds = demBounds()
  const scale = TILE_PX * 2 ** coords.z
  const west = tileToLon(coords.x * TILE_PX, scale)
  const east = tileToLon((coords.x + 1) * TILE_PX, scale)
  const north = tileToLat(coords.y * TILE_PX, scale)
  const south = tileToLat((coords.y + 1) * TILE_PX, scale)
  return (
    east >= bounds.west &&
    west <= bounds.east &&
    north >= bounds.south &&
    south <= bounds.north
  )
}

const TerrainGridLayer = L.GridLayer.extend({
  createTile(this: L.GridLayer, coords: L.Coords): HTMLCanvasElement {
    const tile = document.createElement('canvas')
    tile.width = TILE_PX
    tile.height = TILE_PX
    const ctx = tile.getContext('2d')
    if (ctx === null || !hasData(coords)) {
      return tile
    }

    const scale = TILE_PX * 2 ** coords.z
    const step = TILE_PX / GRID
    const interval = contourInterval(coords.z)
    // Ground distance between samples at this tile's latitude, which is what
    // turns a height difference into a slope.
    const midLat = tileToLat(coords.y * TILE_PX + TILE_PX / 2, scale)
    const sampleM =
      ((EQUATOR_M_PER_PX * Math.cos((midLat * Math.PI) / 180)) / 2 ** coords.z) * step

    // One extra row and column so every cell has a neighbour to difference
    // against; without it the tile edges would show as seams in the shading.
    const elevations = new Float32Array((GRID + 1) * (GRID + 1))
    // Whether each sample is real ground or an edge value. `hasData` only asks
    // whether a whole tile overlaps the model, which is true of an enormous
    // tile that is almost entirely outside it — and `elevationAt` clamps out
    // there, so those samples take the border height and smear it across the
    // rest of the tile in long stripes. Masking per sample is the only honest
    // answer: draw the ground that was measured and nothing else.
    const measured = new Uint8Array((GRID + 1) * (GRID + 1))
    const bounds = demBounds()
    for (let gy = 0; gy <= GRID; gy += 1) {
      const lat = tileToLat(coords.y * TILE_PX + gy * step, scale)
      const latInside = lat <= bounds.north && lat >= bounds.south
      for (let gx = 0; gx <= GRID; gx += 1) {
        const lon = tileToLon(coords.x * TILE_PX + gx * step, scale)
        const index = gy * (GRID + 1) + gx
        elevations[index] = elevationAt({ lat, lon })
        measured[index] = latInside && lon >= bounds.west && lon <= bounds.east ? 1 : 0
      }
    }

    const image = ctx.createImageData(GRID, GRID)
    const data = image.data

    for (let gy = 0; gy < GRID; gy += 1) {
      for (let gx = 0; gx < GRID; gx += 1) {
        const at = gy * (GRID + 1) + gx
        const rightOf = at + 1
        const belowOf = (gy + 1) * (GRID + 1) + gx
        // Every sample the shading reads has to be real, or the cell is left
        // transparent. createImageData starts zeroed, so skipping is enough.
        if (measured[at] === 0 || measured[rightOf] === 0 || measured[belowOf] === 0) {
          continue
        }
        const here = elevations[at]!
        const right = elevations[rightOf]!
        const below = elevations[belowOf]!

        // Rise between samples, in metres, and the same thing as a true slope.
        // Dividing by the ground distance is what was missing: without it the
        // normal was built from raw metres of rise with no idea how far apart
        // the samples were, so it lay almost flat and pinned to one clamp or
        // the other on any real hillside — noise rather than landform.
        const dzdx = right - here
        const dzdy = below - here
        const nx = -dzdx / sampleM
        const ny = -dzdy / sampleM
        const length = Math.sqrt(nx * nx + ny * ny + 1)
        const dot = (nx * SUN.east + ny * SUN.south + SUN.up) / length
        // Flat ground returns exactly SUN.up, so this puts it at 1 and leaves
        // its ramp colour alone. Only slope darkens or lifts it.
        const shade = Math.min(1.5, Math.max(0.3, dot / SUN.up))

        const [r, g, b] = rampColour((here - ELEV_MIN) / (ELEV_MAX - ELEV_MIN))

        // Contours, drawn as a band whose width scales with the local gradient
        // so lines stay an even thickness instead of pooling on flat ground.
        //
        // Capped as a fraction of the interval as well. The gradient is the
        // rise between samples, and samples are further apart the further you
        // zoom out — at five hundred metres apart the band grew to a third of
        // the whole interval, which stops being a line and becomes a wash that
        // darkens the country and hides the shading underneath it.
        const gradient = Math.hypot(dzdx, dzdy)
        const band = Math.min(gradient * 0.55, interval * 0.08)
        const into = ((here % interval) + interval) % interval
        const toLine = Math.min(into, interval - into)
        const onContour = gradient > 0.01 && toLine < band
        const ink = onContour ? 0.6 : 1

        const offset = (gy * GRID + gx) * 4
        data[offset] = Math.min(255, r * shade * ink)
        data[offset + 1] = Math.min(255, g * shade * ink)
        data[offset + 2] = Math.min(255, b * shade * ink)
        data[offset + 3] = 255
      }
    }

    // Paint the small grid, then let the browser smooth it up to tile size.
    const scratch = document.createElement('canvas')
    scratch.width = GRID
    scratch.height = GRID
    scratch.getContext('2d')?.putImageData(image, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(scratch, 0, 0, TILE_PX, TILE_PX)

    return tile
  },
})

export function createTerrainLayer(): L.GridLayer {
  return new (TerrainGridLayer as unknown as new (options?: L.GridLayerOptions) => L.GridLayer)({
    tileSize: TILE_PX,
    minZoom: 9,
    maxZoom: 17,
  })
}
