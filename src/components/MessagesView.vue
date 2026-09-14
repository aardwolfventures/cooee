<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useSimStore } from '@/stores/sim'
import { formatClock } from '@/lib/format'
import { YOU_ID, YOU_NAME } from '@/sim/mates'

const sim = useSimStore()

/**
 * Six presets, because in the field you are wearing gloves, the phone is at
 * arm's length and you are not typing. Which six is a question for testing:
 * the brief wants to know which get used and which three are missing.
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

/** Sent messages appear immediately; received ones only once delivered. */
const visible = computed(() =>
  sim.engine.messages.filter((m) => m.authorId === YOU_ID || m.state === 'delivered'),
)

function nameFor(authorId: string): string {
  if (authorId === YOU_ID) {
    return YOU_NAME
  }
  return sim.engine.mate(authorId)?.name ?? authorId
}

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
  if (trimmed.length === 0) {
    return
  }
  sim.send(trimmed)
  draft.value = ''
}

watch(
  () => visible.value.length,
  async () => {
    await nextTick()
    const el = thread.value
    if (el !== null) {
      el.scrollTop = el.scrollHeight
    }
  },
)
</script>

<template>
  <section class="messages">
    <div ref="thread" class="messages__thread">
      <p v-if="visible.length === 0" class="messages__empty">Nothing said yet.</p>

      <article
        v-for="message in visible"
        :key="message.id"
        class="bubble"
        :class="{ 'bubble--mine': message.authorId === YOU_ID }"
      >
        <header class="bubble__head">
          <span class="bubble__who" :style="{ color: colourFor(message.authorId) }">
            {{ nameFor(message.authorId) }}
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

    <div class="messages__presets">
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

    <form class="messages__compose" @submit.prevent="send(draft)">
      <input
        v-model="draft"
        class="messages__input"
        type="text"
        inputmode="text"
        placeholder="Type something else"
        aria-label="Message"
      />
      <button class="messages__send" type="submit" :disabled="draft.trim().length === 0">
        Send
      </button>
    </form>
  </section>
</template>

<style scoped>
.messages {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.messages__thread {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.messages__empty {
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

.messages__presets {
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

.messages__compose {
  display: flex;
  gap: 8px;
  padding: 10px 12px 12px;
}

.messages__input {
  flex: 1;
  min-height: var(--tap);
  padding: 0 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 16px;
}

.messages__send {
  min-height: var(--tap);
  padding: 0 16px;
  border-radius: 10px;
  background: var(--surface-high);
  border: 2px solid var(--line);
  font-weight: 800;
}

.messages__send:disabled {
  opacity: 0.45;
}
</style>
