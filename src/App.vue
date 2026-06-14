<template>
  <div class="app" :style="appStyle">
    <!-- Two main elements: polyhedron (left) and stellation diagram (right) -->
    <div class="main">
      <div class="canvas-wrap" ref="canvasWrapRef">
        <WebGLCanvas
          ref="glRef"
          :renderState="renderState"
          :polyhedron="state.polyhedron"
          :selectedTypes="renderTypes"
          :halfTypes="renderHalves"
          :primedTypes="renderPrimed"
          :visibleFaces="state.visibleFaces"
          :explodeFactor="state.explodeFactor"
          :closeCells="state.closeCells"
          :block="state.blockView"
          :faceCut="state.faceCut"
          :autoRotate="state.autoRotate"
          @toggleAutoRotate="state.autoRotate = !state.autoRotate"
        />

        <!-- Mobile: diagram as a toggleable overlay -->
        <button
          class="diagram-fab"
          :class="{ active: showOverlay }"
          title="Stellation diagram"
          @click="showOverlay = !showOverlay"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M12 3 L21 19 L3 19 Z" />
            <path d="M7.5 11 L16.5 11 M12 3 L8 19 M12 3 L16 19" stroke-width="1" />
          </svg>
        </button>
        <!-- View tools: fullscreen + copy image -->
        <div class="view-btns">
          <button
            v-if="fsSupported"
            class="view-btn"
            :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
            @click="toggleFullscreen"
          >
            <svg v-if="!isFullscreen" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5" />
            </svg>
          </button>
          <button
            class="view-btn"
            :class="{ ok: copied }"
            title="Copy image to clipboard"
            @click="copyImage"
          >
            <svg v-if="!copied" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M8.5 7 L10 4.5 h4 L15.5 7" />
              <circle cx="12" cy="13.2" r="3.4" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M4 12.5 L9.5 18 L20 6.5" />
            </svg>
          </button>
          <button
            class="view-btn"
            :class="{ ok: shared }"
            title="Share (URL + image)"
            @click="shareState"
          >
            <svg v-if="!shared" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="17.5" cy="5.5" r="2.6" />
              <circle cx="17.5" cy="18.5" r="2.6" />
              <path d="M8.4 10.7 L15.2 6.8 M8.4 13.3 L15.2 17.2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M4 12.5 L9.5 18 L20 6.5" />
            </svg>
          </button>
          <button
            class="view-btn"
            :title="state.autoRotate ? 'Pause rotation' : 'Resume rotation'"
            @click="state.autoRotate = !state.autoRotate"
          >
            <svg v-if="state.autoRotate" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <rect x="6.5" y="5" width="3.6" height="14" rx="1" />
              <rect x="13.9" y="5" width="3.6" height="14" rx="1" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M8 5 L19 12 L8 19 Z" />
            </svg>
          </button>
          <button class="view-btn" title="Reset camera" @click="glRef?.resetCamera()">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 11 L12 4 L20 11" />
              <path d="M6.5 10 V19 H17.5 V10" />
            </svg>
          </button>
          <button class="view-btn danger" title="Reset all settings to defaults" @click="onResetAll">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M5.5 6.5 A 8.6 8.6 0 1 1 4 14" />
              <path d="M5.5 2.5 V7 H10" />
            </svg>
          </button>
        </div>

        <!-- Explode: the main play control, always at hand under the model -->
        <div class="explode-overlay">
          <span class="explode-label">Explode</span>
          <input type="range" min="0" max="10" step="0.01" v-model.number="state.explodeFactor" />
          <span class="explode-val">{{ Math.round(state.explodeFactor * 100) }}%</span>
        </div>

        <div v-show="showOverlay" class="diagram-overlay" @click.self="showOverlay = false">
          <StellationDiagram
            :poly="state.polyhedron"
            :selectedTypes="state.selectedTypes"
            :halfTypes="state.halfTypes"
            :colors="colors"
            :numTypes="numTypes"
            :background="state.background"
            @toggleHalf="toggleHalf"
          />
          <!-- Live 3D preview while painting the diagram -->
          <div v-if="showOverlay" class="preview-box">
            <WebGLCanvas
              :renderState="renderState"
              :polyhedron="state.polyhedron"
              :selectedTypes="renderTypes"
              :halfTypes="renderHalves"
              :primedTypes="renderPrimed"
              :visibleFaces="state.visibleFaces"
              :explodeFactor="state.explodeFactor"
              :closeCells="state.closeCells"
              :block="state.blockView"
              :faceCut="state.faceCut"
              :autoRotate="state.autoRotate"
            />
          </div>
        </div>
      </div>

      <div class="diagram-pane">
        <StellationDiagram
          :poly="state.polyhedron"
          :selectedTypes="state.selectedTypes"
          :halfTypes="state.halfTypes"
          :colors="colors"
          :numTypes="numTypes"
          :background="state.background"
          @toggleHalf="toggleHalf"
        />
      </div>

      <!-- Presets overlaid at the bottom-left of the diagram half -->
      <PresetPad
        class="preset-overlay"
        :class="{ open: showPresetPad }"
        :presetNames="presetNames"
        :activePreset="matchedPreset"
        @applyPreset="applyPreset"
        @selectAll="selectAllTypes"
      />

      <!-- Face-plane visibility at the bottom-left of the 3D half (advanced) -->
      <FacesPad
        v-if="state.panelMode !== 'normal'"
        class="faces-overlay"
        :class="{ open: showFacesPad }"
        :count="numFaces"
        :visibleFaces="state.visibleFaces"
        @setFaces="state.visibleFaces = $event"
      />

      <!-- Mobile: pads collapsed behind toggle buttons -->
      <button
        class="pad-fab preset-fab"
        :class="{ active: showPresetPad }"
        title="Presets"
        @click="showPresetPad = !showPresetPad; showFacesPad = false"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      </button>
      <!-- GitHub link floats at the top-right corner -->
      <a
        href="https://github.com/monman53/stellated-polyhedra-explorer"
        target="_blank"
        rel="noopener"
        class="gh-float"
        title="GitHub"
      >
        <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
            0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
            -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
            .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
            -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
            1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
            1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
            1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>

      <button
        v-if="state.panelMode !== 'normal'"
        class="pad-fab faces-fab"
        :class="{ active: showFacesPad }"
        title="Faces"
        @click="showFacesPad = !showFacesPad; showPresetPad = false"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M12 3 L20.5 9.2 L17.3 19.3 L6.7 19.3 L3.5 9.2 Z" />
          <path d="M12 3 L12 19.3 M3.5 9.2 L20.5 9.2" stroke-width="1" />
        </svg>
      </button>
    </div>

    <!-- Collapse handle + compact control bar along the bottom -->
    <button class="panel-toggle" :title="panelOpen ? 'Hide controls' : 'Show controls'" @click="panelOpen = !panelOpen">
      {{ panelOpen ? '▼ Close' : '▲ Controls' }}
    </button>
    <ControlPanel v-show="panelOpen" :state="state" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import WebGLCanvas from './components/WebGLCanvas.vue'
