<template>
  <div class="diagram-wrap">
    <div v-if="data.orbits.length > 1" class="orbit-toggle">
      <button
        v-for="(od, i) in data.orbits"
        :key="i"
        :class="{ active: orbitIdx === i }"
        @click="orbitIdx = i"
      >{{ orbitLabel(i) }}</button>
    </div>
    <button v-if="zoom > 1.001" class="zoom-reset" @click="resetZoom">⌂ 1:1</button>
    <svg
      :viewBox="viewBox"
      class="diagram-svg"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseLeave"
      @wheel.prevent="onWheel"
      @touchstart.prevent="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend="onTouchEnd"
    >
      <!-- Stellation lines (behind cells) -->
      <line
        v-for="(seg, i) in lineSegments"
        :key="'l' + i"
        :x1="seg[0][0]" :y1="seg[0][1]"
        :x2="seg[1][0]" :y2="seg[1][1]"
        :stroke="props.background === 'white' ? '#0002' : '#fff2'"
        stroke-width="0.02"
        pointer-events="none"
      />
      <!-- Cells -->
      <polygon
        v-for="cell in cells"
        :key="cell.id"
        :points="toPoints(cell.vertices)"
        :fill="cellFill(cell)"
        :stroke="cellStroke(cell)"
        stroke-width="0.015"
        class="cell"
      />
      <!-- Face outline -->
      <polygon
        :points="faceOutlinePoints"
        fill="none"
        stroke="#fff4"
        stroke-width="0.025"
        pointer-events="none"
      />
    </svg>
    <div class="diagram-label">Stellation diagram</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getStellationData } from '../geometry/stellation'
import type { Vec2 } from '../geometry/math'
import { getPolyhedron, buildFacePlanes, project2D } from '../geometry/icosahedron'
import type { PolyId } from '../geometry/icosahedron'

const props = defineProps<{
  poly: PolyId
  selectedTypes: Set<number>
  halfTypes: Map<number, boolean>
  colors: Float32Array
  numTypes: number
  background: string
}>()
const emit = defineEmits<{ toggleHalf: [typeId: number, mirrorHalf: boolean] }>()

const data = computed(() => getStellationData(props.poly))

// Polyhedra with two face shapes (icosidodecahedron) have one diagram per
// face orbit; a small toggle picks which one is shown. Both paint the same
// global cell-type selection.
const orbitIdx = ref(0)
const orbit = computed(() =>
  data.value.orbits[Math.min(orbitIdx.value, data.value.orbits.length - 1)])
const cells = computed(() => orbit.value.cells)

function orbitLabel(i: number): string {
  const od = data.value.orbits[i]
  const k = getPolyhedron(props.poly).faces[od.refFace].length
  return k === 3 ? '△' : k === 4 ? '◻' : k === 5 ? '⬠' : k === 6 ? '⬡' : `${k}-gon`
}

// Display rotation to the conventional stellation-diagram orientation:
// the icosahedron projection comes out 60° off; otherwise we rotate the
// reference face's vertex 0 to point up. Pointer coordinates are
// inverse-rotated for hit testing.
const rotM = computed<[number, number, number, number]>(() => {
  let t: number
  if (props.poly === 'icosa') {
    t = Math.PI / 3
  } else {
    const refFace = orbit.value.refFace
    const { verts, faces } = getPolyhedron(props.poly)
    const p0 = project2D(verts[faces[refFace][0]], buildFacePlanes(props.poly)[refFace])
    t = -Math.PI / 2 - Math.atan2(p0[1], p0[0])  // vertex 0 → visually up (SVG y-down)
  }
  return [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)]
})
const rot = ([x, y]: Vec2): Vec2 => {
  const m = rotM.value
  return [m[0] * x + m[1] * y, m[2] * x + m[3] * y]
}
const unrot = ([x, y]: Vec2): Vec2 => {
  const m = rotM.value  // inverse of a rotation = transpose
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y]
}

