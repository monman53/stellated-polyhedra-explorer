import { Vec3, sub3, cross3, norm3, dot3, scale3, add3, centroid3 } from './math'

export type Face = number[]
export type PolyId =
  | 'icosa' | 'dodeca' | 'octa' | 'icosidodeca' | 'rhombic30'
  | 'truncicosa' | 'truncdodeca' | 'cubocta' | 'rhombicdodeca'

const t = (1 + Math.sqrt(5)) / 2

// Vertices (edge length = 2)
export const ICO_VERTS: Vec3[] = [
  [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
  [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
  [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
]

// CCW winding from outside
export const ICO_FACES: Face[] = [
  [0,11,5], [0,5,1], [0,1,7], [0,7,10], [0,10,11],
  [1,5,9],  [5,11,4],[11,10,2],[10,7,6],[7,1,8],
  [3,9,4],  [3,4,2], [3,2,6], [3,6,8], [3,8,9],
  [4,9,5],  [2,4,11],[6,2,10],[8,6,7], [9,8,1],
]

// Dodecahedron as the dual of the icosahedron: its vertices are the icosa
// face centroids (scaled to a comparable size) and each face is the ring of
// icosa faces around one icosa vertex, ordered CCW from outside.
// 1.26 matches the icosahedron's circumradius and keeps the great stellated
// dodecahedron within the default camera view (R ≈ 8.06).
const DODECA_SCALE = 1.26
let _dodeca: { verts: Vec3[]; faces: Face[] } | null = null
function buildDodecahedron(): { verts: Vec3[]; faces: Face[] } {
  if (_dodeca) return _dodeca
  const verts = ICO_FACES.map(f =>
    scale3(centroid3(f.map(i => ICO_VERTS[i])), DODECA_SCALE))
  const faces: Face[] = []
  for (let vi = 0; vi < ICO_VERTS.length; vi++) {
    const axis = norm3(ICO_VERTS[vi])
    // Tangent basis around the vertex axis
    const seed: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    const u = norm3(cross3(axis, seed))
    const w = cross3(axis, u)
    const ring = ICO_FACES
      .map((f, i) => ({ i, has: f.includes(vi) }))
      .filter(x => x.has)
      .map(x => {
        const p = verts[x.i]
        return { i: x.i, ang: Math.atan2(dot3(p, w), dot3(p, u)) }
      })
      .sort((a, b) => a.ang - b.ang)
      .map(x => x.i)
    // Ensure CCW seen from outside (normal of first corner points outward)
    const n = cross3(sub3(verts[ring[1]], verts[ring[0]]), sub3(verts[ring[2]], verts[ring[0]]))
    if (dot3(n, axis) < 0) ring.reverse()
    faces.push(ring)
  }
  _dodeca = { verts, faces }
  return _dodeca
}

// Octahedron, scaled to the icosahedron's circumradius. Its only stellation
// is the stella octangula (tips at √3 × circumradius ≈ 3.3).
const OCTA_SCALE = Math.sqrt(1 + t * t)  // ≈ 1.902
let _octa: { verts: Vec3[]; faces: Face[] } | null = null
function buildOctahedron(): { verts: Vec3[]; faces: Face[] } {
  if (_octa) return _octa
  const s = OCTA_SCALE
  const verts: Vec3[] = [
    [s, 0, 0], [-s, 0, 0], [0, s, 0], [0, -s, 0], [0, 0, s], [0, 0, -s],
  ]
  // CCW from outside
  const faces: Face[] = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
  ]
  _octa = { verts, faces }
  return _octa
}

// Icosidodecahedron (rectified icosahedron): vertices are the icosahedron's
// edge midpoints. Its 20 triangle faces lie in the icosa face planes and its
// 12 pentagon faces in the dual dodecahedron's planes, so its stellation
// diagram is the icosahedron's refined by the 12 pentagon planes (and vice
// versa). Faces ordered: 20 triangles first, then 12 pentagons.
// The scale must keep the outermost diagram cells (in-plane radius ≈ 15.2)
// inside the cell solver's BOUNDS=16 box while giving a comparable core size.
const ICOSIDODECA_SCALE = 0.96
let _icosidodeca: { verts: Vec3[]; faces: Face[] } | null = null
function buildIcosidodecahedron(): { verts: Vec3[]; faces: Face[] } {
  if (_icosidodeca) return _icosidodeca
  const verts: Vec3[] = []
  const edgeIdx = new Map<string, number>()
  const midOf = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    let i = edgeIdx.get(key)
    if (i === undefined) {
      i = verts.length
      edgeIdx.set(key, i)
      verts.push(scale3(add3(ICO_VERTS[a], ICO_VERTS[b]), 0.5 * ICOSIDODECA_SCALE))
    }
    return i
  }
  // Medial triangle of each icosa face (CCW like the face)
  const faces: Face[] = ICO_FACES.map(([a, b, c]) => [midOf(a, b), midOf(b, c), midOf(c, a)])
  // Pentagon: ring of edge midpoints around each icosa vertex, ordered CCW
  for (let vi = 0; vi < ICO_VERTS.length; vi++) {
    const axis = norm3(ICO_VERTS[vi])
    const seed: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    const u = norm3(cross3(axis, seed))
    const w = cross3(axis, u)
    const ring: number[] = []
    for (const [key, i] of edgeIdx) {
      const [a, b] = key.split('-').map(Number)
      if (a === vi || b === vi) ring.push(i)
    }
    ring.sort((i, j) => {
      const ai = Math.atan2(dot3(verts[i], w), dot3(verts[i], u))
      const aj = Math.atan2(dot3(verts[j], w), dot3(verts[j], u))
      return ai - aj
    })
    const n = cross3(sub3(verts[ring[1]], verts[ring[0]]), sub3(verts[ring[2]], verts[ring[0]]))
    if (dot3(n, axis) < 0) ring.reverse()
    faces.push(ring)
  }
  _icosidodeca = { verts, faces }
  return _icosidodeca
}

// Rhombic triacontahedron: dual of the icosidodecahedron — 30 golden-rhombus
// faces, one per icosa edge. The face's corners are the poles of the edge's
// two icosa vertices and of the two adjacent icosa faces, all lying exactly
// in the plane x·m̂ = d (m̂ = edge-midpoint axis), by polar reciprocation.
// Note the faces are NOT regular polygons: their symmetry is D₂, which
// faceSymmetryOps detects from the projected vertices.
// The scale (= face-plane distance) keeps the outermost diagram cells
// (in-plane extent 7.54 × scale) inside the solver's BOUNDS=16 box while
// giving a core circumradius (1.176 × scale ≈ 1.88) comparable to the others.
const RHOMBIC30_SCALE = 1.6
let _rhombic30: { verts: Vec3[]; faces: Face[] } | null = null
function buildRhombicTriacontahedron(): { verts: Vec3[]; faces: Face[] } {
  if (_rhombic30) return _rhombic30
  const d = RHOMBIC30_SCALE
  const verts: Vec3[] = []
  const idxOf = new Map<string, number>()

  // Adjacent faces of each icosa edge
  const edgeFaces = new Map<string, number[]>()
  ICO_FACES.forEach((f, fi) => {
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      const arr = edgeFaces.get(key) ?? []
      arr.push(fi)
      edgeFaces.set(key, arr)
    }
  })

  const faces: Face[] = []
  for (const [key, [f1, f2]] of edgeFaces) {
    const [a, b] = key.split('-').map(Number)
    const m = norm3(add3(ICO_VERTS[a], ICO_VERTS[b]))  // face axis
    // Pole of a direction: scaled onto the plane x·m̂ = d (same radius for
    // every face sharing the pole, by symmetry)
    const pole = (k: string, dir: Vec3): number => {
      let i = idxOf.get(k)
      if (i === undefined) {
        i = verts.length
        idxOf.set(k, i)
        const u = norm3(dir)
        verts.push(scale3(u, d / dot3(u, m)))
      }
      return i
    }
    const va = pole(`v${a}`, ICO_VERTS[a])
    const p1 = pole(`f${f1}`, centroid3(ICO_FACES[f1].map(i => ICO_VERTS[i])))
    const vb = pole(`v${b}`, ICO_VERTS[b])
    const p2 = pole(`f${f2}`, centroid3(ICO_FACES[f2].map(i => ICO_VERTS[i])))
    // CCW from outside, always STARTING AT A VERTEX POLE: the rhombus corners
    // are not all equivalent, and the per-face (u, w) frame is anchored at
    // vertex 0 — every face must anchor at the same corner type or the lifted
    // diagram comes out rotated ~90° on the flipped faces (D₂ ≠ D₄).
    let ring = [va, p1, vb, p2]
    const n = cross3(sub3(verts[p1], verts[va]), sub3(verts[vb], verts[va]))
    if (dot3(n, m) < 0) ring = [va, p2, vb, p1]
    faces.push(ring)
  }
  _rhombic30 = { verts, faces }
  return _rhombic30
}

