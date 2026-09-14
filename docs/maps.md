# How Cooee does maps

Status: decision document, Sept 2026. Written before any of it is built.

This is the question `docs/brief.md` §8 parks for after v1 — "stack decision, BLE,
offline tiles" — brought forward because the map is the screen the app lives on
and everything else is drawn over it.

---

## 1. The constraint that decides everything

**The app's entire subject is being somewhere without a connection.**

That one sentence eliminates more options than any preference about which map
looks nicer. A map layer that needs signal to draw is a map layer that is blank
at precisely the moment the app matters. Worse than blank: it trains people to
expect a map, and then takes it away in the gully.

So every option below gets judged on one question first — *can this be on the
phone before we leave, and drawn with the radio off?* — and only then on how it
looks.

The current prototype already passes that test. The Forestry sheet (791 tiles,
14 MB) and the SRTM elevation model (1.3 MB) are both served from the app
itself. It works in aeroplane mode today. Whatever replaces this must not lose
that.

---

## 2. Apple Maps and Google Maps

These came up as the obvious answer for people with no sheet of their own, and
they are the obvious answer — they are also the one option we cannot build on.
Not on taste. On licence.

**Both explicitly forbid storing tiles for offline use.**

- Google Maps Platform terms prohibit pre-fetching, indexing, storing or caching
  content, with narrow exceptions that do not cover "download the area before
  you go". Offline use is called out directly.
- Apple's Developer Program License Agreement (Schedule 6 §2.5) restricts
  caching, prefetching and storing map data. Developers asking Apple to clarify
  where temporary caching ends and prohibited storage begins are told to consult
  their own lawyers, which is its own kind of answer.

There is a second, quieter problem. Neither is a tile source you can point
Leaflet at. Google's terms govern how their content may be rendered and
attributed; Apple's MapKit JS is its own renderer, not a tile endpoint. Adopting
either means running a second map engine alongside the one drawing the mate
dots, or abandoning Leaflet entirely.

And a third: both need accounts, keys and billing set up before a single mate
can open a link. The prototype's whole delivery model is *send the URL, no
explanation*.

**What they are genuinely good for**, and worth keeping in mind for the real
product: search and geocoding. "Where is Vulcan State Forest" is a question
Google answers well and OpenStreetMap often answers badly. That is a different
feature from the basemap, with no offline requirement, and it can be added later
without touching any of this.

---

## 3. What "usable anywhere in the world" actually requires

This is the requirement that settles the choice, and it also kills the answer I
was leaning toward before it was stated.

NSW Spatial Services publish an excellent free topographic vector basemap —
contours, hydrology, property boundaries, authoritative for exactly where we
hunt. As the primary basemap for a worldwide app, it is useless outside NSW.

Global + offline + licensed to cache leaves essentially one family: **map data
derived from OpenStreetMap**. ODbL permits redistribution and caching, coverage
is worldwide, and nobody can switch it off or start billing for it.

Within that family the interesting delivery format is **PMTiles** — a single
file containing a whole tile pyramid, with an internal index. Served from static
hosting it answers any tile in at most two HTTP range requests; downloaded whole
it is an offline map with no server at all. That is not a workaround, it is what
the format was designed for. Protomaps publish an OSM-derived basemap in it; a
whole planet at z0–15 is about 120 GB, but a region is a download, and a single
state forest is small.

---

## 4. The layer model

Three layers, and the order matters. Each is independently optional except the
first.

```
  ┌─ your sheets ──────  optional, yours       GeoPDFs you load yourself
  ├─ basemap ──────────  optional, downloaded  OSM-derived, worldwide
  └─ relief ───────────  ALWAYS PRESENT        DEM: shading + contours
```

**Relief is the floor, and it is already built.** `src/map/terrainLayer.ts`
draws shaded relief and 20 m contours straight from the elevation model. It
needs no network and no provider. Whatever else fails to load, the map is never
blank and always shows the shape of the ground — which for walking to someone is
most of what a map is for.

This is the part worth protecting. It means the answer to "what if they have no
sheet and no signal and never downloaded anything" is not a grey screen.

**Basemap is the middle.** Roads, tracks, watercourses, place names, worldwide.
Downloaded before leaving, cached, licensed to be cached.

**Sheets are the top.** Someone's own GeoPDF, laid over, opacity adjustable —
already the case, since the Forestry sheet can be dialled back to see the
landform beneath it.

---

## 5. Bring your own sheet, at runtime

The Avenza-style bit. Today this is a build-time step on a developer's machine
(`scripts/data/build_assets.py`) that commits 791 PNGs to the repo. Doing it at
runtime in the browser is a genuine shift, but less of one than it looks.

**The georeferencing is the easy part, unexpectedly.** The existing script does
not use a PDF library to find it — it runs a regex over the raw bytes for
`/GPTS`, `/LPTS` and the `/Viewport` `/BBox`. That technique ports to JavaScript
unchanged: read the `ArrayBuffer`, match the same patterns, hand the corners to
`proj4js` instead of `pyproj`. No parser required.

