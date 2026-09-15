# How Cooee does maps

Status: decision document, Sept 2026. Written before any of it is built.

Revised once already. The first version treated offline as a limitation to work
around. The brief then changed: **the end version downloads an area before you
go hunting there.** That is a better premise and it rearranges most of what
follows, so this is rewritten around it rather than patched.

---

## 1. Preparing is the product

The old framing was *the app must cope with having no signal*. The new one is
*the app helps you get ready, and then works*.

That turns the constraint into the central interaction. Downloading an area is
something a person deliberately does, with attention on it, at the truck where
there is still reception. It is a moment the app can make good — or fail at, in
a way that only shows up later and in the worst place.

It also collapses two features into one. A GeoPDF you loaded and a basemap
region you downloaded stop being different kinds of thing. Both are **an Area
you prepared**. One concept, several sources:

```
  An Area                     prepared at the truck, carried in the pocket
  ├─ your sheets              GeoPDFs you loaded          optional
  ├─ a basemap                OSM-derived, downloaded     optional
  └─ relief + contours        DEM, downloaded             the floor
```

`docs/brief.md` should gain a short map section saying this, since it currently
says only "anything free and offline-capable will do at this stage".

---

## 2. Apple Maps and Google Maps: the answer got sharper, not softer

It is tempting to think a download-an-area model makes them workable. It is the
exact opposite. **Downloading an area is precisely the act their licences
prohibit.**

- Google Maps Platform terms bar pre-fetching, indexing, storing and caching
  content, and call out offline use directly.
- Apple's Developer Program License Agreement (Schedule 6 §2.5) restricts
  caching, prefetching and storing map data.

The intuition that misleads here is that Google Maps offers offline areas in
its own app. It does — under Google's own terms, for Google's own product.
Nothing in the Platform terms extends that right to anyone building on top.

There are two further problems, unchanged from the first version of this
document. Neither is a tile source Leaflet can point at, so adopting one means
running a second map engine beside the one drawing the mate dots. And both need
accounts, keys and billing before a single mate can open a link, against a
delivery model whose whole point is *send the URL, explain nothing*.

**Where they genuinely belong: search.** "Where is Vulcan State Forest" is a
question Google answers well and OpenStreetMap often answers badly. Finding the
area you want to prepare is exactly the moment you have signal, and it has no
offline requirement at all. That is a real use and worth keeping.

---

## 3. Anywhere in the world

This requirement settles the source, and it rules out the answer that would
otherwise suit us best.

NSW Spatial Services publish a free topographic basemap — contours, hydrology,
property boundaries, authoritative for exactly where we hunt. It is useless
outside NSW. Worth keeping as an optional extra for people hunting here, never
as the thing the product is built on.

Global, offline, and licensed to be cached leaves one family: **data derived
from OpenStreetMap**. ODbL permits redistribution and caching, coverage is
worldwide, and nobody can switch it off or start charging for it.

The delivery format that fits is **PMTiles** — a single file holding a whole
tile pyramid with an internal index. Served from static hosting it answers any
tile in at most two range requests; downloaded whole it is an offline map with
no server behind it. An Area, in one file.

---

## 4. What preparing adds to the safety story

The status strip answers three questions today: who is reachable, whether the
relay is up, how long since anything was heard at all. A download model adds a
fourth, and it belongs beside them:

> **Are you inside the area you prepared?**

Walking off the edge of your own map is a real hazard, and it is the same shape
as every other hazard this app takes seriously: something quietly stopped being
true and nothing said so.

**Part of this is already built.** Panning past the elevation model now shows
*"Off the mapped area. No terrain here, so no cross-sections or walk times
either."* That is the state, prototyped, with fake data — exactly what the brief
means by testing the interaction before building the machinery.

---

## 5. The consequence people will not expect

Relief is not a free global floor. `elevation.bin.gz` covers the Vulcan sheet
and nothing else, so worldwide it is **per-area too**.

Which means outside a prepared area you do not merely lose the map. You lose
the terrain profile and the slope-adjusted walk time, because both read that
same grid. The app must say so rather than quietly drawing a flat profile: a
walk time computed over terrain you do not have is a confident lie, and that is
the worst artefact this app could produce.

The good news is that the floor is cheap. Measured on the shipped assets:

| | Size | Note |
| --- | --- | --- |
| Elevation, ~2300 km² | **1.25 MB** | a ninth of the sheet over the same ground |
| Sheet, z11–14 | 13.7 MB | 791 tiles |
| Sheet, z11–16 | ~190 MB (est.) | tiles quadruple per zoom |

