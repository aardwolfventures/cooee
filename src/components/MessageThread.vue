<script setup lang="ts">
/**
 * One conversation, group or private, as a sheet over the map.
 *
 * There is no messages screen any more. The group thread is a button on the
 * map and a private one is reached through the mate you want, so a thread is
 * always something opened on purpose — and closing it puts you straight back
 * on the map rather than on a tab you have to navigate out of.
 *
 * Both kinds are rendered by this one component on purpose. If the private
 * thread looked or behaved differently, a test would be measuring the
 * difference between two designs instead of the thing being asked: whether
 * having somewhere private to say something changes what people say.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useSimStore } from '@/stores/sim'
import { formatClock } from '@/lib/format'
import { YOU_ID } from '@/sim/mates'
import { GROUP_THREAD } from '@/sim/types'

const sim = useSimStore()

/**
 * Six presets, because in the field you are wearing gloves, the phone is at
 * arm's length and you are not typing. Which six is a question for testing:
 * the brief wants to know which get used and which three are missing.
 *
 * The private thread gets the same six rather than a tailored set. Splitting
 * them would make question 3 unanswerable — you could no longer say which of
 * six presets people reached for, only which of eleven.
 */
const PRESETS = [
  'Heading back',
  'On the ridge',
  'Got one',
  'Need a hand',
  'Hold fire',
  'At the truck',
] as const

const draft = ref('')
const thread = ref<HTMLDivElement | null>(null)

const threadId = computed(() => sim.openThreadId)
const isPrivate = computed(() => threadId.value !== null && threadId.value !== GROUP_THREAD)

const messages = computed(() => (threadId.value === null ? [] : sim.messagesFor(threadId.value)))

function colourFor(authorId: string): string {
  return sim.engine.mate(authorId)?.colour ?? 'var(--text-dim)'
}

function stateLabel(state: string): string {
  if (state === 'sending') {
    return 'sending…'
  }
  return state === 'delivered' ? 'delivered' : 'not acknowledged'
}

function send(text: string): void {
  const trimmed = text.trim()
  const id = threadId.value
  if (trimmed.length === 0 || id === null) {
    return
  }
  sim.send(trimmed, id)
  draft.value = ''
}

function close(): void {
  sim.closeThread()
}

watch(
  [() => messages.value.length, threadId],
  async () => {
    await nextTick()
    const el = thread.value
    if (el !== null) {
      el.scrollTop = el.scrollHeight
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="threadId !== null" class="sheet" role="dialog" aria-modal="true">
    <button class="sheet__scrim" type="button" aria-label="Close" @click="close" />

    <section class="panel">
      <header class="panel__head">
        <h2 class="panel__title">
          <span v-if="isPrivate" class="panel__lock" aria-hidden="true">◆</span>
          {{ sim.openThreadTitle }}
        </h2>
        <button class="panel__close" type="button" @click="close">Close</button>
      </header>

      <!--
        Said out loud once, at the top of the thread. A private message that
        looks identical to a group one is a message people will send to the
        wrong audience, and in a safety app the wrong audience for "need a
        hand" is one person.
      -->
      <p class="panel__who">
        {{
          isPrivate
            ? `Just you and ${sim.openThreadTitle}. Nobody else sees this.`
            : 'Everyone on the mesh sees this.'
        }}
      </p>

      <div ref="thread" class="panel__thread">
        <p v-if="messages.length === 0" class="panel__empty">Nothing said yet.</p>

        <article
          v-for="message in messages"
          :key="message.id"
          class="bubble"
          :class="{ 'bubble--mine': message.authorId === YOU_ID }"
        >
          <header class="bubble__head">
            <span class="bubble__who" :style="{ color: colourFor(message.authorId) }">
              {{ sim.nameFor(message.authorId) }}
            </span>
            <span class="bubble__time">{{ formatClock(message.sentAt) }}</span>
          </header>
          <p class="bubble__text">{{ message.text }}</p>
          <p
            v-if="message.authorId === YOU_ID"
            class="bubble__state"
            :class="{
              'age-recent': message.state === 'sending',
              'age-fresh': message.state === 'delivered',
              'age-lost': message.state === 'unacknowledged',
            }"
          >
            {{ stateLabel(message.state) }}
          </p>
        </article>
      </div>

      <div class="panel__presets">
        <button
          v-for="preset in PRESETS"
          :key="preset"
          class="preset"
          type="button"
          @click="send(preset)"
        >
          {{ preset }}
        </button>
      </div>

      <form class="panel__compose" @submit.prevent="send(draft)">
        <input
          v-model="draft"
          class="panel__input"
          type="text"
          inputmode="text"
          placeholder="Type something else"
          aria-label="Message"
        />
        <button class="panel__send" type="submit" :disabled="draft.trim().length === 0">
          Send
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 86dvh;
  background: var(--bg);
  border-top: 2px solid var(--line);
  border-radius: 16px 16px 0 0;
  overflow: hidden;
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 0;
}

.panel__title {
  margin: 0;
  flex: 1;
  font-size: 22px;
}

.panel__lock {
  color: var(--recent);
  margin-right: 2px;
}

.panel__close {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--surface-high);
  border: 1px solid var(--line);
  font-weight: 700;
}

.panel__who {
  margin: 4px 16px 0;
  font-size: 13px;
  color: var(--text-dim);
}

.panel__thread {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel__empty {
  color: var(--text-dim);
  text-align: center;
  margin-top: 24px;
}

.bubble {
  max-width: 82%;
  align-self: flex-start;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 8px 11px;
}

.bubble--mine {
  align-self: flex-end;
  background: var(--surface-high);
}

.bubble__head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
}

.bubble__who {
  font-weight: 800;
}

.bubble__time {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.bubble__text {
  margin: 3px 0 0;
  font-size: 17px;
}

.bubble__state {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
}

.panel__presets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px 12px 0;
  border-top: 1px solid var(--line);
}

.preset {
  min-height: 54px;
  border-radius: 12px;
  background: var(--surface-high);
  border: 2px solid var(--line);
  font-size: 16px;
  font-weight: 700;
}

.preset:active {
  border-color: var(--fresh);
}

.panel__compose {
  display: flex;
  gap: 8px;
  padding: 10px 12px calc(12px + var(--safe-bottom));
}

.panel__input {
  flex: 1;
  min-height: var(--tap);
  padding: 0 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 16px;
}

.panel__send {
  min-height: var(--tap);
  padding: 0 16px;
  border-radius: 10px;
  background: var(--surface-high);
  border: 2px solid var(--line);
  font-weight: 800;
}

.panel__send:disabled {
  opacity: 0.45;
}
</style>
