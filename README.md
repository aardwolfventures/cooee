# Cooee — v1 prototype

A clickable prototype for off-grid mate tracking, set in Vulcan State Forest,
NSW. The mates and the radio between them are simulated; the map and the
terrain are real. No radio, no backend, no accounts, no hardware.

Its single job is to find out whether the interaction is right before anyone
spends money or writes production code. The output of this phase is not an app.
It is a decision about what to build, plus a working reference that becomes the
brief for the real thing.

The full brief is in [`docs/brief.md`](docs/brief.md). The questions this is
meant to answer — the actual deliverable — are in
[`docs/questions.md`](docs/questions.md).

## Running it

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # simulation engine tests
pnpm typecheck
pnpm build
```

Pushing to `main` deploys to GitHub Pages, which is how mates get at it: one
URL, any phone, no app store, no TestFlight. A change can be in their hands ten
minutes after you make it.

## What it is

Portrait phone first. One screen and a status strip, with everything else
reached from them:

- **Map** — mates as dots over the real Vulcan sheet, your position, the relay.
  This is the app; there is no tab bar.
- **Mate sheet** — tap a dot and you land on your conversation with that
  person. Their name, the age of their fix, and one dim line of readings sit
  above it; distance, bearing, elevation, the terrain cross-section and the
  slope-adjusted walk time are behind a tap on that line.
- **Threads** — **Message everyone** at the bottom of the map opens the group
  thread; a mate's own dot opens a private one with just them. Six presets
  either way, and per-message delivery state.
- **Status strip** — always on screen. Reachable count, relay health, and how
  long since anything was heard at all. A safety element, not a settings one:
  it answers "should I trust what I am looking at".

Tap **☰** in the status strip for the simulation controls.

### Who you are

The app asks your name on first load, because the way this gets tested is by
sending one URL to the whole party. Whoever opens it is the person holding the
phone, and their name goes on their own dot.

If the name is somebody already in the party, they leave it — you cannot be a
dot on your own map, and a Ben who can see Ben out on the ridge is being shown
something false on the first screen he ever sees. The scenarios pick their
roles accordingly, so "gone quiet" always has somebody to go quiet.

### Group and private

Tapping someone on a map is nearly always the start of saying something to
them, so their sheet is the conversation, not a page of numbers with a
**Message** button at the bottom. The readings are still there — they have just
stopped being the headline. The one exception is the age of the fix, which
keeps its size and its staleness colour: it is not a statistic in the same
sense as the others, it is the number that says whether any of the rest can be
trusted.

Two threads, and they do not carry the same promise.

A group message only has to reach the mesh: with six people on it somebody
acknowledges. A private message has to reach one named person and come back, so
it is modelled over two legs — your link out and theirs back — and either leg
losing it leaves the message unacknowledged. Taking a mate aside on a bad link
is a much weaker promise than saying the same words to everyone, and the model
says so rather than pretending otherwise.

Private messages never appear in the bubble over a dot. A bubble hangs on the
map in plain view, and a thread someone opened with you alone should not be
readable over your shoulder. They announce themselves with a count on that
mate's dot instead — and with no tab bar left to badge, whether that count gets
noticed is the thing this arrangement is being tested for.

## The simulation

The engine (`src/sim/`) is the heart of this and everything else is a view onto
it. The rules it plays by:

**Capture time and receipt time are separate fields and always will be.** Their
divergence is what makes off-grid tracking hard. A data model that collapses
them into one cannot show the problem this prototype exists to explore.

**The UI never reads ground truth.** Mates have a `truePosition`; no component
is allowed to touch it. The screen only ever shows fixes that have actually
been delivered, which is the only way this can be honest about what a user does
and does not know.

**A newer capture always wins, whatever the arrival order.** A fix that turns up
late but was taken earlier is discarded, not displayed. Taking the
latest-received instead would make dots walk backwards — the classic bug this
model exists to expose rather than commit.

**The app is never told the relay is down.** It infers it from missing
heartbeats, exactly as the real thing would have to. That inference is what
question 7 is actually testing.

**It opens on mesh conditions, not cellular.** Five-minute intervals, 20%
packet loss, jitter on, out-of-order on. If it opened on perfect ten-second
updates everyone would like it and we would learn nothing. The uncomfortable
case is the normal case.

### Controls

Report interval (10 s – 15 min), packet loss (0–50%), delivery jitter,
out-of-order delivery, per-mate transport override, relay up/down, and a clock
with play, pause and 1× / 10× / 60× / 300× speeds. Four hours of a hunt runs in
two minutes at a kitchen table.

### Scenarios

| Scenario | What it is for |
| --- | --- |
| Together | The easy case. A baseline for how good it can ever look. |
| Spread out | 3–6 km apart, mesh only, five-minute intervals. |
| **Gone quiet** | A mate's fix is 25 minutes old and ageing — and they are still walking. |
| **Relay dropped** | The relay falls over two minutes in; Rod holds cellular, Ben and Marshy freeze. |
| Converging | You walk toward Ben; both ends boost their reporting rate. |

The two in bold are the failure modes, and how the UI handles them is the
actual design problem.

### Staleness treatments

The primary design question on the map. Three approaches are built and
switchable at runtime, because one of them is obviously right and it is not
obvious in advance which:

- **Age label** — numeric age beside the name.
- **Fade** — the dot fades as the fix ages.
- **Halo** — a ring that grows and reddens with age.

Mate identity colours are deliberately kept out of the green/amber/orange/red
staleness ramp, so a mate's own colour cannot be mistaken for an age cue.

## What is fake, and deliberately so

- **Walk times** use Tobler's hiking function over the real surface, plus 25%
  for scrub and picking a line. The terrain is now real (see below), so the
  remaining fiction is the 25% and Tobler itself.
- **Routes** are static polylines, but they were traced over the real elevation
  model rather than drawn by eye: each one follows a spur or a gully out of
  camp and stays inside the state forest. A random walk would have looked wrong
  immediately — people follow spurs, rivers and saddles.
- **The party** is Mike behind the phone with Ben, Marshy, Rod, Derrick, Sahil
  and Dan out in front, defined in `src/sim/mates.ts`. Real names,
  deliberately: a dot labelled "Mate 2" is not the same test as a dot labelled
  with someone you know, because the thing being measured is whether people
  trust a stale position, and trust attaches to a person.

## What it deliberately does not do

It proves nothing about radio range, mesh behaviour or battery life. Those are
field questions and no prototype can answer them. If a question can only be
answered by standing in a gully, it is out of scope here.

It also has no waypoints, no tracks and no layers panel. It has no mate list
either, which is still deliberate: question 4 is answered by whether anyone
asks for one.

Direction cues were in that same category and are no longer, because someone
asked. See question 5 in [`docs/questions.md`](docs/questions.md) — the map now
shows which way each mate was walking when their fix was taken, and which way
you are facing. Both are on the map rather than in a "point this way" arrow on
the detail screen, which is the distinction the build plan draws.

## What is real

The map and the ground under it are not simulated.

- **The base map** is the Forestry Corporation of NSW 1:50,000 hunting sheet
  for Vulcan State Forest, rasterised from the supplied GeoPDF and reprojected
  into tiles. It shows the roads, tracks, creeks, 20 m contours and forest
  zoning you would actually navigate by.
- **Elevation** is an SRTM-derived model at roughly 30 m posts covering the
  same sheet, so cross-sections, elevation readings and slope-adjusted walk
  times describe the real hillside rather than a formula. Vulcan is a dissected
  plateau around 1100-1300 m with the Abercrombie gorge cut into one corner —
  quite unlike the deep river valley an earlier synthetic surface modelled.
- **Both are served from the app itself**, not from a tile provider, so the map
  works with no connection at all. For an app whose entire subject is being
  somewhere without one, that had to stop being a to-do.

`scripts/data/` documents how both are built and how the alignment was checked.

> **The supplied sheet expired on 31 March 2023.** Its hunting-exclusion and
> bow-only zoning is therefore out of date, and this prototype is not a
> reference for where it is legal to hunt. Check current closures with Forestry
> Corporation before relying on any of it.

## Known limitations

- **Nothing persists** except your name. Reload and the simulation restarts,
  which is intended — the brief says v1 persists nothing that matters. The name
  is the one exception: being asked who you are on every refresh is not a
  finding, it is an irritation, and an irritated tester stops testing. Change
  it under **You** in the ☰ panel.
- **The single-file build has no sheet.** `pnpm build:standalone` inlines the
  elevation model but not 791 map tiles, so it shows shaded relief and contours
  without the printed map over the top.
