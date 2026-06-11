<template>
  <div class="faces-pad">
    <div class="faces-head">
      <div class="faces-label">Faces</div>
      <button class="mini-btn" title="Show all faces" @click="showAll">All</button>
      <button class="mini-btn" title="Show only the reference face" @click="showOne">One</button>
    </div>
    <div
      class="face-grid"
      @mousedown.prevent="onFaceDown"
      @mousemove="onFaceMove"
      @touchstart.prevent="onFaceTouch($event, true)"
      @touchmove.prevent="onFaceTouch($event, false)"
    >
      <button
        v-for="i in count"
        :key="i"
        class="face-btn"
        :class="{ active: visibleFaces.has(i - 1) }"
        :data-face="i - 1"
      >{{ i }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ visibleFaces: Set<number>; count: number }>()
const emit = defineEmits<{ setFaces: [faces: Set<number>] }>()

function showAll() {
  emit('setFaces', new Set(Array.from({ length: props.count }, (_, i) => i)))
}
// Face 0 = the plane the stellation diagram is drawn on
function showOne() {
  emit('setFaces', new Set([0]))
}

// Click toggles; drag/slide paints the mode chosen by the first button
// touched (show or hide)
let faceDragging = false
let faceMode = true // true = show, false = hide

function faceAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const f = el?.dataset?.face
  return f === undefined ? null : Number(f)
}
function setFace(fi: number, on: boolean) {
  if (props.visibleFaces.has(fi) === on) return
  const next = new Set(props.visibleFaces)
  if (on) next.add(fi)
  else next.delete(fi)
  emit('setFaces', next)
}
function onFaceDown(e: MouseEvent) {
  const fi = faceAt(e.clientX, e.clientY)
  if (fi === null) return
  faceDragging = true
  faceMode = !props.visibleFaces.has(fi)
  setFace(fi, faceMode)
  window.addEventListener('mouseup', () => { faceDragging = false }, { once: true })
}
function onFaceMove(e: MouseEvent) {
  if (!faceDragging) return
  const fi = faceAt(e.clientX, e.clientY)
  if (fi !== null) setFace(fi, faceMode)
}
function onFaceTouch(e: TouchEvent, start: boolean) {
  const t = e.touches[0]
  if (!t) return
  const fi = faceAt(t.clientX, t.clientY)
  if (fi === null) return
  if (start) faceMode = !props.visibleFaces.has(fi)
  setFace(fi, faceMode)
}
</script>

<style scoped>
.faces-pad {
  background: #12131dd9;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 2px 12px #0006;
}
.faces-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.faces-label {
  flex: 1;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #888;
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
.face-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
  user-select: none;
  touch-action: none;
}
.face-btn {
  background: #22243a;
  color: #888;
  border: none;
  border-radius: 3px;
  padding: 3px 6px;
  font-size: 9px;
  cursor: pointer;
}
.face-btn:hover { background: #33365a; color: #fff; }
.face-btn.active { background: #2a8c5c; color: #fff; }
</style>
