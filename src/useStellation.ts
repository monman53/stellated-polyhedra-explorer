import { reactive, computed, watch } from 'vue'
import { getStellationData } from './geometry/stellation'
import {
  PRESETS, DODECA_PRESETS, OCTA_PRESETS, ICOSIDODECA_PRESETS, RHOMBIC30_PRESETS,
  TRUNCICOSA_PRESETS, TRUNCDODECA_PRESETS, CUBOCTA_PRESETS, RHOMBICDODECA_PRESETS,
  COLOR_PALETTES,
  FACE_TO_TYPE, FACE_TO_TYPE_DODECA, FACE_TO_TYPE_OCTA, FACE_TO_TYPE_ICOSIDODECA,
  FACE_TO_TYPE_RHOMBIC30, FACE_TO_TYPE_TRUNCICOSA, FACE_TO_TYPE_TRUNCDODECA,
  FACE_TO_TYPE_CUBOCTA, FACE_TO_TYPE_RHOMBICDODECA,
  hslToRgb,
} from './geometry/presets'
import type { Preset } from './geometry/presets'
import { buildFacePlanes } from './geometry/polyhedra'
import type { PolyId } from './geometry/polyhedra'
import { dot3 } from './geometry/math'
import type { Background } from './webgl/renderer'

// Per-face-plane colors (classic Wikipedia-SVG style): antipodal planes share
// a hue, giving nFaces/2 hues across the faces.
function computeFaceColors(poly: PolyId): Float32Array {
  const planes = buildFacePlanes(poly)
  const n = planes.length
  const pairIdx = new Array(n).fill(-1)
  let nPairs = 0
  for (let i = 0; i < n; i++) {
    if (pairIdx[i] >= 0) continue
    pairIdx[i] = nPairs
    for (let j = i + 1; j < n; j++) {
      if (dot3(planes[i].normal, planes[j].normal) < -0.999) { pairIdx[j] = nPairs; break }
    }
    nPairs++
  }
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const [r, g, b] = hslToRgb((pairIdx[i] / nPairs) % 1, 0.65, 0.55)
    arr[i*3] = r; arr[i*3+1] = g; arr[i*3+2] = b
  }
  return arr
}

