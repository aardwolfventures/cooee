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
import { ORIGIN } from '@/sim/terrain'

const TILE_PX = 256
/** Elevation samples per tile edge. Upscaled to the tile, which shaded relief
 *  tolerates well and which keeps a tile under a few milliseconds on a phone. */
const GRID = 128
/** Matches the printed sheet, so the drawn lines and the sheet's own agree. */
const CONTOUR_INTERVAL_M = 20

/** Only draw where the elevation model actually has data. Outside the sheet
 *  every sample clamps to the edge, which would smear the border colour across
 *  the rest of the world. */
const AOI_HALF_LAT = 0.26
const AOI_HALF_LON = 0.24

/** The sheet's real range: the Abercrombie gorge floor to the highest tops. */
const ELEV_MIN = 490
const ELEV_MAX = 1380

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

function nearAoi(coords: L.Coords): boolean {
  const scale = TILE_PX * 2 ** coords.z
  const west = tileToLon(coords.x * TILE_PX, scale)
  const east = tileToLon((coords.x + 1) * TILE_PX, scale)
  const north = tileToLat(coords.y * TILE_PX, scale)
  const south = tileToLat((coords.y + 1) * TILE_PX, scale)
  return (
    east >= ORIGIN.lon - AOI_HALF_LON &&
    west <= ORIGIN.lon + AOI_HALF_LON &&
    north >= ORIGIN.lat - AOI_HALF_LAT &&
    south <= ORIGIN.lat + AOI_HALF_LAT
  )
}

const TerrainGridLayer = L.GridLayer.extend({
  createTile(this: L.GridLayer, coords: L.Coords): HTMLCanvasElement {
    const tile = document.createElement('canvas')
    tile.width = TILE_PX
    tile.height = TILE_PX
    const ctx = tile.getContext('2d')
    if (ctx === null || !nearAoi(coords)) {
      return tile
    }

    const scale = TILE_PX * 2 ** coords.z
    const step = TILE_PX / GRID

    // One extra row and column so every cell has a neighbour to difference
    // against; without it the tile edges would show as seams in the shading.
    const elevations = new Float32Array((GRID + 1) * (GRID + 1))
    for (let gy = 0; gy <= GRID; gy += 1) {
      const lat = tileToLat(coords.y * TILE_PX + gy * step, scale)
      for (let gx = 0; gx <= GRID; gx += 1) {
        const lon = tileToLon(coords.x * TILE_PX + gx * step, scale)
        elevations[gy * (GRID + 1) + gx] = elevationAt({ lat, lon })
      }
    }

    const image = ctx.createImageData(GRID, GRID)
    const data = image.data

    for (let gy = 0; gy < GRID; gy += 1) {
      for (let gx = 0; gx < GRID; gx += 1) {
        const here = elevations[gy * (GRID + 1) + gx]!
        const right = elevations[gy * (GRID + 1) + gx + 1]!
        const below = elevations[(gy + 1) * (GRID + 1) + gx]!

        const dzdx = right - here
        const dzdy = below - here

        // Sun from the north-west at roughly 45 degrees, the cartographic
        // convention — relief read under any other lighting inverts.
        const nx = -dzdx
        const ny = -dzdy
        const nz = 1.2
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
        const shade = Math.min(
          1.35,
          Math.max(0.45, ((nx * -0.5 + ny * 0.5 + nz * 0.707) / length) * 1.5),
        )

        const [r, g, b] = rampColour((here - ELEV_MIN) / (ELEV_MAX - ELEV_MIN))

        // Contours, drawn as a band whose width scales with the local gradient
        // so lines stay an even thickness instead of pooling on flat ground.
        const gradient = Math.hypot(dzdx, dzdy)
        const into = ((here % CONTOUR_INTERVAL_M) + CONTOUR_INTERVAL_M) % CONTOUR_INTERVAL_M
        const toLine = Math.min(into, CONTOUR_INTERVAL_M - into)
        const onContour = gradient > 0.01 && toLine < gradient * 0.55
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
