<script setup lang="ts">
/**
 * The first thing anyone sees, once.
 *
 * The prototype gets tested by sending one URL to the whole party, so it has
 * to ask who picked it up. Everything else in this app is deliberately
 * unexplained — the brief is explicit that the instinct to explain the
 * interface is the instinct to resist — so this screen asks one question and
 * says nothing else. Any copy here is copy that would have to be repeated by
 * somebody standing in a gully.
 */
import { nextTick, onMounted, ref } from 'vue'
import { useSimStore } from '@/stores/sim'
import { MAX_NAME_LENGTH, matchingMateId } from '@/sim/identity'

const sim = useSimStore()
const draft = ref('')
const field = ref<HTMLInputElement | null>(null)

function submit(): void {
  if (draft.value.trim().length === 0) {
    return
  }
  sim.setIdentity(draft.value)
}

onMounted(async () => {
  await nextTick()
  field.value?.focus()
})
</script>

<template>
  <div class="gate">
    <form class="gate__card" @submit.prevent="submit">
      <h1 class="gate__title">Cooee</h1>
      <label class="gate__label" for="you-name">Who's this?</label>
      <input
        id="you-name"
        ref="field"
        v-model="draft"
        class="gate__input"
        type="text"
        :maxlength="MAX_NAME_LENGTH"
        autocomplete="given-name"
        autocapitalize="words"
        spellcheck="false"
        placeholder="Your name"
      />

      <!--
        Said before they commit, not after. Someone typing "Ben" is about to
        watch Ben disappear off the ridge, and a party that silently loses a
        member is the kind of thing that makes people distrust the whole
        instrument.
      -->
      <p v-if="matchingMateId(draft) !== null" class="gate__note">
        You'll be on the map instead of out in front.
      </p>

      <button class="gate__go" type="submit" :disabled="draft.trim().length === 0">Start</button>
    </form>
  </div>
</template>

<style scoped>
.gate {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg);
}

.gate__card {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
}

.gate__title {
  margin: 0 0 28px;
  font-size: 34px;
  letter-spacing: 0.02em;
}

.gate__label {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
}

.gate__input {
  min-height: 56px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--surface);
  border: 2px solid var(--line);
  color: var(--text);
  font-size: 19px;
  font-weight: 700;
}

.gate__input:focus {
  outline: none;
  border-color: var(--fresh);
}

.gate__note {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--text-dim);
}

.gate__go {
  margin-top: 20px;
  min-height: 56px;
  border-radius: 12px;
  background: var(--surface-high);
  border: 2px solid var(--fresh);
  color: var(--text);
  font-size: 18px;
  font-weight: 800;
}

.gate__go:disabled {
  opacity: 0.4;
  border-color: var(--line);
}
</style>
