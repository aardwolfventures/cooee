/**
 * Private threads, and who the person holding the phone is.
 *
 * Two things are being pinned down here. First, that a private message carries
 * a weaker promise than a group one and the model says so: it has to reach one
 * named person and come back, so either leg losing it leaves the message
 * unacknowledged. Second, that a private message stays private — it must never
 * leak into the bubble that hangs over a dot in plain view.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createPinia, setActivePinia } from 'pinia'
import { SimEngine } from '../engine'
import { loadDem } from '../dem'
import { GROUP_THREAD, type SimSettings } from '../types'
import { matchingMateId, normaliseName } from '../identity'
import { useSimStore } from '@/stores/sim'
import { YOU_ID } from '@/sim/mates'

beforeAll(async () => {
  await loadDem({
    meta: async () => JSON.parse(await readFile('public/terrain/elevation.json', 'utf8')),
    body: async () => new Uint8Array(await readFile('public/terrain/elevation.bin.gz')),
  })
})

function run(engine: SimEngine, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 1000) {
    engine.tick(1000)
  }
}

/** Structural, so it takes the store's reactive engine as readily as a raw one. */
function perfectLink(engine: { settings: SimSettings }): void {
  engine.settings.packetLossPct = 0
  engine.settings.jitterEnabled = false
  engine.settings.outOfOrderEnabled = false
  engine.settings.relayUp = true
}

describe('threads', () => {
  it('files a message under the thread it was said in', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    engine.send('Heading back')
    engine.send('where are you', 'ben')

    const group = engine.messages.filter((m) => m.threadId === GROUP_THREAD)
    const toBen = engine.messages.filter((m) => m.threadId === 'ben')
    expect(group.map((m) => m.text)).toContain('Heading back')
    expect(toBen.map((m) => m.text)).toContain('where are you')
    expect(group.map((m) => m.text)).not.toContain('where are you')
  })

  it('delivers a private message when both legs are clean', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    const message = engine.send('Need a hand', 'ben')
    run(engine, 120)
    expect(engine.messages.find((m) => m.id === message.id)!.state).toBe('delivered')
  })

  it('leaves a private message unacknowledged when that one mate is unreachable', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    // Everyone is on the mesh, and the mesh goes through the relay. Your own
    // link being fine is not enough when the promise is that one named person
    // got it.
    engine.youTransport = 'cellular'
    engine.settings.relayUp = false
    const message = engine.send('Need a hand', 'ben')
    run(engine, 120)
    expect(engine.messages.find((m) => m.id === message.id)!.state).toBe('unacknowledged')
  })

  it('acknowledges the same words to the group on that same broken link', () => {
    // The asymmetry is the point: shouting only has to reach the mesh, and on
    // a cellular handset it does. This is why the two threads cannot share one
    // delivery model.
    const engine = new SimEngine()
    perfectLink(engine)
    engine.youTransport = 'cellular'
    engine.settings.relayUp = false
    const message = engine.send('Need a hand')
    run(engine, 120)
    expect(engine.messages.find((m) => m.id === message.id)!.state).toBe('delivered')
  })

  it('gets an answer back in the same private thread', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    engine.send('where are you', 'ben')
    run(engine, 10 * 60)

    const replies = engine.messages.filter((m) => m.threadId === 'ben' && m.authorId === 'ben')
    expect(replies.length).toBeGreaterThan(0)
    expect(replies.every((m) => m.state === 'delivered')).toBe(true)
  })

  it('lets a mate start a private thread unprompted', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    run(engine, 90 * 60)

    const unprompted = engine.messages.filter(
      (m) => m.threadId !== GROUP_THREAD && m.authorId !== YOU_ID,
    )
    expect(unprompted.length).toBeGreaterThan(0)
    // Addressed to you, from them — never a thread between two other people,
    // which this phone could not have seen.
    expect(unprompted.every((m) => m.threadId === m.authorId)).toBe(true)
  })
})