import ControlPanel from './components/ControlPanel.vue'
import StellationDiagram from './components/StellationDiagram.vue'
import PresetPad from './components/PresetPad.vue'
import FacesPad from './components/FacesPad.vue'
import { useStellation } from './useStellation'
import { COLOR_PALETTES } from './geometry/presets'
import { buildFacePlanes } from './geometry/polyhedra'
import type { RenderState } from './webgl/renderer'

const { state, numTypes, numFaces, colors, faceColors, presetNames, matchedPreset, applyPreset, selectAllTypes, toggleHalf, encodeSnapshot, resetAll } = useStellation()

// Factory reset (settings + saved session + camera), with confirmation
async function onResetAll() {
  if (!confirm('Reset all settings to defaults?')) return
  resetAll()
  await nextTick()  // let block-mode props settle before the camera refit check
  glRef.value?.resetCamera()
}

const showOverlay = ref(false)
// Mobile-only pad toggles (pads are always visible on desktop).
// Presets start open — they are the main way to explore.
const showPresetPad = ref(true)
const showFacesPad = ref(false)
// Control bar visibility (collapsible via the bottom handle; starts hidden)
const panelOpen = ref(false)

// While the face-extension demo is active, the 3D view shows the complete
// diagram of every plane (clipped by the extension radius in the shader);
// the diagram selection is untouched and comes back when the slider is off.
const extending = computed(() => state.extendFaces > 0.001)
const renderTypes = computed(() =>
  extending.value
    ? new Set(Array.from({ length: numTypes.value }, (_, i) => i))
    : state.selectedTypes)