// Truncated icosahedron (the football): icosa vertices cut at 1/3 of each
// edge — 20 regular hexagons lying in the icosa face planes plus 12 pentagons
// in the truncation planes. NOTE: the hexagons are regular as polygons (D₆)
// but their stabilizer in the icosahedral group is only D₃ (edges alternate
// pentagon/hexagon neighbours) — faceSymmetryOps detects this from the plane
// set. Hexagon vertex 0 is always the near-side ⅓ point of a CCW edge, so all
// per-face frames agree up to the C₃ the diagram is invariant under.
// Faces ordered: 20 hexagons first, then 12 pentagons.
// The scale keeps the outermost diagram cells inside the solver's BOUNDS=16
// box while giving a comparable core size.
const TRUNCICOSA_SCALE = 0.9
let _truncicosa: { verts: Vec3[]; faces: Face[] } | null = null
function buildTruncatedIcosahedron(): { verts: Vec3[]; faces: Face[] } {
  if (_truncicosa) return _truncicosa
  const verts: Vec3[] = []
  const idx = new Map<string, number>()
  // The trisection point of edge x→y nearer to x
  const P = (x: number, y: number): number => {
    const key = `${x}>${y}`
    let i = idx.get(key)
    if (i === undefined) {
      i = verts.length
      idx.set(key, i)
      verts.push(scale3(add3(scale3(ICO_VERTS[x], 2), ICO_VERTS[y]), TRUNCICOSA_SCALE / 3))
    }
    return i
  }
  // Hexagon per icosa face, following the CCW perimeter
  const faces: Face[] = ICO_FACES.map(([a, b, c]) =>
    [P(a, b), P(b, a), P(b, c), P(c, b), P(c, a), P(a, c)])
  // Pentagon per icosa vertex: the five near points of its edges, CCW
  for (let vi = 0; vi < ICO_VERTS.length; vi++) {
    const axis = norm3(ICO_VERTS[vi])
    const seed: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    const u = norm3(cross3(axis, seed))
    const w = cross3(axis, u)
    const ring: number[] = []
    for (const f of ICO_FACES) {
      const k = f.indexOf(vi)
      if (k < 0) continue
      const i = P(vi, f[(k + 1) % 3])
      if (!ring.includes(i)) ring.push(i)
    }
    ring.sort((i, j) => {
      const ai = Math.atan2(dot3(verts[i], w), dot3(verts[i], u))
      const aj = Math.atan2(dot3(verts[j], w), dot3(verts[j], u))
      return ai - aj
    })
    const n = cross3(sub3(verts[ring[1]], verts[ring[0]]), sub3(verts[ring[2]], verts[ring[0]]))
    if (dot3(n, axis) < 0) ring.reverse()
    faces.push(ring)
  }
  _truncicosa = { verts, faces }
  return _truncicosa
}

