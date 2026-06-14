import { Vec3, mat4Mul, mat4Perspective, mat4Ortho, mat4LookAt } from '../geometry/math'
import { StellationMesh } from '../geometry/stellation'
import {
  FLAT_VERT, FLAT_FRAG,
  LIT_FRAG,
  LINE_VERT, SOLID_FRAG,
  NORMAL_VERT, NORMAL_FRAG, MATHWORLD_FRAG,
  FANCY_VERT, IRIDESCENT_FRAG, TOON_FRAG, METAL_FRAG, GLASS_FRAG,
} from './shaders'

export type ShaderMode = 'mathworld' | 'normal' | 'flat' | 'iridescent' | 'toon' | 'metal' | 'glass'

// Shaders that color cells from the per-vertex palette colors
const VERTEX_COLOR_SHADERS: readonly ShaderMode[] = ['flat', 'toon', 'metal', 'glass']
export type Background = 'white' | 'black'

export interface RenderState {
  shader: ShaderMode
  background: Background
  colors: Float32Array         // RGB per type (numTypes * 3)
  colorMode: 'type' | 'face' | 'focus'  // by cell type, by face plane, or face plane 0 only
  faceColors: Float32Array     // RGB per face plane (nFaces * 3)
  numTypes: number
  lightDir: Vec3
  opacity: number              // face opacity [0, 1]; < 1 = X-ray blending
  wireframe: boolean           // overlay facet outlines
  normalSL: [number, number]   // S/L adjust for the normal-based shaders (0.5 = neutral)
  cropSphere: number           // sphere crop radius as fraction of mesh radius (1 = off)
  crossSection: number         // view-aligned cutaway depth fraction (0 = off)
  extendFaces: number          // face-extension fraction (0 = off, 1 = full planes)
  planeDist: number            // distance of the face planes from the origin
  projection: 'perspective' | 'ortho'  // camera projection type
}

// Orbit camera state
export interface Camera {
  theta: number   // azimuth (radians)
  phi: number     // elevation (radians)
  dist: number    // distance
  target: Vec3
  fov: number
}

export function defaultCamera(): Camera {
  // dist fits the icosahedron's final stellation — preset 8 and the all-cells
  // default view (bounding radius ≈ 15.9) — in the π/4 fov:
  // 15.9 / sin(fov/2) ≈ 42
  return { theta: 0.5, phi: 0.4, dist: 42, target: [0,0,0], fov: Math.PI/4 }
}

// ---- WebGL helpers ----
function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile error')
  return s
}

function linkProgram(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert))
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? 'program link error')
  return p
}

function createBuf(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer {
  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  // Cast: newer TS libs type Float32Array<ArrayBufferLike>, which doesn't
  // match the lib.dom BufferSource even though it is always valid here.
  gl.bufferData(gl.ARRAY_BUFFER, data as unknown as BufferSource, gl.STATIC_DRAW)
  return buf
}

function setAttr(gl: WebGLRenderingContext, prog: WebGLProgram, name: string,
  buf: WebGLBuffer, size: number, type = WebGLRenderingContext.FLOAT) {
  const loc = gl.getAttribLocation(prog, name)
  if (loc < 0) return
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, size, type, false, 0, 0)
}

export class Renderer {
  private gl: WebGLRenderingContext
  private programs: Record<ShaderMode, WebGLProgram>
  private litProgram: WebGLProgram    // two-sided Lambert, used for Focus coloring
  private solidProgram: WebGLProgram  // position-only, uniform color: facet outlines
  private maxAttribs: number

  // Uniform locations cached per program (lookups every frame are slow)
  private uniformLocs = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

  // Static buffers re-uploaded only when the mesh object changes
  private meshCache: {
    mesh: StellationMesh | null
    pos: WebGLBuffer | null
    norm: WebGLBuffer | null
    edge: WebGLBuffer | null
    radius: number   // bounding radius (for the crop-sphere slider scale)
  } = { mesh: null, pos: null, norm: null, edge: null, radius: 1 }

