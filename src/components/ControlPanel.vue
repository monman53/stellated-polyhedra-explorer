<template>
  <aside class="panel">
    <!-- Polyhedron -->
    <section class="section">
      <label class="section-label">Polyhedron</label>
      <select v-model="state.polyhedron" class="poly-select">
        <option v-for="p in polyhedra" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>
    </section>

    <!-- Shader (the experimental ones appear in Experimental mode) -->
    <section class="section">
      <label class="section-label">Shader</label>
      <div class="btn-row">
        <button
          v-for="s in shaders"
          :key="s.value"
          class="small-btn"
          :class="{ active: state.shader === s.value }"
          @click="state.shader = s.value"
        >{{ s.label }}</button>
      </div>
    </section>

    <!-- Colors -->
    <section v-if="state.panelMode !== 'normal'" class="section">
      <label class="section-label">Colors</label>
      <div v-if="state.shader === 'normal'" class="btn-row">
        <button
          v-for="m in normalModes"
          :key="m.value"
          class="small-btn"
          :class="{ active: state.normalMode === m.value }"
          @click="state.normalMode = m.value"
        >{{ m.label }}</button>
      </div>
      <div v-else-if="usesPalette" class="btn-row">
        <button
          v-for="(p, i) in palettes"
          :key="i"
          class="small-btn"
          :class="{ active: state.paletteIdx === i }"
          @click="state.paletteIdx = i"
        >{{ p }}</button>
        <input
          v-if="isUniform"
          type="color"
          v-model="state.uniformColor"
          class="color-pick"
          title="Uniform color"
        />
      </div>
    </section>

    <!-- Toggles -->
    <section v-if="state.panelMode !== 'normal'" class="section section--center">
      <div class="toggles">
        <label class="toggle-row">
          <input type="checkbox" v-model="state.wireframe" />
          <span>Wireframe</span>
        </label>
        <label class="toggle-row" title="Render each selected cell as a closed solid">
          <input type="checkbox" v-model="state.closeCells" />
          <span>Closed cells</span>
        </label>
        <label class="toggle-row" title="Show a cube cut by every face plane — explode to scatter the pieces">
          <input type="checkbox" v-model="state.blockView" />
          <span>Block</span>
        </label>
        <label class="toggle-row" title="Hide whole cells beyond the reference face's plane, keeping the centre side">
          <input type="checkbox" v-model="state.faceCut" />
          <span>Face cut</span>
        </label>
      </div>
    </section>

    <!-- Opacity (X-ray) -->
    <section v-if="state.panelMode !== 'normal'" class="section">
      <label class="section-label">Opacity <span class="muted">{{ Math.round(state.opacity * 100) }}%</span></label>
      <input type="range" min="0" max="1" step="0.01" v-model.number="state.opacity" class="full-slider" />
    </section>

    <!-- Saturation / lightness (targets the active shader's coloring) -->
    <section v-if="state.panelMode !== 'normal'" class="section">
      <label class="section-label">Saturation</label>
      <input type="range" min="0" max="1" step="0.01" v-model.number="slSaturation" class="full-slider" />
    </section>
    <section v-if="state.panelMode !== 'normal'" class="section">
      <label class="section-label">Lightness</label>
      <input type="range" min="0" max="1" step="0.01" v-model.number="slLightness" class="full-slider" />
    </section>

    <!-- Camera projection -->
    <section v-if="state.panelMode !== 'normal'" class="section">
      <label class="section-label">Camera</label>
      <div class="btn-row">
        <button
          v-for="c in projections"
          :key="c.value"
          class="small-btn"
          :class="{ active: state.projection === c.value }"
          @click="state.projection = c.value"
        >{{ c.label }}</button>
      </div>
    </section>

    <!-- Background -->
    <section v-if="state.panelMode !== 'normal'" class="section">
      <label class="section-label">Background</label>
      <div class="btn-row">
        <button
          v-for="bg in bgs"
          :key="bg.value"
          class="small-btn"
          :class="{ active: state.background === bg.value }"
          @click="state.background = bg.value"
        >{{ bg.label }}</button>
      </div>
    </section>

    <!-- Experimental effects -->
    <section v-if="state.panelMode === 'experimental'" class="section">
      <label class="section-label">Extend <span class="muted">{{ state.extendFaces <= 0.001 ? 'Off' : Math.round(state.extendFaces * 100) + '%' }}</span></label>
      <input type="range" min="0" max="1" step="0.002" v-model.number="state.extendFaces" class="full-slider" />
    </section>
    <section v-if="state.panelMode === 'experimental'" class="section">
      <label class="section-label">Sphere crop <span class="muted">{{ state.cropSphere >= 0.999 ? 'Off' : Math.round(state.cropSphere * 100) + '%' }}</span></label>
      <input type="range" min="0.02" max="1" step="0.01" v-model.number="state.cropSphere" class="full-slider" />
    </section>
    <section v-if="state.panelMode === 'experimental'" class="section">
      <label class="section-label">Cross section <span class="muted">{{ state.crossSection <= 0.001 ? 'Off' : Math.round(state.crossSection * 100) + '%' }}</span></label>
      <input type="range" min="0" max="1" step="0.01" v-model.number="state.crossSection" class="full-slider" />
    </section>

    <!-- UI mode: Normal / Advanced / Experimental — right-aligned on desktop,
         last row on mobile -->
    <section class="section section--right section--mode">
      <label class="section-label">Mode</label>
      <div class="btn-row">
        <button
          v-for="m in panelModes"
          :key="m.value"
          class="small-btn"
          :class="{ active: state.panelMode === m.value }"
          @click="setPanelMode(m.value)"
        >{{ m.label }}</button>
      </div>
    </section>

  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_PALETTES } from '../geometry/presets'