// Truncated dodecahedron: dodeca vertices cut at 1/(2+φ) of each edge (the
// fraction that makes the decagons regular) — 12 decagons in the dodeca face
// planes plus 20 triangles in the truncation planes (icosa-face axes). The
// decagons are regular polygons (D₁₀) but their stabilizer is only D₅;
// faceSymmetryOps detects this from the plane set. Decagon vertex 0 is always
// the near-side cut point of a CCW edge, so per-face frames agree up to C₅.
// Faces ordered: 12 decagons first, then 20 triangles.
// The scale keeps the outermost diagram cells (in-plane extent 18.5 × scale
// on the triangle planes at scale 1) inside the solver's BOUNDS=16 box.
const TRUNCDODECA_SCALE = 0.8
let _truncdodeca: { verts: Vec3[]; faces: Face[] } | null = null
function buildTruncatedDodecahedron(): { verts: Vec3[]; faces: Face[] } {
  if (_truncdodeca) return _truncdodeca
  const { verts: dv, faces: df } = buildDodecahedron()
  const x = 1 / (2 + t)  // truncation fraction for regular decagons
  const verts: Vec3[] = []
  const idx = new Map<string, number>()
  // The cut point of edge a→b nearer to a
  const Q = (a: number, b: number): number => {
    const key = `${a}>${b}`
    let i = idx.get(key)
    if (i === undefined) {
      i = verts.length
      idx.set(key, i)
      const p = add3(scale3(dv[a], 1 - x), scale3(dv[b], x))
      verts.push(scale3(p, TRUNCDODECA_SCALE))
    }
    return i
  }
  // Decagon per dodeca face, following the CCW perimeter
  const faces: Face[] = df.map(f => {
    const ring: number[] = []
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length]
      ring.push(Q(a, b), Q(b, a))
    }
    return ring
  })
  // Triangle per dodeca vertex: the three near cut points, CCW
  for (let vi = 0; vi < dv.length; vi++) {
    const axis = norm3(dv[vi])
    const seed: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    const u = norm3(cross3(axis, seed))
    const w = cross3(axis, u)
    const ring: number[] = []
    for (const f of df) {
      const k = f.indexOf(vi)
      if (k < 0) continue
      const i = Q(vi, f[(k + 1) % f.length])
      if (!ring.includes(i)) ring.push(i)
    }
    ring.sort((i, j) => {
      const ai = Math.atan2(dot3(verts[i], w), dot3(verts[i], u))
      const aj = Math.atan2(dot3(verts[j], w), dot3(verts[j], u))
      return ai - aj
    })
    const n = cross3(sub3(verts[ring[1]], verts[ring[0]]), sub3(verts[ring[2]], verts[ring[0]]))
    if (dot3(n, axis) < 0) ring.reverse()
    faces.push(ring)
  }
  _truncdodeca = { verts, faces }
  return _truncdodeca
}