const emptyHalves = new Map<number, boolean>()
const emptyPrimed = new Set<number>()
const renderHalves = computed(() => extending.value ? emptyHalves : state.halfTypes)
const renderPrimed = computed(() => extending.value ? emptyPrimed : state.primedTypes)

const renderState = computed<RenderState>(() => {
  const palette = COLOR_PALETTES[state.paletteIdx]
  return {
    shader: state.shader === 'normal'
      ? (state.normalMode === 'rgb' ? 'normal' : 'mathworld')
      : state.shader,
    background: state.background,
    colors: colors.value,
    colorMode: palette?.focus ? 'focus' : palette?.byFace ? 'face' : 'type',
    faceColors: faceColors.value,
    numTypes: numTypes.value,
    lightDir: [1.2, 1.8, 1.0],
    opacity: state.opacity,
    wireframe: state.wireframe,
    normalSL: [state.normalSaturation, state.normalLightness],
    cropSphere: state.cropSphere,
    crossSection: state.crossSection,
    extendFaces: state.extendFaces,
    planeDist: buildFacePlanes(state.polyhedron)[0].d,
    projection: state.projection,
  }
})

const appStyle = computed(() => {
  if (state.background === 'white') return { background: '#ffffff' }
  return { background: '#0d0e17' }
})

// ── View tools: fullscreen + copy image ──
const glRef = ref<InstanceType<typeof WebGLCanvas> | null>(null)
const canvasWrapRef = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const fsSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else canvasWrapRef.value?.requestFullscreen()
}
const onFsChange = () => { isFullscreen.value = !!document.fullscreenElement }
onMounted(() => document.addEventListener('fullscreenchange', onFsChange))
onUnmounted(() => document.removeEventListener('fullscreenchange', onFsChange))

// Share the current state: URL (state encoded in the hash) plus the current
// canvas image via the system share sheet, with clipboard-URL fallbacks.
// navigator.share must run in the same tick as the click (no awaits before
// it), or the user-gesture activation is lost and the sheet never opens.
const shared = ref(false)
function shareState() {
  const hash = `#s=${encodeSnapshot()}`
  history.replaceState(null, '', hash)
  const url = `${location.origin}${location.pathname}${hash}`
  const blob = glRef.value?.capture() ?? null
  const file = blob ? new File([blob], 'stellation.png', { type: 'image/png' }) : null
  const ok = () => {
    shared.value = true
    setTimeout(() => { shared.value = false }, 1500)
  }
  const fallbackCopy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(ok, () => legacyCopy(url) && ok())
    } else if (legacyCopy(url)) {
      ok()
    } else {
      prompt('Share URL:', url)  // last resort: let the user copy by hand
    }
  }
  const sharePromise =
    file && navigator.canShare?.({ files: [file] })
      ? navigator.share({ text: url, files: [file] })
      : navigator.share
        ? navigator.share({ url })
        : Promise.reject(new Error('unsupported'))
  sharePromise.then(ok, (e: Error) => {
    if (e?.name === 'AbortError') return  // user closed the sheet
    fallbackCopy()
  })
}

// execCommand works on plain-HTTP origins where the Clipboard API is absent
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let done = false
  try { done = document.execCommand('copy') } catch { /* unsupported */ }
  ta.remove()
  return done
}

const copied = ref(false)
// Save the current view as a PNG: download the file AND copy it to the
// clipboard (best-effort — the clipboard write is skipped where unsupported).
async function copyImage() {
  const blob = glRef.value?.capture()
  if (!blob) return

  // Download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'stellation.png'
  a.click()
  URL.revokeObjectURL(url)

  // Copy to clipboard (image clipboard needs a secure context + support)
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('no clipboard')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  } catch { /* clipboard image unsupported: the download still happened */ }

  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; }

.app {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Top row: the two equal halves */
.main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

/* Presets float over the bottom-left of the diagram (right) half */
.preset-overlay {
  position: absolute;
  left: calc(50% + 12px);
  bottom: 12px;
  z-index: 12;
}
/* Face toggles float over the bottom-left of the 3D (left) half */
.faces-overlay {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 12;
}
.canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}
.canvas-wrap .gl-canvas { width: 100%; height: 100%; }