// Clip line a*x + b*y = c to square [-R, R] and return endpoints
function lineToSeg(a: number, b: number, c: number, R: number): [Vec2, Vec2] | null {
  const pts: Vec2[] = []
  const eps = 1e-9
  if (Math.abs(b) > eps) {
    const y1 = (c + a * R) / b;  if (y1 >= -R - eps && y1 <= R + eps) pts.push([-R, y1])
    const y2 = (c - a * R) / b;  if (y2 >= -R - eps && y2 <= R + eps) pts.push([R, y2])
  }
  if (Math.abs(a) > eps) {
    const x1 = (c + b * R) / a;  if (x1 >= -R - eps && x1 <= R + eps) pts.push([x1, -R])
    const x2 = (c - b * R) / a;  if (x2 >= -R - eps && x2 <= R + eps) pts.push([x2, R])
  }
  const uniq: Vec2[] = []
  for (const p of pts) {
    if (!uniq.some(q => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < 1e-6)) uniq.push(p)
  }
  if (uniq.length < 2) return null
  return [uniq[0], uniq[uniq.length - 1]]
}

const LINE_R = 18  // how far lines extend (all outer intersections are within ~15.8)
const lineSegments = computed(() =>
  orbit.value.lines.flatMap(({ a, b, c }) => {
    const seg = lineToSeg(a, b, c, LINE_R)
    return seg ? [[rot(seg[0]), rot(seg[1])] as [Vec2, Vec2]] : []
  })
)

// Compute face outline (reference face vertices in 2D)
const faceOutlinePoints = computed(() => {
  const refFace = orbit.value.refFace
  const ref = buildFacePlanes(props.poly)[refFace]
  const { verts, faces } = getPolyhedron(props.poly)
  const pts = faces[refFace].map(vi => rot(project2D(verts[vi], ref)))
  return pts.map(p => `${p[0]},${p[1]}`).join(' ')
})

// Base box: auto-fit all cells with a margin
const baseBox = computed(() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const cell of cells.value) {
    for (const v of cell.vertices) {
      const [x, y] = rot(v)
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
  }
  const m = 0.3
  return {
    minX: minX - m, minY: minY - m,
    w: maxX - minX + 2*m, h: maxY - minY + 2*m,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
  }
})

// Zoom / pan: wheel zooms around the cursor, two-finger pinch zooms and pans
const zoom = ref(1)
const center = ref<[number, number] | null>(null)  // null = base center

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const viewBox = computed(() => {
  const b = baseBox.value
  const z = zoom.value
  const w = b.w / z, h = b.h / z
  let cx = center.value?.[0] ?? b.cx
  let cy = center.value?.[1] ?? b.cy
  cx = clamp(cx, b.minX + w/2, b.minX + b.w - w/2)
  cy = clamp(cy, b.minY + h/2, b.minY + b.h - h/2)
  return `${cx - w/2} ${cy - h/2} ${w} ${h}`
})

function resetZoom() {
  zoom.value = 1
  center.value = null
}

function svgPointAt(svgEl: SVGSVGElement, x: number, y: number): [number, number] {
  const pt = svgEl.createSVGPoint()
  pt.x = x; pt.y = y
  const p = pt.matrixTransform(svgEl.getScreenCTM()!.inverse())
  return [p.x, p.y]
}

function onWheel(e: WheelEvent) {
  const svgEl = e.currentTarget as SVGSVGElement
  const p = svgPointAt(svgEl, e.clientX, e.clientY)
  const b = baseBox.value
  const oldZ = zoom.value
  const newZ = clamp(oldZ * Math.exp(-e.deltaY * 0.002), 1, 25)
  const c = center.value ?? [b.cx, b.cy]
  const k = oldZ / newZ  // keep the point under the cursor fixed
  center.value = [p[0] + (c[0] - p[0]) * k, p[1] + (c[1] - p[1]) * k]
  zoom.value = newZ
  if (newZ <= 1.001) resetZoom()
}

// Two-finger pinch state
let pinch: { d0: number; z0: number; mid0: [number, number] } | null = null