  // Per-vertex color array/buffer cached on (mesh, source array, color mode)
  private colorCache: {
    mesh: StellationMesh | null
    src: Float32Array | null
    mode: string
    arr: Float32Array | null
    buf: WebGLBuffer | null
  } = { mesh: null, src: null, mode: '', arr: null, buf: null }

  // Reused scratch + GPU buffers for the per-frame translucent depth sort, so
  // the blended path doesn't churn typed arrays and GL buffers every frame.
  private sortCap = 0                          // capacity in vertices
  private sortDepths: Float32Array | null = null
  private sortOrder: Uint32Array | null = null
  private sortScratch: { pos: Float32Array; norm: Float32Array; color: Float32Array } | null = null
  private sortBufs: { pos: WebGLBuffer; norm: WebGLBuffer; color: WebGLBuffer } | null = null

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl

    this.programs = {
      mathworld: linkProgram(gl, NORMAL_VERT, MATHWORLD_FRAG),
      normal: linkProgram(gl, NORMAL_VERT, NORMAL_FRAG),
      flat: linkProgram(gl, FLAT_VERT, FLAT_FRAG),
      iridescent: linkProgram(gl, FANCY_VERT, IRIDESCENT_FRAG),
      toon: linkProgram(gl, FANCY_VERT, TOON_FRAG),
      metal: linkProgram(gl, FANCY_VERT, METAL_FRAG),
      glass: linkProgram(gl, FANCY_VERT, GLASS_FRAG),
    }
    this.litProgram = linkProgram(gl, FLAT_VERT, LIT_FRAG)
    this.solidProgram = linkProgram(gl, LINE_VERT, SOLID_FRAG)
    this.maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number

