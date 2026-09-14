<script setup lang="ts">
/**
 * The messages themselves: history, the six presets, and the compose row.
 *
 * Shared by the group sheet and a mate's sheet so the two behave identically.
 * If a private thread read or acted differently from the group one, a test
 * would be measuring the difference between two designs instead of the thing
 * being asked — whether having somewhere private to say something changes what
 * people say.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useSimStore } from '@/stores/sim'
import { formatClock } from '@/lib/format'
import { YOU_ID } from '@/sim/mates'

const props = defineProps<{ threadId: string }>()

const sim = useSimStore()

/**
 * Six presets, because in the field you are wearing gloves, the phone is at
 * arm's length and you are not typing. Which six is a question for testing:
 * the brief wants to know which get used and which three are missing.
 *
 * A private thread gets the same six rather than a tailored set. Splitting
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
const log = ref<HTMLDivElement | null>(null)

const messages = computed(() => sim.messagesFor(props.threadId))

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
  sim.send(trimmed, props.threadId)
  draft.value = ''
}

watch(
  [() => messages.value.length, () => props.threadId],
  async () => {
    await nextTick()
    const el = log.value
    if (el !== null) {
      el.scrollTop = el.scrollHeight
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="log">
    <!--
      The stream and anything that temporarily covers it share this box, so a
      panel laid over the conversation takes the conversation's space and
      nothing else moves. Letting such a panel sit in the flex column instead
      starves the stream and pushes the compose row off the bottom of the
      screen, which costs you the Send button.
    -->
    <div class="log__area">
      <div ref="log" class="log__stream">
        <p v-if="messages.length === 0" class="log__empty">Nothing said yet.</p>

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

      <slot name="over-stream" />
    </div>

    <div class="log__presets">
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

    <form class="log__compose" @submit.prevent="send(draft)">
      <input
        v-model="draft"
        class="log__input"
        type="text"
        inputmode="text"
        placeholder="Type something else"
        aria-label="Message"
      />
      <button class="log__send" type="submit" :disabled="draft.trim().length === 0">Send</button>
    </form>
  </div>
</template>

<style scoped>
.log {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.log__area {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.log__stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log__empty {
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

.log__presets {
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

.log__compose {
  display: flex;
  gap: 8px;
  padding: 10px 12px calc(12px + var(--safe-bottom));
}

.log__input {
  flex: 1;
  min-height: var(--tap);
  padding: 0 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 16px;
}

.log__send {
  min-height: var(--tap);
  padding: 0 16px;
  border-radius: 10px;
  background: var(--surface-high);
  border: 2px solid var(--line);
  font-weight: 800;
}

.log__send:disabled {
  opacity: 0.45;
}
</style>