function pinchStart(svgEl: SVGSVGElement, t0: Touch, t1: Touch) {
  pinch = {
    d0: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
    z0: zoom.value,
    mid0: svgPointAt(svgEl, (t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2),
  }
}

function pinchMove(svgEl: SVGSVGElement, t0: Touch, t1: Touch) {
  if (!pinch) return
  const rect = svgEl.getBoundingClientRect()
  const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
  const z = clamp(pinch.z0 * d / Math.max(pinch.d0, 1), 1, 25)
  const b = baseBox.value
  const w = b.w / z, h = b.h / z
  // Keep the gesture's initial midpoint under the fingers' current midpoint
  const fx = ((t0.clientX + t1.clientX) / 2 - rect.left) / rect.width
  const fy = ((t0.clientY + t1.clientY) / 2 - rect.top) / rect.height
  center.value = [pinch.mid0[0] - fx * w + w / 2, pinch.mid0[1] - fy * h + h / 2]
  zoom.value = z
}

function toPoints(verts: Vec2[]): string {
  return verts.map(v => rot(v)).map(([x,y]) => `${x},${y}`).join(' ')
}

function cellFill(cell: { typeId: number; mirrorHalf: boolean }) {
  if (!isHalfSelected(cell.typeId, cell.mirrorHalf)) {
    return props.background === 'white' ? '#ddd8' : '#1a1a2a'
  }
  const t = cell.typeId, base = t * 3
  const r = Math.round((props.colors[base] ?? 0.7) * 255)
  const g = Math.round((props.colors[base+1] ?? 0.7) * 255)
  const b = Math.round((props.colors[base+2] ?? 0.7) * 255)
  return `rgb(${r},${g},${b})`
}

function cellStroke(cell: { typeId: number }) {
  return props.background === 'white' ? '#8886' : '#fff3'
}

// Interaction: click/tap = toggle; drag/slide = fill or clear depending on start cell state
// Toggling operates on half-orbits: (typeId, mirrorHalf) — splittable orbits' halves are independent.
const dragging = ref(false)
let wasDrag = false
let dragFill = true  // true = fill mode, false = clear mode (set on drag start)
let dragOrigin: [number, number] = [0, 0]
let lastToggled = ''
const DRAG_PX2 = 25  // 5px threshold to distinguish click from drag

function getCellAtPoint(svgEl: SVGSVGElement, x: number, y: number): { typeId: number; mirrorHalf: boolean } | null {
  const pt = svgEl.createSVGPoint()
  pt.x = x; pt.y = y
  const svgPt = pt.matrixTransform(svgEl.getScreenCTM()!.inverse())
  const p = unrot([svgPt.x, svgPt.y])
  for (const cell of cells.value) {
    if (pointInPolygon(p, cell.vertices)) return cell
  }
  return null
}

function isHalfSelected(typeId: number, mirrorHalf: boolean): boolean {
  if (!props.selectedTypes.has(typeId)) return false
  const h = props.halfTypes.get(typeId)
  return h === undefined || h === mirrorHalf
}

function pointInPolygon([px, py]: Vec2, verts: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const [xi, yi] = verts[i], [xj, yj] = verts[j]
    if (((yi > py) !== (yj > py)) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) inside = !inside
  }
  return inside
}

function startDrag(svgEl: SVGSVGElement, x: number, y: number) {
  dragging.value = true; wasDrag = false; lastToggled = ''
  dragOrigin = [x, y]
  const c = getCellAtPoint(svgEl, x, y)
  dragFill = !c || !isHalfSelected(c.typeId, c.mirrorHalf)
}
function moveDrag(svgEl: SVGSVGElement, x: number, y: number, ox: number, oy: number) {
  if (!dragging.value) return
  const dx = x - ox, dy = y - oy
  if (!wasDrag && dx*dx + dy*dy < DRAG_PX2) return
  wasDrag = true
  const c = getCellAtPoint(svgEl, x, y)
  if (!c) return
  const key = `${c.typeId}:${c.mirrorHalf}`
  if (key === lastToggled) return
  const sel = isHalfSelected(c.typeId, c.mirrorHalf)
  if ((dragFill && !sel) || (!dragFill && sel)) {
    emit('toggleHalf', c.typeId, c.mirrorHalf)
    lastToggled = key
  }
}