import { SHADER_IDS, EXPERIMENTAL_SHADERS, PALETTE_SHADERS } from '../useStellation'
import type { ShaderId } from '../useStellation'
import type { PolyId } from '../geometry/polyhedra'
import type { Background } from '../webgl/renderer'

const props = defineProps<{
  state: ReturnType<typeof import('../useStellation').useStellation>['state']
}>()

// Ordered by face count
const polyhedra: { value: PolyId; label: string }[] = [
  { value: 'octa',          label: 'Octahedron (8)' },
  { value: 'dodeca',        label: 'Dodecahedron (12)' },
  { value: 'rhombicdodeca', label: 'Rhombic dodecahedron (12)' },
  { value: 'cubocta',       label: 'Cuboctahedron (8+6)' },
  { value: 'icosa',         label: 'Icosahedron (20)' },
  { value: 'rhombic30',     label: 'Rhombic triacontahedron (30)' },
  { value: 'icosidodeca',   label: 'Icosidodecahedron (20+12)' },
  { value: 'truncicosa',    label: 'Truncated icosahedron (20+12)' },
  { value: 'truncdodeca',   label: 'Truncated dodecahedron (12+20)' },
]

const SHADER_LABELS: Record<ShaderId, string> = {
  normal: 'Normal',
  flat: 'Flat',
  iridescent: 'Iridescent',
  toon: 'Toon',
  metal: 'Metal',
  glass: 'Glass',
}
const shaders = computed<{ value: ShaderId; label: string }[]>(() =>
  SHADER_IDS
    .filter(s => props.state.panelMode === 'experimental' || !EXPERIMENTAL_SHADERS.includes(s))
    .map(s => ({ value: s, label: SHADER_LABELS[s] })))

// Palette-colored shaders show the palette picker and target the depth S/L
const usesPalette = computed(() => PALETTE_SHADERS.includes(props.state.shader))

// Colors for the normal shader: two normal-based colorings
const normalModes: { value: 'mathworld' | 'rgb'; label: string }[] = [
  { value: 'mathworld', label: 'MathWorld' },
  { value: 'rgb',       label: 'RGB' },
]

const isUniform = computed(() => COLOR_PALETTES[props.state.paletteIdx]?.uniform === true)