    gl.enable(gl.DEPTH_TEST)
  }

  private loc(prog: WebGLProgram, name: string): WebGLUniformLocation | null {
    let m = this.uniformLocs.get(prog)
    if (!m) { m = new Map(); this.uniformLocs.set(prog, m) }
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(prog, name))
    return m.get(name)!
  }

  // Scratch arrays + GPU buffers for the translucent depth sort, grown to fit
  // the current mesh and reused across frames.
  private ensureSortScratch(vertexCount: number) {
    const gl = this.gl
    if (vertexCount > this.sortCap || !this.sortBufs) {
      const tris = vertexCount / 3
      this.sortDepths = new Float32Array(tris)
      this.sortOrder = new Uint32Array(tris)
      this.sortScratch = {
        pos: new Float32Array(vertexCount * 3),
        norm: new Float32Array(vertexCount * 3),
        color: new Float32Array(vertexCount * 3),
      }
      if (!this.sortBufs) {
        this.sortBufs = { pos: gl.createBuffer()!, norm: gl.createBuffer()!, color: gl.createBuffer()! }
      }
      this.sortCap = vertexCount
    }
    return { depths: this.sortDepths!, order: this.sortOrder!, scratch: this.sortScratch!, bufs: this.sortBufs! }
  }

  draw(mesh: StellationMesh, camera: Camera, state: RenderState, canvas: HTMLCanvasElement) {
    const gl = this.gl
    const w = canvas.width, h = canvas.height

    // Background
    if (state.background === 'white') {
      gl.clearColor(1, 1, 1, 1)
    } else {
      // Same as the app's dark background (#0d0e17) so both halves match
      gl.clearColor(0.051, 0.055, 0.090, 1)
    }
    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    if (mesh.count === 0) return

    // Matrices
    const aspect = w / h
    // near/far follow the camera distance so the far-zoomed block view is not
    // clipped while the near/far ratio (depth precision on mobile 16-bit
    // depth buffers) stays bounded.
    const near = Math.max(0.5, camera.dist * 0.02)
    const far = camera.dist * 2 + 50
    // The orthographic frustum matches the perspective view's extent at the
    // target plane (dist·tan(fov/2)), so zoom (dist) keeps working.
    const halfH = camera.dist * Math.tan(camera.fov / 2)
    const proj = state.projection === 'ortho'
      ? mat4Ortho(halfH * aspect, halfH, near, far)
      : mat4Perspective(camera.fov, aspect, near, far)
    const cx = camera.target[0] + camera.dist * Math.sin(camera.theta) * Math.cos(camera.phi)
    const cy = camera.target[1] + camera.dist * Math.sin(camera.phi)
    const cz = camera.target[2] + camera.dist * Math.cos(camera.theta) * Math.cos(camera.phi)
    const eye: Vec3 = [cx, cy, cz]
    const mv = mat4LookAt(eye, camera.target, [0,1,0])
    const mvp = mat4Mul(proj, mv)

    // Reset attribute state left over from the previous frame's program.
    // An attribute array that stays enabled while its buffer is deleted
    // makes drawArrays fail silently (blank canvas after shader switches).
    for (let i = 0; i < this.maxAttribs; i++) gl.disableVertexAttribArray(i)

    // Glass writes per-fragment alpha, so it always takes the blended path
    const translucent = state.opacity < 0.999 || state.shader === 'glass'
    const wire = state.wireframe && mesh.edgeCount > 0
    const focus = state.colorMode === 'focus'
    const onWhite = state.background === 'white'

    // Static (mesh-bound) buffers, re-uploaded only when the mesh changes
    const mc = this.meshCache
    if (mc.mesh !== mesh) {
      gl.deleteBuffer(mc.pos); gl.deleteBuffer(mc.norm); gl.deleteBuffer(mc.edge)
      mc.pos = createBuf(gl, mesh.positions)
      mc.norm = createBuf(gl, mesh.normals)
      mc.edge = createBuf(gl, mesh.edgePositions)
      let r2 = 0
      const p = mesh.positions
      for (let i = 0; i < p.length; i += 3) {
        const d = p[i]*p[i] + p[i+1]*p[i+1] + p[i+2]*p[i+2]
        if (d > r2) r2 = d
      }
      mc.radius = Math.sqrt(r2)
      mc.mesh = mesh
    }

    // Clipping uniforms: crop sphere (model space) + cross section (view z)
    const OFF = 1e12
    let clipR2 = state.cropSphere >= 0.999
      ? OFF
      : (state.cropSphere * mc.radius) ** 2
    const clipZ = state.crossSection <= 0.001
      ? OFF
      : -camera.dist + mc.radius * (1 - 2 * state.crossSection)

    // Face-extension demo: growing each plane to in-plane radius r equals
    // clipping the full-diagram mesh by the sphere of radius √(r² + d²),
    // because each plane's centroid is the foot of the perpendicular from
    // the origin (distance d).
    if (state.extendFaces > 0.001 && state.extendFaces < 0.999) {
      const d2 = state.planeDist * state.planeDist
      const inPlaneMax = Math.sqrt(Math.max(mc.radius * mc.radius - d2, 0))
      const r = state.extendFaces * inPlaneMax
      clipR2 = Math.min(clipR2, d2 + r * r)
    }


    // Per-vertex colors (the normal-based shaders ignore them). Focus paints
    // the facets of face plane 0 (the plane the 2D stellation diagram is
    // drawn on) with the diagram's type colors and everything else near-white.
    let colorArr: Float32Array | null = null
    let colorBuf: WebGLBuffer | null = null
    if (VERTEX_COLOR_SHADERS.includes(state.shader)) {
      const byFace = state.colorMode === 'face'
      const src = byFace ? state.faceColors : state.colors
      const cc = this.colorCache
      if (cc.mesh !== mesh || cc.src !== src || cc.mode !== state.colorMode) {
        const arr = new Float32Array(mesh.count * 3)
        for (let i = 0; i < mesh.count; i++) {
          if (focus && mesh.faceIds[i] !== 0) {
            arr[i*3] = 0.96; arr[i*3+1] = 0.96; arr[i*3+2] = 0.96
            continue
          }
          const base = (byFace ? mesh.faceIds[i] : mesh.typeIds[i]) * 3
          arr[i*3]   = src[base] ?? 0.7
          arr[i*3+1] = src[base+1] ?? 0.7
          arr[i*3+2] = src[base+2] ?? 0.7
        }
        gl.deleteBuffer(cc.buf)
        cc.buf = createBuf(gl, arr)
        cc.arr = arr; cc.mesh = mesh; cc.src = src; cc.mode = state.colorMode
      }
      colorArr = cc.arr
      colorBuf = cc.buf
    }

    // Alpha blending is order-dependent: triangles must be drawn back to
    // front, or near-opaque back faces overwrite the front ones. Sort by
    // view-space depth of triangle centroids every frame, reusing scratch
    // arrays and GPU buffers (re-uploaded, not re-created, per frame).
    let posBuf = mc.pos!
    let normBuf = mc.norm!
    if (translucent) {
      const triCount = mesh.count / 3
      const s = this.ensureSortScratch(mesh.count)
      const depths = s.depths, order = s.order, p = mesh.positions
      for (let t = 0; t < triCount; t++) {
        const b = t * 9
        depths[t] = mv[2]  * (p[b]   + p[b+3] + p[b+6])
                  + mv[6]  * (p[b+1] + p[b+4] + p[b+7])
                  + mv[10] * (p[b+2] + p[b+5] + p[b+8])
        order[t] = t
      }
      // Camera looks down -z: most negative z = farthest, drawn first
      const ord = order.subarray(0, triCount)
      ord.sort((a, b) => depths[a] - depths[b])
      const gather = (src: Float32Array, dst: Float32Array) => {
        for (let i = 0; i < triCount; i++) {
          const from = ord[i] * 9, to = i * 9
          for (let k = 0; k < 9; k++) dst[to + k] = src[from + k]
        }
      }
      const view = (a: Float32Array) => a.subarray(0, mesh.count * 3)
      gather(mesh.positions, s.scratch.pos)
      gather(mesh.normals, s.scratch.norm)
      gl.bindBuffer(gl.ARRAY_BUFFER, s.bufs.pos)
      gl.bufferData(gl.ARRAY_BUFFER, view(s.scratch.pos), gl.DYNAMIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, s.bufs.norm)
      gl.bufferData(gl.ARRAY_BUFFER, view(s.scratch.norm), gl.DYNAMIC_DRAW)
      posBuf = s.bufs.pos
      normBuf = s.bufs.norm
      if (colorArr) {
        gather(colorArr, s.scratch.color)
        gl.bindBuffer(gl.ARRAY_BUFFER, s.bufs.color)
        gl.bufferData(gl.ARRAY_BUFFER, view(s.scratch.color), gl.DYNAMIC_DRAW)
        colorBuf = s.bufs.color
      }
    }

    // Facet outlines as crisp 1px GL lines (true polygon borders, no
    // triangulation diagonals)
    const drawEdges = () => {
      const color: [number, number, number, number] =
        onWhite ? [0.05, 0.05, 0.05, 1] : [0.85, 0.85, 0.9, 1]
      gl.useProgram(this.solidProgram)
      gl.uniformMatrix4fv(this.loc(this.solidProgram, 'u_mvp'), false, mvp)
      gl.uniformMatrix4fv(this.loc(this.solidProgram, 'u_mv'), false, mv)
      gl.uniform4fv(this.loc(this.solidProgram, 'u_color'), color)
      gl.uniform1f(this.loc(this.solidProgram, 'u_clipR2'), clipR2)
      gl.uniform1f(this.loc(this.solidProgram, 'u_clipZ'), clipZ)
      setAttr(gl, this.solidProgram, 'a_pos', mc.edge!, 3)
      gl.lineWidth(1.5)
      gl.drawArrays(gl.LINES, 0, mesh.edgeCount)
    }

    // Translucent faces don't write depth, so draw the outline skeleton
    // first; it stays visible through the glass.
    if (wire && translucent) drawEdges()

    // Focus needs two-sided shading so the mostly-white solid stays readable
    const prog = state.shader === 'flat' && focus ? this.litProgram : this.programs[state.shader]
    gl.useProgram(prog)
    gl.uniformMatrix4fv(this.loc(prog, 'u_mvp'), false, mvp)
    const mvLoc = this.loc(prog, 'u_mv')
    const ldLoc = this.loc(prog, 'u_lightDir')
    const alLoc = this.loc(prog, 'u_alpha')
    const slLoc = this.loc(prog, 'u_sl')
    if (mvLoc) gl.uniformMatrix4fv(mvLoc, false, mv)
    if (ldLoc) gl.uniform3fv(ldLoc, state.lightDir)
    if (alLoc) gl.uniform1f(alLoc, state.opacity)
    if (slLoc) gl.uniform2fv(slLoc, state.normalSL)
    gl.uniform1f(this.loc(prog, 'u_clipR2'), clipR2)
    gl.uniform1f(this.loc(prog, 'u_clipZ'), clipZ)
    setAttr(gl, prog, 'a_pos',    posBuf,  3)
    setAttr(gl, prog, 'a_normal', normBuf, 3)
    if (colorBuf) setAttr(gl, prog, 'a_color', colorBuf, 3)

    if (wire) {
      // Push faces slightly back so coplanar outline lines win the depth test
      gl.enable(gl.POLYGON_OFFSET_FILL)
      gl.polygonOffset(1.0, 1.0)
    }
    if (translucent) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
    }
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count)
    if (translucent) { gl.depthMask(true); gl.disable(gl.BLEND) }
    if (wire) gl.disable(gl.POLYGON_OFFSET_FILL)

    if (wire && !translucent) drawEdges()
  }

  destroy() {
    const gl = this.gl
    for (const prog of Object.values(this.programs)) gl.deleteProgram(prog)
    gl.deleteProgram(this.litProgram)
    gl.deleteProgram(this.solidProgram)
    const mc = this.meshCache
    gl.deleteBuffer(mc.pos); gl.deleteBuffer(mc.norm); gl.deleteBuffer(mc.edge)
    gl.deleteBuffer(this.colorCache.buf)
    if (this.sortBufs) {
      gl.deleteBuffer(this.sortBufs.pos)
      gl.deleteBuffer(this.sortBufs.norm)
      gl.deleteBuffer(this.sortBufs.color)
    }
  }
}

