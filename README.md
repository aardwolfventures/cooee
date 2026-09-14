# Cooee — v1 prototype

A clickable prototype for off-grid mate tracking, running entirely on fake
data. No radio, no backend, no accounts, no hardware.

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

Portrait phone first. Three screens and a status strip, and deliberately
nothing else:

- **Map** — mates as dots over real topography, your position, the relay.
- **Mate detail** — tap a dot. Distance, bearing, elevation, age of the fix in
  words, terrain cross-section, slope-adjusted walk time.
- **Messages** — one group thread, six presets, per-message delivery state.
- **Status strip** — always on screen. Reachable count, relay health, and how
  long since anything was heard at all. A safety element, not a settings one:
  it answers "should I trust what I am looking at".

Tap **☰** in the status strip for the simulation controls.

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

- **Terrain** (`src/sim/terrain.ts`) is a synthetic surface shaped like the
  Wonnangatta Valley, not a real DEM. It is deterministic and continuous, so
  cross-sections and walk times are self-consistent. Swapping in real elevation
  data touches this one file.
- **Walk times** use Tobler's hiking function over that surface, plus 25% for
  scrub and picking a line. The number is honest about the model; the model is
  not the mountain.
- **Routes** are hand-authored polylines. A random walk would have looked wrong
  immediately — people follow spurs, rivers and saddles.
- **The party** is Mike behind the phone with Ben, Marshy and Rod out in front,
  defined in `src/sim/mates.ts`. Real names, deliberately: a dot labelled
  "Mate 2" is not the same test as a dot labelled with someone you know,
  because the thing being measured is whether people trust a stale position,
  and trust attaches to a person.

## What it deliberately does not do

It proves nothing about radio range, mesh behaviour or battery life. Those are
field questions and no prototype can answer them. If a question can only be
answered by standing in a gully, it is out of scope here.

It also has no waypoints, no tracks, no layers panel, no mate list and no
bearing arrow. The last two are absent on purpose: questions 4 and 5 are
answered by whether anyone asks for them.

## Known limitations

- **Map tiles are online-only.** OpenTopoMap over HTTPS, which is fine for a
  kitchen-table prototype and is the first thing to change before this goes
  near a valley with no signal.
- **Nothing persists.** Reload and the simulation restarts. That is intended:
  the brief says v1 persists nothing that matters.