function hexToRgbF(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Resolve a preset's Faces-column region numbers into our cell typeIds
function resolveFaces(faces: number[], faceToType: readonly number[], numTypes: number): Set<number> {
  const result = new Set<number>()
  for (const n of faces) {
    const t = faceToType[n]
    if (t !== undefined && t < numTypes) result.add(t)
  }
  return result
}

// Resolve a preset's chiral half selections into typeId → required mirrorHalf value.
// The five-tetrahedra face triangle contains the 'R' (chosen-f1) halves of
// regions 9,10 (f1 tops) and the 'L' halves of regions 5,6 (f1-covered bottoms).
function resolveHalves(
  halves: { [region: number]: 'R' | 'L' } | undefined,
  faceToType: readonly number[],
  numTypes: number
): Map<number, boolean> {
  const result = new Map<number, boolean>()
  if (!halves) return result
  for (const [regionStr, h] of Object.entries(halves)) {
    const region = Number(regionStr)
    const t = faceToType[region]
    if (t === undefined || t >= numTypes) continue
    const wantMirrorHalf = (region === 9 || region === 10) ? h === 'R' : h === 'L'
    result.set(t, wantMirrorHalf)
  }
  return result
}

// Shader choices: Normal/Flat always, the rest experimental.
// PALETTE_SHADERS color their cells from the palette (vertex colors).
export type ShaderId = 'normal' | 'flat' | 'iridescent' | 'toon' | 'metal' | 'glass'
export const SHADER_IDS: readonly ShaderId[] = ['normal', 'flat', 'iridescent', 'toon', 'metal', 'glass']
export const EXPERIMENTAL_SHADERS: readonly ShaderId[] = ['iridescent', 'toon', 'metal', 'glass']
export const PALETTE_SHADERS: readonly ShaderId[] = ['flat', 'toon', 'metal', 'glass']

const allFaces = (n: number) => new Set<number>(Array.from({ length: n }, (_, i) => i))

const POLY_PRESETS: Record<PolyId, Preset[]> = {
  icosa: PRESETS,
  dodeca: DODECA_PRESETS,
  octa: OCTA_PRESETS,
  icosidodeca: ICOSIDODECA_PRESETS,
  rhombic30: RHOMBIC30_PRESETS,
  truncicosa: TRUNCICOSA_PRESETS,
  truncdodeca: TRUNCDODECA_PRESETS,
  cubocta: CUBOCTA_PRESETS,
  rhombicdodeca: RHOMBICDODECA_PRESETS,
}
const POLY_FACE_TO_TYPE: Record<PolyId, readonly number[]> = {
  icosa: FACE_TO_TYPE,
  dodeca: FACE_TO_TYPE_DODECA,
  octa: FACE_TO_TYPE_OCTA,
  icosidodeca: FACE_TO_TYPE_ICOSIDODECA,
  rhombic30: FACE_TO_TYPE_RHOMBIC30,
  truncicosa: FACE_TO_TYPE_TRUNCICOSA,
  truncdodeca: FACE_TO_TYPE_TRUNCDODECA,
  cubocta: FACE_TO_TYPE_CUBOCTA,
  rhombicdodeca: FACE_TO_TYPE_RHOMBICDODECA,
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function sameMap(a: Map<number, boolean>, b: Map<number, boolean>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

export function useStellation() {
  const state = reactive({
    // Which polyhedron's stellations we explore
    polyhedron: 'icosa' as PolyId,

    // Selected cell types (by computed index)
    selectedTypes: new Set<number>([0]) as Set<number>,
    // Chiral half selections: typeId → required mirrorHalf value. Empty = full orbits.
    halfTypes: new Map<number, boolean>() as Map<number, boolean>,
    // Types seen from underneath (primed in the table) — explode with the outer chunk
    primedTypes: new Set<number>() as Set<number>,

    // Which face planes are rendered
    visibleFaces: allFaces(20) as Set<number>,

    // Shader ('normal' covers both normal-based colorings; see normalMode)
    shader: 'normal' as ShaderId,

    // Coloring of the normal shader: MathWorld tri-light or plain normal→RGB
    normalMode: 'mathworld' as 'mathworld' | 'rgb',

    // Background
    background: 'black' as Background,

    // Camera projection
    projection: 'perspective' as 'perspective' | 'ortho',

    // Explode factor [0, 1]
    explodeFactor: 0,

    // Render each selected 3D cell as a closed solid (auto-add the missing
    // boundary facets). Default off = classic open-surface rendering.
    closeCells: false,

    // Block view: show a bounding cube cut by every face plane — all
    // stellation cells plus the filler pieces that complete the cube.
    // Exploding scatters the pieces, as if the solid were carved out.
    blockView: false,

    // Face opacity [0, 1] — below 1 renders X-ray style
    opacity: 1,

    // Overlay facet outlines
    wireframe: false,

    // Sphere crop radius as fraction of mesh radius (1 = off)
    cropSphere: 1,

    // View-aligned cutaway depth fraction (0 = off)
    crossSection: 0,

    // Face-extension demo: grow all face planes from the core polygon
    // outward (0 = off → normal selected-cell rendering, 1 = full planes)
    extendFaces: 0,

    // Cut the solid by the reference face's plane, keeping the centre side
    faceCut: false,

    // Color palette index
    paletteIdx: 0,

    // Color used by the 'Uniform' palette
    uniformColor: '#ffffff',

    // Saturation / lightness of the depth-gradient palettes
    depthSaturation: 0.7,
    depthLightness: 0.55,

    // S/L adjust for the normal-based shaders (0.5 = neutral)
    normalSaturation: 0.5,
    normalLightness: 0.5,

    // Auto-rotate
    autoRotate: true,

    // UI mode: Normal shows just the basics, Advanced adds the full controls,
    // Experimental shows the clip/extend effect sliders instead
    panelMode: 'normal' as 'normal' | 'advanced' | 'experimental',
  })

  const data = computed(() => getStellationData(state.polyhedron))
  const numTypes = computed(() => data.value.numTypes)
  const numFaces = computed(() => buildFacePlanes(state.polyhedron).length)
  const presets = computed(() => POLY_PRESETS[state.polyhedron])
  const faceToType = computed(() => POLY_FACE_TO_TYPE[state.polyhedron])

  // Types whose orbit is split by the tetra triangle into two mirror triples
  // (icosa regions 5,6,9,10 — the f1 facet orbits). Only these can be half-selected.
  const splittableTypes = computed(() => {
    const result = new Set<number>()
    const seen = new Map<number, boolean>()
    for (const od of data.value.orbits) {
      for (const c of od.cells) {
        if (seen.has(c.typeId)) {
          if (seen.get(c.typeId) !== c.mirrorHalf) result.add(c.typeId)
        } else seen.set(c.typeId, c.mirrorHalf)
      }
    }
    return result
  })

  // Resolve colors from palette
  const colors = computed(() => {
    const palette = COLOR_PALETTES[state.paletteIdx]
    const n = numTypes.value
    const arr = new Float32Array(n * 3)
    const uni = palette.uniform ? hexToRgbF(state.uniformColor) : null
    for (let i = 0; i < n; i++) {
      const [r, g, b] = uni
        ?? (palette.gradient
          ? hslToRgb((i / Math.max(n - 1, 1)) * 240 / 360, state.depthSaturation, state.depthLightness)
          : palette.getColor(i, n))
      arr[i*3] = r; arr[i*3+1] = g; arr[i*3+2] = b
    }
    return arr
  })

  // Static per-face-plane colors for the 'By face' palette
  const faceColors = computed(() => computeFaceColors(state.polyhedron))

  // Preset metadata for UI. kind groups the table rows: the 8 main shells,
  // the reflexible (mirror-symmetric) rows 9–32, and the chiral rows 33–59.
  const presetNames = computed(() => presets.value.map((p, i) => ({
    index: i,
    name: p.name,
    symbol: p.symbol,
    duVal: p.duVal,
    wenninger: p.wenninger,
    kind: p.halves ? 'chiral' as const
      : state.polyhedron === 'icosa' && i >= 8 ? 'mirror' as const
      : 'shell' as const,
  })))

  // The preset whose selection exactly matches the current one (-1 = custom).
  // Presets can share types+halves and differ only in primed regions, so a
  // full match (primed included) wins over a match that ignores primed.
  const matchedPreset = computed(() => {
    const ft = faceToType.value
    const n = numTypes.value
    let loose = -1
    for (let i = 0; i < presets.value.length; i++) {
      const p = presets.value[i]
      if (!sameSet(resolveFaces(p.faces, ft, n), state.selectedTypes)) continue
      if (!sameMap(resolveHalves(p.halves, ft, n), state.halfTypes)) continue
      if (sameSet(resolveFaces(p.primed ?? [], ft, n), state.primedTypes)) return i
      if (loose < 0) loose = i
    }
    return loose
  })

  function applyPreset(idx: number) {
    const preset = presets.value[idx]
    state.selectedTypes = resolveFaces(preset.faces, faceToType.value, numTypes.value)
    state.halfTypes = resolveHalves(preset.halves, faceToType.value, numTypes.value)
    state.primedTypes = resolveFaces(preset.primed ?? [], faceToType.value, numTypes.value)
  }

  // Paint every cell type (full orbits, no primes)
  function selectAllTypes() {
    state.selectedTypes = new Set(Array.from({ length: numTypes.value }, (_, i) => i))
    state.halfTypes = new Map()
    state.primedTypes = new Set()
  }

  // Toggle the clicked half-orbit independently. For splittable types the
  // selection state per type is: none / one half (halfTypes entry) / full.
  function toggleHalf(typeId: number, mirrorHalf: boolean) {
    const sel = new Set(state.selectedTypes)
    const hm = new Map(state.halfTypes)
    if (!splittableTypes.value.has(typeId)) {
      // Unsplittable orbits toggle as a whole
      if (sel.has(typeId)) sel.delete(typeId)
      else sel.add(typeId)
      hm.delete(typeId)
    } else if (!sel.has(typeId)) {
      sel.add(typeId)                    // none → clicked half on
      hm.set(typeId, mirrorHalf)
    } else if (!hm.has(typeId)) {
      hm.set(typeId, !mirrorHalf)           // full → clicked half off
    } else if (hm.get(typeId) === mirrorHalf) {
      sel.delete(typeId)                 // selected half clicked → none
      hm.delete(typeId)
    } else {
      hm.delete(typeId)                  // other half clicked → full
    }
    state.selectedTypes = sel
    if (!sel.has(typeId) && state.primedTypes.has(typeId)) {
      const p = new Set(state.primedTypes)
      p.delete(typeId)
      state.primedTypes = p
    }
    state.halfTypes = hm
  }

  // Switching polyhedron: show all faces and start from its base solid
  // (skipped while restoring a snapshot, which sets its own selection)
  let restoring = false
  watch(() => state.polyhedron, () => {
    if (restoring) return
    state.visibleFaces = allFaces(numFaces.value)
    applyPreset(0)
  })

  // ── Snapshot: serializable view of the whole state (URL share + storage) ──
  function snapshot(): Record<string, unknown> {
    return {
      p: state.polyhedron,
      t: [...state.selectedTypes],
      h: [...state.halfTypes].map(([k, v]) => [k, v ? 1 : 0]),
      r: [...state.primedTypes],
      f: [...state.visibleFaces],
      sh: state.shader,
      nm: state.normalMode,
      bg: state.background,
      pj: state.projection,
      ex: state.explodeFactor,
      cc: state.closeCells ? 1 : 0,
      bk: state.blockView ? 1 : 0,
      op: state.opacity,
      wf: state.wireframe ? 1 : 0,
      cs: state.cropSphere,
      xs: state.crossSection,
      ef: state.extendFaces,
      fk: state.faceCut ? 1 : 0,
      pi: state.paletteIdx,
      uc: state.uniformColor,
      ds: state.depthSaturation,
      dl: state.depthLightness,
      ns: state.normalSaturation,
      nl: state.normalLightness,
      ar: state.autoRotate ? 1 : 0,
      md: state.panelMode,
    }
  }

  function loadSnapshot(s: Record<string, unknown>): boolean {
    if (!s || typeof s !== 'object' || !(String(s.p) in POLY_PRESETS)) return false
    const num = (v: unknown, d: number, lo: number, hi: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
    }
    const ints = (v: unknown, max: number) => new Set(
      (Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < max))
    restoring = true
    try {
      state.polyhedron = s.p as PolyId
      const nt = numTypes.value
      state.selectedTypes = ints(s.t, nt)
      const hm = new Map<number, boolean>()
      if (Array.isArray(s.h)) {
        for (const e of s.h) {
          if (!Array.isArray(e)) continue
          const k = Number(e[0])
          if (Number.isInteger(k) && k >= 0 && k < nt) hm.set(k, !!e[1])
        }
      }
      state.halfTypes = hm
      state.primedTypes = ints(s.r, nt)
      state.visibleFaces = s.f === undefined ? allFaces(numFaces.value) : ints(s.f, numFaces.value)
      state.shader = SHADER_IDS.includes(s.sh as ShaderId) ? s.sh as ShaderId : 'normal'
      state.normalMode = s.nm === 'rgb' ? 'rgb' : 'mathworld'
      state.background = s.bg === 'white' ? 'white' : 'black'
      state.projection = s.pj === 'ortho' ? 'ortho' : 'perspective'
      state.explodeFactor = num(s.ex, 0, 0, 10)
      state.closeCells = !!s.cc
      state.blockView = !!s.bk
      state.opacity = num(s.op, 1, 0, 1)
      state.wireframe = !!s.wf
      state.cropSphere = num(s.cs, 1, 0.02, 1)
      state.crossSection = num(s.xs, 0, 0, 1)
      state.extendFaces = num(s.ef, 0, 0, 1)
      state.faceCut = !!s.fk
      state.paletteIdx = Math.round(num(s.pi, 0, 0, COLOR_PALETTES.length - 1))
      state.uniformColor = typeof s.uc === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.uc) ? s.uc : '#ffffff'
      state.depthSaturation = num(s.ds, 0.7, 0, 1)
      state.depthLightness = num(s.dl, 0.55, 0, 1)
      state.normalSaturation = num(s.ns, 0.5, 0, 1)
      state.normalLightness = num(s.nl, 0.5, 0, 1)
      state.autoRotate = s.ar === undefined ? true : !!s.ar
      state.panelMode = s.md === 'advanced' || s.md === 'experimental' ? s.md : 'normal'
      return true
    } catch {
      return false
    } finally {
      // The polyhedron watcher flushes before timeouts, so it still sees the flag
      setTimeout(() => { restoring = false }, 0)
    }
  }

  // Reset everything to factory defaults and forget the saved session
  function resetAll() {
    try { localStorage.removeItem('stellation-state') } catch { /* blocked */ }
    try { history.replaceState(null, '', location.pathname + location.search) } catch { /* sandboxed */ }
    restoring = true
    state.polyhedron = 'icosa'
    state.shader = 'normal'
    state.normalMode = 'mathworld'
    state.background = 'black'
    state.projection = 'perspective'
    state.explodeFactor = 0
    state.closeCells = false
    state.blockView = false
    state.opacity = 1
    state.wireframe = false
    state.cropSphere = 1
    state.crossSection = 0
    state.extendFaces = 0
    state.faceCut = false
    state.paletteIdx = 0
    state.uniformColor = '#ffffff'
    state.depthSaturation = 0.7
    state.depthLightness = 0.55
    state.normalSaturation = 0.5
    state.normalLightness = 0.5
    state.autoRotate = true
    state.panelMode = 'normal'
    state.visibleFaces = allFaces(numFaces.value)
    selectAllTypes()
    setTimeout(() => { restoring = false }, 0)
  }

  // URL-safe base64 of the snapshot JSON (ASCII only)
  function encodeSnapshot(): string {
    return btoa(JSON.stringify(snapshot()))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  function decodeSnapshot(str: string): Record<string, unknown> {
    return JSON.parse(atob(str.replace(/-/g, '+').replace(/_/g, '/')))
  }

  // Restore on startup: a shared URL wins, then the last saved session
  let restored = false
  try {
    const m = location.hash.match(/[#&]s=([^&]+)/)
    if (m) restored = loadSnapshot(decodeSnapshot(m[1]))
  } catch { /* malformed share link: ignore */ }
  if (!restored) {
    try {
      const raw = localStorage.getItem('stellation-state')
      if (raw) restored = loadSnapshot(JSON.parse(raw))
    } catch { /* corrupted storage: ignore */ }
  }
  // Fresh start: the icosahedron with every cell painted (presets 1–8 united)
  if (!restored) selectAllTypes()

  // Persist every change (debounced)
  let saveTimer = 0
  watch(state, () => {
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      try { localStorage.setItem('stellation-state', JSON.stringify(snapshot())) } catch { /* full/blocked */ }
    }, 300)
  }, { deep: true })

  return {
    state,
    numTypes,
    numFaces,
    colors,
    faceColors,
    presetNames,
    matchedPreset,
    applyPreset,
    selectAllTypes,
    toggleHalf,
    encodeSnapshot,
    resetAll,
  }
}