// Cuboctahedron (rectified octahedron) — the first solid with OCTAHEDRAL
// symmetry: vertices are the octahedron's edge midpoints; 8 triangles in the
// octa face planes + 6 squares in the cube planes. Built like the
// icosidodecahedron. The scale brings the circumradius to ≈ 1.9.
const CUBOCTA_SCALE = 1.414
let _cubocta: { verts: Vec3[]; faces: Face[] } | null = null
function buildCuboctahedron(): { verts: Vec3[]; faces: Face[] } {
  if (_cubocta) return _cubocta
  const { verts: ov, faces: of } = buildOctahedron()
  const verts: Vec3[] = []
  const edgeIdx = new Map<string, number>()
  const midOf = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    let i = edgeIdx.get(key)
    if (i === undefined) {
      i = verts.length
      edgeIdx.set(key, i)
      verts.push(scale3(add3(ov[a], ov[b]), 0.5 * CUBOCTA_SCALE))
    }
    return i
  }
  // Medial triangle of each octa face (CCW like the face)
  const faces: Face[] = of.map(([a, b, c]) => [midOf(a, b), midOf(b, c), midOf(c, a)])
  // Square: ring of edge midpoints around each octa vertex, CCW
  for (let vi = 0; vi < ov.length; vi++) {
    const axis = norm3(ov[vi])
    const seed: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    const u = norm3(cross3(axis, seed))
    const w = cross3(axis, u)
    const ring: number[] = []
    for (const [key, i] of edgeIdx) {
      const [a, b] = key.split('-').map(Number)
      if (a === vi || b === vi) ring.push(i)
    }
    ring.sort((i, j) => {
      const ai = Math.atan2(dot3(verts[i], w), dot3(verts[i], u))
      const aj = Math.atan2(dot3(verts[j], w), dot3(verts[j], u))
      return ai - aj
    })
    const n = cross3(sub3(verts[ring[1]], verts[ring[0]]), sub3(verts[ring[2]], verts[ring[0]]))
    if (dot3(n, axis) < 0) ring.reverse()
    faces.push(ring)
  }
  _cubocta = { verts, faces }
  return _cubocta
}