// Orbit camera mouse/touch control
export function makeOrbitControls(camera: Camera) {
  let dragging = false
  let lastX = 0, lastY = 0
  let pinchDist0 = 0

  function onDown(x: number, y: number) {
    dragging = true; lastX = x; lastY = y
  }
  function onMove(x: number, y: number) {
    if (!dragging) return
    // Trackball feel: the model follows the cursor (camera orbits opposite the drag)
    camera.theta -= (x - lastX) * 0.005
    camera.phi   += (y - lastY) * 0.005
    camera.phi = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, camera.phi))
    lastX = x; lastY = y
  }
  function onUp() { dragging = false }
  function onWheel(delta: number) {
    camera.dist *= 1 + delta * 0.001
    camera.dist = Math.max(2, Math.min(250, camera.dist))
  }

  return {
    onMouseDown: (e: MouseEvent) => onDown(e.clientX, e.clientY),
    onMouseMove: (e: MouseEvent) => onMove(e.clientX, e.clientY),
    onMouseUp:   () => onUp(),
    onWheel:     (e: WheelEvent) => { e.preventDefault(); onWheel(e.deltaY) },
    onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) { onDown(e.touches[0].clientX, e.touches[0].clientY) }
      else if (e.touches.length === 2) {
        dragging = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchDist0 = Math.sqrt(dx*dx + dy*dy)
      }
    },
    onTouchMove(e: TouchEvent) {
      e.preventDefault()
      if (e.touches.length === 1) { onMove(e.touches[0].clientX, e.touches[0].clientY) }
      else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx*dx + dy*dy)
        if (pinchDist0 > 0) onWheel((pinchDist0 - dist) * 5)
        pinchDist0 = dist
      }
    },
    onTouchEnd: () => onUp(),
  }
}
