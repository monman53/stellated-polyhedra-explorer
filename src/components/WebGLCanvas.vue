<template>
  <canvas
    ref="canvasRef"
    class="gl-canvas"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseLeave"
    @wheel.prevent="ctrl.onWheel"
    @touchstart.prevent="onTouchStart"
    @touchmove.prevent="onTouchMove"
    @touchend="onTouchEnd"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Renderer, Camera, RenderState, defaultCamera, makeOrbitControls } from '../webgl/renderer'
import { buildMesh, buildBlockMesh, getBlockData } from '../geometry/stellation'
import type { PolyId } from '../geometry/icosahedron'

const props = defineProps<{
  renderState: RenderState
  polyhedron: PolyId
  selectedTypes: Set<number>
  halfTypes: Map<number, boolean>
  primedTypes: Set<number>
  visibleFaces: Set<number>
  explodeFactor: number
  closeCells: boolean
  block: boolean
  faceCut: boolean
  autoRotate: boolean
}>()
const emit = defineEmits<{ toggleAutoRotate: [] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: Renderer | null = null
const camera: Camera = defaultCamera()
const ctrl = makeOrbitControls(camera)

let rafId = 0
let lastTs = 0
function rebuildMesh() {
  return props.block
    ? buildBlockMesh(props.explodeFactor, props.visibleFaces, props.polyhedron)
    : buildMesh(props.selectedTypes, props.explodeFactor, props.halfTypes, props.primedTypes, props.visibleFaces, props.polyhedron, props.closeCells, props.faceCut)
}
let mesh = rebuildMesh()

// Click (press + release without movement) toggles auto-rotation
let pressed = false
let moved = false
let downX = 0, downY = 0
const CLICK_PX = 5

function onMouseDown(e: MouseEvent) {
  pressed = true; moved = false; downX = e.clientX; downY = e.clientY
  ctrl.onMouseDown(e)
}
function onMouseMove(e: MouseEvent) {
  if (pressed && Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > CLICK_PX) moved = true
  ctrl.onMouseMove(e)
}
function onMouseUp() {
  if (pressed && !moved) emit('toggleAutoRotate')
  pressed = false
  ctrl.onMouseUp()
}
function onMouseLeave() {
  pressed = false
  ctrl.onMouseUp()
}
function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    pressed = true; moved = false
    downX = e.touches[0].clientX; downY = e.touches[0].clientY
  } else {
    pressed = false
  }
  ctrl.onTouchStart(e)
}
function onTouchMove(e: TouchEvent) {
  const t = e.touches[0]
  if (pressed && t && Math.abs(t.clientX - downX) + Math.abs(t.clientY - downY) > CLICK_PX) moved = true
  ctrl.onTouchMove(e)
}
function onTouchEnd(e: TouchEvent) {
  if (pressed && !moved && e.touches.length === 0) emit('toggleAutoRotate')
  if (e.touches.length === 0) pressed = false
  ctrl.onTouchEnd()
}

// Space toggles auto-rotation too (unless a form control has focus)
function onKeyDown(e: KeyboardEvent) {
  if (e.code !== 'Space') return
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  e.preventDefault()
  emit('toggleAutoRotate')
}

function resize() {
  const canvas = canvasRef.value!
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(canvas.clientWidth * dpr)
  const h = Math.round(canvas.clientHeight * dpr)
  // Assigning canvas.width/height clears the drawing buffer even when the
  // value is unchanged — doing it every frame makes mobile browsers flicker.
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
}

function frame(ts: number) {
  const dt = (ts - lastTs) / 1000
  lastTs = ts

  if (props.autoRotate) camera.theta += dt * 0.3

  const canvas = canvasRef.value!
  resize()
  renderer!.draw(mesh, camera, props.renderState, canvas)
  rafId = requestAnimationFrame(frame)
}

// Block view: zoom out so the whole cube fits, and restore the previous
// distance when leaving it
let distBeforeBlock: number | null = null
function fitBlockDist() {
  const bd = getBlockData(props.polyhedron)
  const B = bd.planes[bd.numBase].d
  camera.dist = Math.min(250, B * Math.sqrt(3) / Math.sin(camera.fov / 2))
}
watch(
  () => [props.block, props.polyhedron] as const,
  ([block]) => {
    if (block) {
      if (distBeforeBlock === null) distBeforeBlock = camera.dist
      fitBlockDist()
    } else if (distBeforeBlock !== null) {
      camera.dist = distBeforeBlock
      distBeforeBlock = null
    }
  }
)

// Reset orientation and zoom to the defaults (block view refits its cube)
function resetCamera() {
  const def = defaultCamera()
  camera.theta = def.theta
  camera.phi = def.phi
  camera.dist = def.dist
  if (props.block) {
    distBeforeBlock = def.dist
    fitBlockDist()
  } else {
    distBeforeBlock = null
  }
}

// Rebuild mesh when selection, half-orbit choice, faces, explode, or polyhedron changes
watch(
  () => [props.selectedTypes, props.halfTypes, props.primedTypes, props.explodeFactor, props.visibleFaces, props.polyhedron, props.closeCells, props.block, props.faceCut] as const,
  () => { mesh = rebuildMesh() },
  { deep: true }
)

// Capture the current view as a PNG blob — fully SYNCHRONOUS (toDataURL, not
// toBlob), so callers can invoke navigator.share in the same user-gesture
// tick without losing the transient activation. The drawing buffer is not
// preserved, so render a fresh frame first.
function capture(): Blob | null {
  const canvas = canvasRef.value
  if (!canvas || !renderer) return null
  renderer.draw(mesh, camera, props.renderState, canvas)
  const b64 = canvas.toDataURL('image/png').split(',')[1]
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'image/png' })
}
defineExpose({ capture, resetCamera })

onMounted(() => {
  const canvas = canvasRef.value!
  renderer = new Renderer(canvas)
  resize()
  window.addEventListener('keydown', onKeyDown)
  rafId = requestAnimationFrame(frame)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKeyDown)
  renderer?.destroy()
})
</script>

<style scoped>
.gl-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.gl-canvas:active { cursor: grabbing; }
</style>
