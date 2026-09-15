/**
 * Real elevation for the Vulcan State Forest sheet.
 *
 * The prototype used to compute elevation from a hand-built surface shaped
 * like the Wonnangatta Valley. That was honest while the map was a synthetic
 * one, but the base map is now a real 1:50,000 sheet over real country, and a
 * fake surface underneath a real map is worse than either on its own: the
 * cross-sections and walk times would describe terrain that the map visibly
 * contradicts.
 *
 * So this loads an actual digital elevation model — SRTM-derived, roughly 30 m
 * posts — covering exactly the sheet's extent. The grid is stored as 16-bit
 * metres, delta-encoded along each row and gzipped, which is both smaller than
 * the equivalent PNG and decodable with nothing but standard platform APIs, so
 * the browser and the test runner share one code path.
 *
 * Sampling is bilinear. The posts are ~32 m apart and a cross-section asks for
 * 64 samples over a few kilometres, so nearest-neighbour would show as visible
 * stair-stepping on the profile.
 */
import type { LatLon } from '@/lib/geo'

export interface DemMeta {
  /** Web Mercator zoom the grid was sampled at. */
  zoom: number
  /** Grid origin, in whole pixels of that zoom's global pixel plane. */
  pixelOriginX: number
  pixelOriginY: number
  width: number
  height: number
  source: string
}

/**
 * Where the bytes come from. The only I/O boundary in this module: the browser
 * fetches over HTTP and the tests read from disk, and everything downstream —
 * decoding, sampling, every elevation the app shows — is the same code either
 * way.
 */
export interface DemSource {
  meta: () => Promise<DemMeta>
  /** The gzipped, row-delta-encoded grid. */
  body: () => Promise<Uint8Array>
}

let grid: Int16Array | null = null
let loaded: DemMeta | null = null

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Undo the per-row delta encoding, in place. */
function undelta(values: Int16Array, width: number, height: number): void {
  for (let row = 0; row < height; row += 1) {
    const base = row * width
    for (let col = 1; col < width; col += 1) {
      values[base + col] = (values[base + col]! + values[base + col - 1]!) as number
    }
  }
}

export async function loadDem(source: DemSource): Promise<void> {
  const meta = await source.meta()
  const raw = await gunzip(await source.body())
  const expected = meta.width * meta.height * 2
  if (raw.byteLength !== expected) {
    throw new Error(`elevation grid is ${raw.byteLength} bytes, expected ${expected}`)
  }
  // The buffer is little-endian int16; every platform this runs on is too.
  const values = new Int16Array(raw.buffer, raw.byteOffset, meta.width * meta.height)
  undelta(values, meta.width, meta.height)
  grid = values
  loaded = meta
}

export function isDemLoaded(): boolean {
  return grid !== null
}

/** The DEM as served to the browser, relative to the app's base URL. */
export function httpDemSource(baseUrl: string): DemSource {
  const root = `${baseUrl.replace(/\/$/, '')}/terrain`
  return {
    meta: async () => {
      const res = await fetch(`${root}/elevation.json`)
      if (!res.ok) {
        throw new Error(`elevation.json: ${res.status}`)
      }
      return (await res.json()) as DemMeta
    },
    body: async () => {
      const res = await fetch(`${root}/elevation.bin.gz`)
      if (!res.ok) {
        throw new Error(`elevation.bin.gz: ${res.status}`)
      }
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}

/**
 * The grid carried inside the single-file standalone build, where there is no
 * server to fetch from. Absent in every normal build.
 */
export function inlineDemSource(): DemSource | null {
  const carried = (globalThis as { __COOEE_DEM__?: { meta: DemMeta; body: string } }).__COOEE_DEM__
  if (carried === undefined) {
    return null
  }
  return {
    meta: async () => carried.meta,
    body: async () => {
      const binary = atob(carried.body)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    },
  }
}

function requireDem(): { values: Int16Array; meta: DemMeta } {
  if (grid === null || loaded === null) {
    throw new Error('elevation model not loaded — await loadDem() before reading elevation')
  }
  return { values: grid, meta: loaded }
}

/** Position in the grid's own pixel space, fractional. */
function toGrid(p: LatLon, meta: DemMeta): { x: number; y: number } {
  const scale = 2 ** meta.zoom * 256
  const rad = (p.lat * Math.PI) / 180
  const merc = Math.log(Math.tan(rad) + 1 / Math.cos(rad))
  return {
    x: ((p.lon + 180) / 360) * scale - meta.pixelOriginX,
    y: ((1 - merc / Math.PI) / 2) * scale - meta.pixelOriginY,
  }
}

/**
 * Metres above sea level, bilinearly interpolated. Points outside the sheet
 * clamp to its edge rather than throwing: the map can be panned past the
 * extent, and an edge value keeps the relief layer continuous instead of
 * punching a hole in it.
 */
export function sampleElevation(p: LatLon): number {
  const { values, meta } = requireDem()
  const { x, y } = toGrid(p, meta)
  const cx = Math.min(Math.max(x, 0), meta.width - 1.001)
  const cy = Math.min(Math.max(y, 0), meta.height - 1.001)
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const fx = cx - x0
  const fy = cy - y0
  const row = y0 * meta.width
  const next = (y0 + 1) * meta.width
  const a = values[row + x0]!
  const b = values[row + x0 + 1]!
  const c = values[next + x0]!
  const d = values[next + x0 + 1]!
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

/**
 * Is this point actually covered by the elevation model?
 *
 * Everything terrain-derived — the relief layer, cross-sections, slope-adjusted
 * walk times — is only as real as the grid underneath it, and the grid covers
 * one area. `sampleElevation` deliberately clamps outside it rather than
 * throwing, which keeps the relief continuous but means a point off the edge
 * gets a plausible number that describes the border, not the ground. Anything
 * that would present such a number to a person should ask this first.
 */
export function isInsideDem(p: LatLon): boolean {
  if (!isDemLoaded()) {
    return false
  }
  const b = demBounds()
  return p.lat <= b.north && p.lat >= b.south && p.lon >= b.west && p.lon <= b.east
}

/** Geographic extent of the loaded grid. */
export function demBounds(): { north: number; south: number; east: number; west: number } {
  const { meta } = requireDem()
  const scale = 2 ** meta.zoom * 256
  const lon = (px: number): number => (px / scale) * 360 - 180
  const lat = (py: number): number => {
    const n = Math.PI - (2 * Math.PI * py) / scale
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  }
  return {
    west: lon(meta.pixelOriginX),
    east: lon(meta.pixelOriginX + meta.width),
    north: lat(meta.pixelOriginY),
    south: lat(meta.pixelOriginY + meta.height),
  }
}