.diagram-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  overflow: hidden;
}
/* As large as the half-screen allows: limited by pane width and height */
.main .diagram-pane .diagram-wrap {
  width: min(100%, calc(100vh - 180px));
}
.main .diagram-pane .diagram-svg { max-width: none; }

/* Explode slider pinned at the bottom-center of the 3D view */
.explode-overlay {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 13;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #12131db0;
  border-radius: 16px;
  padding: 6px 14px;
  color: #aab;
  font-size: 10px;
}
.explode-overlay input { width: min(34vw, 220px); }
.explode-label { text-transform: uppercase; letter-spacing: 0.08em; }
.explode-val { min-width: 34px; text-align: right; color: #889; }

/* View tools (fullscreen, copy image) at the top-left of the 3D view */
.view-btns {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 14;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: #22243a88;
  color: #99a;
  cursor: pointer;
}
.view-btn:hover { background: #33365a; color: #fff; }
.view-btn.ok { background: #2a8c5c; color: #fff; }
.view-btn.danger { color: #b77; }
.view-btn.danger:hover { background: #5a2a2a; color: #fff; }

/* Keep the app background behind the canvas when fullscreen */
.canvas-wrap:fullscreen { background: #0d0e17; }

/* GitHub link floating at the top-right corner of the view */
.gh-float {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #22243a88;
  color: #99a;
  text-decoration: none;
}
.gh-float:hover { background: #33365a; color: #fff; }

/* Handle to collapse/expand the control bar */
.panel-toggle {
  flex: none;
  width: 100%;
  height: 26px;
  border: none;
  background: #181a28;
  color: #778;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  z-index: 11;
}
.panel-toggle:hover { color: #ccd; background: #1e2133; }

/* Mobile-only toggles — hidden on desktop */
.diagram-fab { display: none; }
.diagram-overlay { display: none; }
.pad-fab { display: none; }

@media (max-width: 600px) {
  .diagram-pane { display: none; }
  /* Pads are collapsed behind bottom-corner toggle buttons.
     !important: the pads' scoped component styles (e.g. .preset-pad[data-v])
     set display:flex with higher specificity than these overrides. */
  .preset-overlay { display: none !important; left: auto; right: 8px; bottom: 58px; }
  .preset-overlay.open { display: flex !important; z-index: 18; }
  .faces-overlay { display: none !important; left: 8px; bottom: 58px; }
  .faces-overlay.open { display: flex !important; z-index: 18; }

  .pad-fab {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    bottom: 8px;
    width: 42px; height: 42px;
    border: none;
    border-radius: 50%;
    background: #22243acc;
    color: #ccc;
    cursor: pointer;
    z-index: 20;
  }
  .pad-fab.active { background: #4455cc; color: #fff; }
  .preset-fab { right: 8px; }
  .faces-fab { left: 8px; }
  /* Mobile panel layout lives in ControlPanel.vue's scoped styles */

  .diagram-fab {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 10px; left: 10px;
    width: 42px; height: 42px;
    border: none;
    border-radius: 50%;
    background: #22243acc;
    color: #ccc;
    cursor: pointer;
    z-index: 20;
  }
  .diagram-fab.active { background: #4455cc; color: #fff; }

  /* The diagram FAB occupies the top-left corner: tuck the view tools below it */
  .view-btns { top: 60px; }

  /* Easier thumb target for the control-bar toggle */
  .panel-toggle { height: 34px; font-size: 14px; }

  .diagram-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    inset: 0;
    background: #0007;
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
    z-index: 15;
  }
  .app .diagram-overlay .diagram-wrap { width: min(88vw, 70vh); }
  .app .diagram-overlay .diagram-svg { max-width: none; }

  /* Small live 3D preview while painting on the overlay (taps pass through).
     Pinned at the top-center, clear of the bottom preset/faces pads — the
     diagram FAB sits at the top-left and GitHub at the top-right corners. */
  .preview-box {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: 112px;
    height: 112px;
    border-radius: 10px;
    overflow: hidden;
    pointer-events: none;
    background: #0d0e17;
    box-shadow: 0 2px 10px #0008, 0 0 0 1px #ffffff22;
  }
  .preview-box .gl-canvas { width: 100%; height: 100%; }
}
</style>
