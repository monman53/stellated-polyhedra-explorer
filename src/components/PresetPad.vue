<template>
  <div class="preset-pad">
    <div class="preset-head">
      <button class="mini-btn" title="Previous preset" @click="emit('applyPreset', step(-1))">◀</button>
      <div class="preset-name">{{ label }}</div>
      <button class="mini-btn" title="Next preset" @click="emit('applyPreset', step(1))">▶</button>
      <button class="mini-btn" title="Select all cells" @click="emit('selectAll')">All</button>
    </div>
    <div
      class="preset-grid"
      @mousedown.prevent="onPresetDown"
      @mousemove="onPresetMove"
      @touchstart.prevent="onPresetTouch"
      @touchmove.prevent="onPresetTouch"
    >
      <button
        v-for="p in presetNames"
        :key="p.index"
        class="preset-btn"
        :class="[`preset-btn--${p.kind}`, { active: activePreset === p.index }]"
        :title="titleOf(p)"
        :data-idx="p.index"
      >{{ p.index + 1 }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface PresetInfo {
  index: number
  name: string
  symbol?: string
  duVal?: string
  wenninger?: string
  kind: 'shell' | 'mirror' | 'chiral'
}

const props = defineProps<{
  presetNames: PresetInfo[]
  activePreset: number
}>()
const emit = defineEmits<{ applyPreset: [idx: number]; selectAll: [] }>()

function titleOf(p: PresetInfo): string {
  let t = p.name
  if (p.symbol) t += ` ${p.symbol}`
  if (p.duVal) t += ` · ${p.duVal}`
  if (p.wenninger) t += ` · ${p.wenninger}`
  return t
}

const label = computed(() => {
  if (props.activePreset < 0) return 'Custom'
  const p = props.presetNames[props.activePreset]
  return p ? titleOf(p) : ''
})

// Step to the previous/next preset (wrapping; from Custom, ▶ starts at 1)
function step(d: number): number {
  const n = props.presetNames.length
  if (props.activePreset < 0) return d > 0 ? 0 : n - 1
  return (props.activePreset + d + n) % n
}

// Click, drag (mouse) or slide (finger) across the grid to switch presets
let presetDragging = false

function applyPresetAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const idxStr = el?.dataset?.idx
  if (idxStr === undefined) return
  const idx = Number(idxStr)
  if (idx !== props.activePreset) emit('applyPreset', idx)
}
function onPresetDown(e: MouseEvent) {
  presetDragging = true
  applyPresetAt(e.clientX, e.clientY)
  window.addEventListener('mouseup', () => { presetDragging = false }, { once: true })
}
function onPresetMove(e: MouseEvent) {
  if (presetDragging) applyPresetAt(e.clientX, e.clientY)
}
function onPresetTouch(e: TouchEvent) {
  const t = e.touches[0]
  if (t) applyPresetAt(t.clientX, t.clientY)
}
</script>

<style scoped>
.preset-pad {
  background: #12131dd9;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 2px 12px #0006;
  /* Fixed width so the button grid does not resize with the (sometimes very
     long) preset names — those wrap onto extra lines instead */
  width: 300px;
  max-width: calc(100vw - 16px);
}
.preset-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.preset-name {
  flex: 1;
  font-size: 11px;
  color: #88f;
  min-height: 14px;
  text-align: center;
}
.mini-btn {
  background: #22243a;
  color: #aaa;
  border: none;
  border-radius: 3px;
  padding: 2px 7px;
  font-size: 9px;
  cursor: pointer;
}
.mini-btn:hover { background: #33365a; color: #fff; }
.preset-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
  user-select: none;
  touch-action: none;
}
.preset-btn {
  background: #22243a;
  color: #aaa;
  border: none;
  border-radius: 3px;
  padding: 3px 7px;
  font-size: 9px;
  cursor: pointer;
}
/* Category tints: main shells / reflexible rows / chiral rows */
.preset-btn--shell  { background: #1c3a2c; color: #9c9; }
.preset-btn--mirror { background: #22304d; color: #9bc; }
.preset-btn--chiral { background: #3a2440; color: #c9c; }
.preset-btn--shell:hover  { background: #2c5a44; color: #fff; }
.preset-btn--mirror:hover { background: #334a78; color: #fff; }
.preset-btn--chiral:hover { background: #5a3a64; color: #fff; }
.preset-btn.active { background: #4455cc; color: #fff; }
</style>
