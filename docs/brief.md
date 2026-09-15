# Cooee: v1 prototype brief

Status: brief, Sept 2026. Build target for Claude Code.

Background and technical feasibility live in `claude/mate-tracker-build-plan.md`. This document is only about v1.

## 1. What v1 is

A clickable prototype running entirely on fake data. No radio, no backend, no accounts, no hardware.

Its single job is to find out whether the interaction is right before anyone spends money or writes production code. The output of this phase is not an app. It is a decision about what to build, plus a working reference that becomes the brief for the real thing.

### What v1 explicitly does not do

- Prove anything about radio range, mesh behaviour or battery life. Those are field questions and no prototype can answer them.
- Connect to a Meshtastic node.
- Talk to a server.
- Persist anything that matters.

If a question can only be answered by standing in a gully, it is out of scope here.

## 2. Deployment

A web app, opened by URL on a phone. No app store, no TestFlight, no install.

This is not a shortcut, it is the point. The whole value of v1 is that five mates can open it within a minute of you sending a link, on whatever phone they own, and you can ship a change and have them re-test it ten minutes later. An app store review cycle destroys that loop.

Design for portrait phone first. It should look like an app, not a website.

## 3. The simulation engine

This is the heart of v1 and deserves most of the effort. Everything else is a view onto it.

### Simulated mates

Four or five, with real names from the group. Each carries:

| Field | Notes |
| --- | --- |
| position | lat, long, altitude |
| track | a plausible walking path through real terrain, not a random walk |
| speed and heading | derived from the track |
| lastFixCapturedAt | when the position was taken |
| lastFixReceivedAt | when it arrived, which is different |
| transport | mesh or cellular |
| nodeBattery | percentage |
| state | moving, stationary, or silent |

Note the two timestamps. Capture time and receipt time diverging is the thing that makes off-grid tracking hard, and if the data model collapses them into one field the prototype cannot show the problem it exists to explore.

### Clock

A simulation clock with play, pause and speed control. Being able to run four hours of a hunt in two minutes is what makes testing viable at a kitchen table.

### Degradation controls

A visible developer panel with:

- Report interval, from 10 seconds to 15 minutes
- Packet loss, 0 to 50 percent
- Delivery jitter, so fixes arrive late by varying amounts
- Out-of-order delivery toggle
- Per-mate transport override, mesh or cellular
- Relay up or down

**Default the simulation to mesh conditions, not cellular.** Five-minute intervals, 20 percent loss, jitter on, out-of-order on. If v1 opens on perfect ten-second updates, everyone will like it and you will learn nothing. The uncomfortable case is the normal case.

### Scenarios

Preset buttons that configure the above in one tap:

1. **Together.** Everyone within a kilometre, cellular, fresh data. The easy case.
2. **Spread out.** Three to six km apart, mesh only, five-minute intervals.
3. **Gone quiet.** One mate's last fix is 25 minutes old and ageing. Does anyone notice?
4. **Relay dropped.** The relay goes down mid-session and the mesh fragments. Two mates keep updating, two freeze.
5. **Converging.** You select a mate and walk toward them. Both ends boost their reporting rate.

Scenario 3 and 4 are the ones that matter. They are the failure modes, and how the UI handles them is the actual design problem.

## 4. Screens

Three real screens plus a status strip. Resist adding more.

### Map

The default view and where the app lives.

- Mates as dots, each labelled with name and the age of its fix.
- Your own position, visually distinct.
- The relay, shown as a distinct marker with its own state.
- Real topo tiles over a real location. Use somewhere you actually hunt so the terrain reads honestly. Anything free and offline-capable will do at this stage.
- Nothing else. No waypoints, no tracks, no layers panel.

**Amendment, Sept 2026 — the end version downloads an area before you go.** Maps were originally left as "anything offline-capable will do", with the real decision parked for after v1. That was the wrong shape. Preparing an area is not plumbing to be settled later, it is an interaction a person performs, at the truck, with attention on it — and therefore one they can fail to perform, in a way that only shows up later and in the worst place. It belongs in v1 as a question, even though the machinery behind it belongs well after.