describe('unread', () => {
  let sim: ReturnType<typeof useSimStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    sim = useSimStore()
    perfectLink(sim.engine)
  })

  it('does not count your own messages', () => {
    sim.send('Got one')
    sim.send('where are you', 'ben')
    sim.engine.tick(60_000)
    sim.frame += 1
    expect(sim.groupUnread).toBe(0)
    expect(sim.unreadFor('ben')).toBe(0)
  })

  it('clears once the thread has been opened', () => {
    for (let i = 0; i < 200 && sim.unreadByMate.size === 0; i += 1) {
      sim.engine.tick(60_000)
      sim.frame += 1
    }
    const [mateId, count] = [...sim.unreadByMate.entries()][0] ?? []
    expect(count).toBeGreaterThan(0)

    sim.openThread(mateId!)
    sim.frame += 1
    expect(sim.unreadFor(mateId!)).toBe(0)
  })

  it('clears a mate\'s unread by opening their sheet, where the thread now lives', () => {
    // Tapping a dot opens the conversation, not a stats screen. That counts as
    // reading it — leaving a badge on a dot whose thread is on screen would be
    // the app lying to you about something it can plainly see.
    for (let i = 0; i < 200 && sim.unreadByMate.size === 0; i += 1) {
      sim.engine.tick(60_000)
      sim.frame += 1
    }
    const [mateId] = [...sim.unreadByMate.entries()][0] ?? []
    expect(mateId).toBeDefined()

    sim.selectMate(mateId!)
    sim.frame += 1
    expect(sim.unreadFor(mateId!)).toBe(0)
    expect(sim.readingThreadId).toBe(mateId)
  })

  it('counts a late arrival as unread even though it was said before you looked', () => {
    // A message captured before you last read the thread but delivered after
    // it is new to you. Counting against send time would hide exactly the late
    // arrival this whole prototype exists to show.
    sim.openThread(GROUP_THREAD)
    sim.closeThread()
    const readAtNow = sim.engine.now

    sim.engine.settings.jitterEnabled = true
    for (let i = 0; i < 60 && sim.groupUnread === 0; i += 1) {
      sim.engine.tick(30_000)
      sim.frame += 1
    }
    expect(sim.groupUnread).toBeGreaterThan(0)
    const counted = sim.engine.messages.filter(
      (m) => m.threadId === GROUP_THREAD && m.authorId !== YOU_ID && m.state === 'delivered',
    )
    expect(counted.some((m) => (m.deliveredAt ?? m.sentAt) > readAtNow)).toBe(true)
  })
})

describe('bubbles stay public', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('never puts a private message over a dot', () => {
    const sim = useSimStore()
    perfectLink(sim.engine)
    sim.send('a word in your ear', 'ben')
    sim.frame += 1

    // It was said, and it is in the thread. It just does not hang over the map
    // where whoever is looking over your shoulder can read it.
    expect(sim.messagesFor('ben').map((m) => m.text)).toContain('a word in your ear')
    expect(sim.bubbleByAuthor.get(YOU_ID)?.text).not.toBe('a word in your ear')
  })

  it('still puts a group message over a dot', () => {
    const sim = useSimStore()
    perfectLink(sim.engine)
    sim.send('On the ridge')
    sim.frame += 1
    expect(sim.bubbleByAuthor.get(YOU_ID)?.text).toBe('On the ridge')
  })
})

describe('who is holding the phone', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('tidies up what was thumbed in', () => {
    expect(normaliseName('  ben  ')).toBe('Ben')
    expect(normaliseName('marshy')).toBe('Marshy')
    expect(normaliseName("dan  o'brien")).toBe("Dan O'Brien")
    expect(normaliseName('')).toBe('')
  })

  it('recognises a name as one of the party, by nickname or by full name', () => {
    expect(matchingMateId('Ben')).toBe('ben')
    expect(matchingMateId('ben')).toBe('ben')
    expect(matchingMateId('Marshy')).toBe('marshy')
    expect(matchingMateId('Paul')).toBe('marshy')
    expect(matchingMateId('Mike')).toBeNull()
    expect(matchingMateId('')).toBeNull()
  })

  it('takes you out of the party when you are already in it', () => {
    const sim = useSimStore()
    expect(sim.engine.mate('ben')).toBeDefined()

    sim.setIdentity('ben')

    expect(sim.youName).toBe('Ben')
    expect(sim.engine.mate('ben')).toBeUndefined()
    expect(sim.mateViews.some((v) => v.mate.id === 'ben')).toBe(false)
    // And everyone else is still out there.
    expect(sim.engine.mates).toHaveLength(5)
  })

  it('leaves the party alone for a name nobody has', () => {
    const sim = useSimStore()
    sim.setIdentity('Wozza')
    expect(sim.youName).toBe('Wozza')
    expect(sim.engine.mates).toHaveLength(6)
  })

  it('names messages after whoever is holding the phone', () => {
    const sim = useSimStore()
    sim.setIdentity('Wozza')
    expect(sim.nameFor(YOU_ID)).toBe('Wozza')
    expect(sim.nameFor('ben')).toBe('Ben')
  })

  it('ignores an empty name rather than leaving you nameless', () => {
    const sim = useSimStore()
    const before = sim.youName
    sim.setIdentity('   ')
    expect(sim.youName).toBe(before)
    expect(sim.askingName).toBe(true)
  })
})