// UI modes. Leaving Experimental turns its effects off so nothing keeps
// clipping the model with the sliders hidden.
type PanelMode = 'normal' | 'advanced' | 'experimental'
const panelModes: { value: PanelMode; label: string }[] = [
  { value: 'normal',       label: 'Normal' },
  { value: 'advanced',     label: 'Advanced' },
  { value: 'experimental', label: 'Experimental' },
]
function setPanelMode(m: PanelMode) {
  if (props.state.panelMode === m) return
  if (props.state.panelMode === 'experimental' && m !== 'experimental') {
    props.state.extendFaces = 0
    props.state.cropSphere = 1
    props.state.crossSection = 0
    if (EXPERIMENTAL_SHADERS.includes(props.state.shader)) props.state.shader = 'normal'
  }
  props.state.panelMode = m
}
// The S/L sliders target the coloring of the active shader: the gradient
// palette for Flat, the normal-based shader adjust otherwise
const slSaturation = computed({
  get: () => usesPalette.value ? props.state.depthSaturation : props.state.normalSaturation,
  set: (v: number) => {
    if (usesPalette.value) props.state.depthSaturation = v
    else props.state.normalSaturation = v
  },
})
const slLightness = computed({
  get: () => usesPalette.value ? props.state.depthLightness : props.state.normalLightness,
  set: (v: number) => {
    if (usesPalette.value) props.state.depthLightness = v
    else props.state.normalLightness = v
  },
})
const bgs: { value: Background; label: string }[] = [
  { value: 'black', label: 'Dark' },
  { value: 'white', label: 'Light' },
]

const projections: { value: 'perspective' | 'ortho'; label: string }[] = [
  { value: 'perspective', label: 'Perspective' },
  { value: 'ortho',       label: 'Orthographic' },
]

const palettes = COLOR_PALETTES.map(p => p.name)
</script>

<style scoped>
.panel {
  flex: none;
  width: 100%;
  background: #12131d;
  color: #ddd;
  font-size: 12px;
  padding: 10px 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 20px;
  z-index: 10;
  box-shadow: 0 -4px 16px #0006;
  /* Never let the bar push its own controls off-screen */
  max-height: 55vh;
  overflow-y: auto;
}
.section { display: flex; flex-direction: column; gap: 5px; flex: none; }
.section--center { align-self: center; }
.section--right { margin-left: auto; }
.section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; }
.muted { color: #888; font-weight: normal; }

.btn-row { display: flex; gap: 4px; flex-wrap: nowrap; }
.small-btn {
  background: #22243a;
  color: #aaa;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.small-btn:hover { background: #33365a; color: #fff; }
.small-btn.active { background: #4455cc; color: #fff; }

.color-pick {
  width: 28px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: #22243a;
  cursor: pointer;
}

.poly-select {
  background: #22243a;
  color: #ddd;
  border: none;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
  max-width: 200px;
}
.poly-select:hover { background: #33365a; }

.full-slider { width: 150px; }

.slider-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.slider-row label { color: #888; }
.slider-row input { width: 80px; }

.toggles {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 100%;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

/* Mobile: compact label-left / control-right rows, Mode pinned first,
   scrollable with a hard height cap */
@media (max-width: 600px) {
  .panel {
    flex-direction: column;
    /* No wrapping: with column direction, overflow would wrap into a new
       column to the right (clipped) instead of scrolling vertically */
    flex-wrap: nowrap;
    align-items: stretch;
    height: auto;
    max-height: 38vh;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    gap: 8px;
    padding: 8px 14px 12px;
  }
  /* Rows must keep their height inside the scroll container */
  .section { flex: none; }
  .section {
    width: 100%;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .section--right { margin-left: 0; }
  .section--center { align-self: auto; }
  .section-label { flex: none; width: 104px; }
  .btn-row { flex: 1; flex-wrap: wrap; gap: 6px; }
  .small-btn { padding: 7px 12px; font-size: 13px; }
  .full-slider { flex: 1; width: auto; height: 26px; }
  .poly-select { max-width: none; flex: 1; width: auto; padding: 8px; font-size: 13px; }
  .toggles { gap: 22px; }
  .toggle-row { font-size: 13px; }
  .toggle-row input { width: 18px; height: 18px; }
  .color-pick { width: 40px; height: 32px; }
}
</style>