**Rasterising is the ordinary part.** `pdf.js` renders a PDF page to canvas.
Well-trodden.

**Warping is where it gets real.** The sheet is a true rectangle in its own
projection but not in web mercator, so it cannot simply be dropped on as an
image overlay without skew. The current build resamples through a mip pyramid,
one level per zoom. In a browser, on a phone, on a raster large enough to be
worth reading, that is the piece that needs prototyping before it is promised.

**Known risks, in order:**

1. **Memory.** The build renders the sheet at 180 dpi (~7 m/px) before tiling.
   A phone doing that in a canvas may not survive it. Tiling progressively
   rather than rendering the whole sheet at once is the likely answer.
2. **Not every GeoPDF is this tidy.** The regex works because this publisher
   leaves those arrays as plain text. A PDF with them inside compressed object
   streams needs real parsing, and will otherwise fail — so it must fail
   *clearly*, saying "this PDF has no georeferencing I can read", never by
   silently placing a sheet in the wrong spot. A map that is confidently wrong
   about where it is is the worst artefact this app could produce.
3. **Projection coverage.** MGA zone 55 is one of many. `proj4js` handles the
   common ones, but "anywhere in the world" means meeting datums we have not
   seen.

---

## 6. Storage

The honest limits, because this is where offline map features usually die.

- One 1:50,000 sheet at z11–14 is ~14 MB. That is comfortable.
- A basemap region at the zooms you would actually navigate by is bigger, and
  grows roughly fourfold per zoom level.
- Browser storage is not guaranteed. It is evictable unless
  `navigator.storage.persist()` is granted, and iOS Safari has historically been
  the least generous and the most willing to clear.

Two consequences worth deciding up front rather than discovering in a gully:

- The app must be able to **say what it actually has stored**, per area, in
  megabytes, with a delete. Anything that hoards silently will eventually be
  wrong about what is available offline.
- Eviction must degrade to the relief layer visibly, not silently. "The sheet
  you downloaded is gone" is information; a blank tile is not.

---

## 7. Staged path

Each stage is useful on its own and none blocks the next.

| Stage | What | Why this order |
| --- | --- | --- |
| 0 | Where we are: baked Forestry sheet + relief | Works offline today |
| 1 | Load a GeoPDF at runtime | The customisation that was actually asked for; answers "will people bring their own sheets" |
| 2 | Manage stored sheets — list, size, delete | Falls out of stage 1 the moment there is more than one |
| 3 | OSM-derived basemap, online | Cheapest way to see whether a road/track layer is even wanted |
| 4 | Download-an-area for offline | The expensive one. Only worth it if stage 3 shows the layer earns its place |

Stage 1 is the one to build first. It is the piece with a real interaction
question attached — *do people bring their own maps, and does having their own
sheet change how much they trust the app?* — and the answer determines whether
stages 3 and 4 are worth anything at all.

---

## 8. The renderer question, deferred deliberately

Vector tiles usually mean MapLibre GL. Switching to it would mean rebuilding the
relief layer, every mate marker, the staleness halos, the course arrows and the
facing cone — all of which currently work.

There is a bridge: `protomaps-leaflet` renders vector tiles onto Leaflet's
canvas, keeping everything above intact. Its own maintainers describe it as in
maintenance mode and steer new projects to MapLibre, so it is a way to defer the
decision rather than avoid it.

**Recommendation: stay on Leaflet until stage 3 proves a basemap is wanted.**
Rewriting the renderer to add a layer nobody asked for would be the definition
of the wrong order. If it turns out to be wanted and vector is the right answer,
that is a real project, planned on its own.

---

## 9. Open questions

1. **Does anyone actually have a GeoPDF?** The premise of stage 1 is that
   hunters already carry Avenza sheets. Worth confirming with the party before
   building for it.
2. **Whose sheet is it?** If Ben loads a sheet, does Marshy see it? Sharing
   sheets over the mesh is a different and much larger feature than loading one.
3. **How much is a mate willing to download at the truck?** 14 MB is nothing.
   400 MB on a phone with no reception and 6% battery is a different question.
4. **Is the relief layer enough on its own?** Nobody has tested it without the
   sheet over it. If it is enough for walking to someone, stages 3 and 4 may
   never be needed — and that would be the most valuable finding here.

---

## Sources

- [Google Maps Tile API policies](https://developers.google.com/maps/documentation/tile/policies)
- [Google Maps Platform service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- [PMTiles concepts](https://docs.protomaps.com/pmtiles/)
- [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads)
- [protomaps-leaflet](https://github.com/protomaps/protomaps-leaflet)
- [NSW Basemaps, Spatial Services](https://www.spatial.nsw.gov.au/products_and_services/nsw_basemaps)