So carrying relief for an area costs almost nothing. The expensive part is
high-zoom raster, and a vector basemap for a whole state would likely come in
under a raster sheet for one forest.

---

## 6. Bringing your own sheet

Unchanged from the first version, and now simply one way of filling an Area.

The georeferencing is the easy part, unexpectedly:
`scripts/data/build_assets.py:31` does not use a PDF library to find it. It runs
a regex over the raw bytes for `/GPTS`, `/LPTS` and the `/Viewport` `/BBox`.
That ports to JavaScript unchanged — `proj4js` in place of `pyproj`, `pdf.js`
only to rasterise.

Warping is the hard part: the sheet is a true rectangle in its own projection
but not in web mercator, and the build renders at ~7 m/px before tiling. On a
phone, that is the piece to prototype before it is promised.

**Risks, in order:** memory during the warp; PDFs that keep those arrays inside
compressed object streams, where the regex finds nothing and the app must fail
loudly rather than place a sheet in the wrong country; and projections beyond
the handful we have seen.

---

## 7. Storage

- Browser storage is evictable unless `navigator.storage.persist()` is granted,
  and iOS Safari has historically been both the least generous and the most
  willing to clear.
- An app that hoards silently will eventually be wrong about what it has. It
  must be able to say what is stored, per area, in megabytes, with a delete.
- Eviction must degrade visibly. "The area you downloaded is gone" is
  information. A blank tile is not.

---

## 8. Staged path

| Stage | What | Why this order |
| --- | --- | --- |
| 0 | Baked sheet + relief, one area, no UI for it | Where we are. Works offline today |
| 1 | Simulate preparing an area — pick, size, progress, "you are outside it" | Pure UX, fake tiles, answers the question below |
| 2 | Load a GeoPDF at runtime | The customisation actually asked for |
| 3 | Manage stored areas — list, size, delete | Falls out the moment there are two |
| 4 | Real OSM-derived tiles, online | Cheapest way to see whether a road layer is wanted |
| 5 | Real downloads for offline | The expensive one, and only if 4 earns it |

**Stage 1 first, and it needs no real tiles at all.** A region picker, a size
estimate, a progress bar and an off-the-edge state can all be faked, and faking
them answers whether the interaction works before any of the machinery exists.
That is what this prototype is for.

---

## 9. The renderer question, still deferred

Vector tiles usually mean MapLibre GL, and switching would mean rebuilding the
relief layer, every mate marker, the staleness halos, the course arrows and the
facing cone — all of which work.

`protomaps-leaflet` renders vector tiles onto Leaflet's canvas and would keep
all that, though its maintainers describe it as in maintenance mode and steer
new projects to MapLibre. It defers the decision rather than avoiding it.

**Stay on Leaflet until stage 4 proves a basemap is wanted.** Rewriting the
renderer to add a layer nobody asked for is the wrong order.

---

## 10. Open questions

1. **Do people remember to prepare?** The one that matters. This is question 12
   in `docs/questions.md`, and it has the same shape as question 7: if nobody
   notices the relay drop, the status strip has failed; if nobody remembers to
   download, the map is absent in the gully. Both fail quietly, late, and in
   the worst place.
2. **Is the relief layer enough on its own?** Nobody has tested it without a
   sheet over it. If it is enough to walk to someone, stages 4 and 5 may never
   need building, and that would be the most valuable finding here. Testable
   today: ☰ → Map sheet → 0%. `build_assets.py --dem south,west,north,east`
   builds relief over country you know, so the judgement is not made on ground
   you only know through the sheet lying on top of it.
3. **Does anyone actually have a GeoPDF?** Stage 2 assumes hunters already
   carry Avenza sheets. Worth confirming with the party before building for it.
4. **Whose area is it?** If Mike prepares "Vulcan, September", does the party
   get it? Sharing an area over the mesh is a much larger feature than
   preparing one — and the first idea in this document that ties the map to the
   radio rather than treating them as separate products.
5. **How much will someone download at the truck?** 14 MB is nothing. 400 MB on
   a phone with poor reception and a flat battery is a different question.

---

## Sources

- [Google Maps Tile API policies](https://developers.google.com/maps/documentation/tile/policies)
- [Google Maps Platform service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- [PMTiles concepts](https://docs.protomaps.com/pmtiles/)
- [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads)
- [protomaps-leaflet](https://github.com/protomaps/protomaps-leaflet)
- [NSW Basemaps, Spatial Services](https://www.spatial.nsw.gov.au/products_and_services/nsw_basemaps)