So v1 should simulate it: pick an area, see its size, watch it download, and be told when you have walked off the edge of it. None of that needs a real tile. What it answers is question 12 — do people remember to prepare — which has the same shape as question 7 and is just as dangerous if the answer is no.

The layer model, the licensing that rules Google and Apple out of it, and the staged path are in `docs/maps.md`.

**Staleness treatment is the primary design question on this screen.** A fix from fourteen minutes ago must not look like a fix from thirty seconds ago. Try at least three approaches and test them: numeric age labels, progressive fading, and an explicit ring or halo that grows with age. One of them will be obviously right and it is not obvious in advance which.

### Mate detail

Opened by tapping a dot.

- Name, distance, bearing, elevation difference
- Age of the fix, stated prominently and in words
- Node battery, transport in use
- Terrain profile between you and them, as a cross-section
- Estimated walk time, slope-adjusted, not straight-line distance
- Message button

Fake the terrain profile and walk time if the elevation data is a hassle at this stage. A plausible hand-built curve tests the interaction just as well as a real one, and swapping in a real DEM later is trivial.

### Messages

One group thread.

- Six preset messages as large tap targets: heading back, on the ridge, got one, need a hand, hold fire, at the truck.
- Keyboard below as a fallback.
- Each sent message shows delivery state: sending, delivered, or not yet acknowledged. Under mesh conditions with 20 percent loss, this state is real and frequent, and how it reads is a design question.
- Simulated mates reply occasionally so the thread is not one-sided.

### Status strip

A persistent bar, not a screen. Shows the health of the link in one line: how many mates are currently reachable, whether the relay is up, and how long since anything was heard at all.

This is a safety element rather than a settings element. It answers "should I trust what I am looking at".

## 5. The questions v1 must answer

Write these down before testing and record the answers. This list is the actual deliverable.

1. Does a stale dot read as stale, or do people act on it anyway?
2. At what age does a position stop being useful? Five minutes? Fifteen? An hour?
3. Which of the six presets get used, and which three are missing?
4. Do people open the map first or want a list of mates first?
5. When walking toward someone, do they use the map or immediately want an arrow?
6. Does the terrain profile and walk time change what they decide to do, or is it decoration?
7. When the relay drops in scenario 4, how long before anyone notices?
8. Is a message with an unacknowledged state reassuring or alarming?
9. What do they reach for that is not there?

Question 7 is the most important. If nobody notices the relay dropping, the status strip has failed and the product is dangerous.

## 6. How to test it

Send the URL to four mates. Do not explain anything.

Run each scenario for a few minutes on the simulated clock while everyone has it open, and watch what they do and say. Say as little as possible. The instinct to explain the interface is the instinct to be resisted, because in the field nobody will be there to explain it.

Afterwards ask exactly one open question: what would you change. Then shut up.

Do this twice, a week apart, with changes in between. Two rounds beats one round of twice the length.

## 7. What success looks like

Continue if: people correctly distrust stale data without being told to, the presets mostly cover what they want to say, and at least one person asks when they can use it for real.

Stop, or rethink, if: people treat every dot as current, the map is not glanceable at arm's length in sunlight, or the consistent feedback is that they would rather just use the radio.

## 8. After v1

The prototype becomes the brief. Specifically it produces:

- A settled set of screens and interactions, demonstrated rather than described
- A validated preset list
- A staleness treatment that has been tested rather than guessed
- A concrete answer on whether route planning earns its place
- The real transport abstraction, because the simulation engine already models mesh and cellular as interchangeable sources

At that point `mate-tracker-build-plan.md` picks up: stack decision, BLE, offline tiles, and hardware in the field. The map decisions that could not wait are already in `docs/maps.md`.