function onMouseDown(e: MouseEvent) { startDrag(e.currentTarget as SVGSVGElement, e.clientX, e.clientY) }
function onMouseMove(e: MouseEvent) { moveDrag(e.currentTarget as SVGSVGElement, e.clientX, e.clientY, dragOrigin[0], dragOrigin[1]) }
function onMouseUp(e: MouseEvent) {
  if (dragging.value && !wasDrag) {
    const c = getCellAtPoint(e.currentTarget as SVGSVGElement, e.clientX, e.clientY)
    if (c) emit('toggleHalf', c.typeId, c.mirrorHalf)
  }
  dragging.value = false; wasDrag = false
}
function onMouseLeave() { dragging.value = false; wasDrag = false }

function onTouchStart(e: TouchEvent) {
  const svgEl = e.currentTarget as SVGSVGElement
  if (e.touches.length === 2) {
    // Two fingers: pinch zoom/pan, cancel any cell painting
    dragging.value = false; wasDrag = false
    pinchStart(svgEl, e.touches[0], e.touches[1])
    return
  }
  if (pinch) return
  startDrag(svgEl, e.touches[0].clientX, e.touches[0].clientY)
}
function onTouchMove(e: TouchEvent) {
  const svgEl = e.currentTarget as SVGSVGElement
  if (e.touches.length === 2) { pinchMove(svgEl, e.touches[0], e.touches[1]); return }
  if (pinch) return  // a finger left after pinching: ignore until all lift
  moveDrag(svgEl, e.touches[0].clientX, e.touches[0].clientY, dragOrigin[0], dragOrigin[1])
}
function onTouchEnd(e: TouchEvent) {
  if (pinch) {
    if (e.touches.length === 0) {
      pinch = null
      if (zoom.value <= 1.001) resetZoom()
    }
    dragging.value = false; wasDrag = false
    return
  }
  if (dragging.value && !wasDrag) {
    const touch = e.changedTouches[0]
    const c = getCellAtPoint(e.currentTarget as SVGSVGElement, touch.clientX, touch.clientY)
    if (c) emit('toggleHalf', c.typeId, c.mirrorHalf)
  }
  dragging.value = false; wasDrag = false
}

// New polyhedron or orbit → new diagram extents: reset the view
watch(() => props.poly, () => { orbitIdx.value = 0; resetZoom() })
watch(orbitIdx, resetZoom)
</script>

<style scoped>
.diagram-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.zoom-reset {
  position: absolute;
  top: 6px; right: 6px;
  z-index: 2;
  background: #22243acc;
  color: #ccc;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 10px;
  cursor: pointer;
}
.zoom-reset:hover { background: #33365a; color: #fff; }
.orbit-toggle {
  position: absolute;
  top: 6px; left: 6px;
  z-index: 2;
  display: flex;
  gap: 4px;
}
.orbit-toggle button {
  background: #22243acc;
  color: #ccc;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}
.orbit-toggle button:hover { background: #33365a; color: #fff; }
.orbit-toggle button.active { background: #4455cc; color: #fff; }

/* Mobile: the diagram is a fullscreen overlay whose top-left is occupied by
   the show/hide FAB — center the orbit toggle instead */
@media (max-width: 600px) {
  .orbit-toggle {
    left: 50%;
    transform: translateX(-50%);
  }
}
.diagram-svg {
  width: 100%;
  max-width: 320px;
  aspect-ratio: 1;
  cursor: crosshair;
}
.cell { transition: fill 0.12s; }
.diagram-label {
  font-size: 11px;
  color: #888;
  letter-spacing: 0.05em;
}
</style>