// Rhombic dodecahedron: dual of the cuboctahedron — 12 rhombic faces (D₂,
// diagonal ratio √2), one per octa edge, built by polar reciprocation like
// the rhombic triacontahedron. Vertex 0 is always a vertex pole (see the
// frame-anchoring note there). Its first stellation is Escher's solid.
const RHOMBICDODECA_SCALE = 1.35
let _rhombicdodeca: { verts: Vec3[]; faces: Face[] } | null = null
function buildRhombicDodecahedron(): { verts: Vec3[]; faces: Face[] } {
  if (_rhombicdodeca) return _rhombicdodeca
  const { verts: ov, faces: of } = buildOctahedron()
  const d = RHOMBICDODECA_SCALE
  const verts: Vec3[] = []
  const idxOf = new Map<string, number>()
  const edgeFaces = new Map<string, number[]>()
  of.forEach((f, fi) => {
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      const arr = edgeFaces.get(key) ?? []
      arr.push(fi)
      edgeFaces.set(key, arr)
    }
  })
  const faces: Face[] = []
  for (const [key, [f1, f2]] of edgeFaces) {
    const [a, b] = key.split('-').map(Number)
    const m = norm3(add3(ov[a], ov[b]))
    const pole = (k: string, dir: Vec3): number => {
      let i = idxOf.get(k)
      if (i === undefined) {
        i = verts.length
        idxOf.set(k, i)
        const u = norm3(dir)
        verts.push(scale3(u, d / dot3(u, m)))
      }
      return i
    }
    const va = pole(`v${a}`, ov[a])
    const p1 = pole(`f${f1}`, centroid3(of[f1].map(i => ov[i])))
    const vb = pole(`v${b}`, ov[b])
    const p2 = pole(`f${f2}`, centroid3(of[f2].map(i => ov[i])))
    let ring = [va, p1, vb, p2]
    const n = cross3(sub3(verts[p1], verts[va]), sub3(verts[vb], verts[va]))
    if (dot3(n, m) < 0) ring = [va, p2, vb, p1]
    faces.push(ring)
  }
  _rhombicdodeca = { verts, faces }
  return _rhombicdodeca
}

export function getPolyhedron(poly: PolyId): { verts: Vec3[]; faces: Face[] } {
  if (poly === 'dodeca') return buildDodecahedron()
  if (poly === 'octa') return buildOctahedron()
  if (poly === 'icosidodeca') return buildIcosidodecahedron()
  if (poly === 'rhombic30') return buildRhombicTriacontahedron()
  if (poly === 'truncicosa') return buildTruncatedIcosahedron()
  if (poly === 'truncdodeca') return buildTruncatedDodecahedron()
  if (poly === 'cubocta') return buildCuboctahedron()
  if (poly === 'rhombicdodeca') return buildRhombicDodecahedron()
  return { verts: ICO_VERTS, faces: ICO_FACES }
}

export interface FacePlane {
  normal: Vec3
  d: number       // dot(normal, any_face_vertex)
  centroid: Vec3
  u: Vec3         // first tangent (unit)
  w: Vec3         // second tangent (= normal × u, unit)
}

const _planeCache = new Map<PolyId, FacePlane[]>()

export function buildFacePlanes(poly: PolyId = 'icosa'): FacePlane[] {
  const cached = _planeCache.get(poly)
  if (cached) return cached
  const { verts, faces } = getPolyhedron(poly)
  const planes = faces.map(f => {
    const v0 = verts[f[0]]
    const v1 = verts[f[1]]
    const v2 = verts[f[2]]
    const normal = norm3(cross3(sub3(v1, v0), sub3(v2, v0)))
    const d = dot3(normal, v0)
    const centroid = centroid3(f.map(i => verts[i]))
    const u = norm3(sub3(v1, v0))
    const w = cross3(normal, u) // already unit since normal⊥u
    return { normal, d, centroid, u, w }
  })
  _planeCache.set(poly, planes)
  return planes
}

// Project 3D point onto face plane coordinate frame → 2D
export function project2D(p: Vec3, plane: FacePlane): [number, number] {
  const r = sub3(p, plane.centroid)
  return [dot3(r, plane.u), dot3(r, plane.w)]
}

// Lift 2D point in face plane back to 3D
export function lift3D(xy: [number, number], plane: FacePlane): Vec3 {
  return add3(plane.centroid, add3(scale3(plane.u, xy[0]), scale3(plane.w, xy[1])))
}
