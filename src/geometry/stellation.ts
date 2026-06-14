import { Vec2, Vec3, dot3, cross3, sub3, scale3, add3, len2 } from './math'
import { PolyId, FacePlane, getPolyhedron, buildFacePlanes, project2D, lift3D } from './icosahedron'

export interface Line2D { a: number; b: number; c: number }

export interface CellPolygon {
  id: number
  typeId: number
  vertices: Vec2[]
  centroid: Vec2
  // Mirror-half flag for chiral painting: when a D_k orbit splits into two
  // mirror C_k (rotation-only) suborbits, the two halves get opposite values
  // and can be selected independently (state.halfTypes). For the icosahedron
  // the flag instead marks membership in the compound-of-five-tetrahedra face
  // triangle — the convention its chiral f1-layer presets are written in.
  mirrorHalf: boolean
}

// Clip convex polygon by half-plane a*x + b*y >= c
function clipByHP(poly: Vec2[], a: number, b: number, c: number): Vec2[] {
  if (!poly.length) return []
  const result: Vec2[] = []
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], nxt = poly[(i + 1) % poly.length]
    const dc = a * cur[0] + b * cur[1] - c
    const dn = a * nxt[0] + b * nxt[1] - c
    if (dc >= -1e-9) result.push(cur)
    if ((dc < -1e-9) !== (dn < -1e-9)) {
      const t = dc / (dc - dn)
      result.push([cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])])
    }
  }
  return result
}

const BOUNDS = 16  // outer cells have vertices up to ~15.8 (icosa); 16 captures all bounded stellation cells

// Compute all stellation lines in 2D for a reference face
export function computeStellationLines(poly: PolyId = 'icosa', refIdx = 0): Line2D[] {
  return linesForPlane(buildFacePlanes(poly), refIdx)
}

// Intersection lines of every other plane with planes[refIdx], in that
// plane's 2D frame
function linesForPlane(planes: FacePlane[], refIdx: number): Line2D[] {
  const ref = planes[refIdx]

  const lines: Line2D[] = []

  for (let i = 0; i < planes.length; i++) {
    if (i === refIdx) continue
    // Skip the antipodal (parallel) face: it yields no intersection line
    if (dot3(planes[i].normal, ref.normal) < -0.999) continue
    const pl = planes[i]

    // Intersection line direction
    const dir3 = cross3(ref.normal, pl.normal)

    // Point on intersection: solve [ref.normal; pl.normal; dir3] * x = [ref.d; pl.d; 0]
    // Use Cramer's rule, trying axes to avoid degenerate cases
    const n1 = ref.normal, d1 = ref.d
    const n2 = pl.normal, d2 = pl.d
    let p3: Vec3 | null = null

    const dz = n1[0]*n2[1] - n1[1]*n2[0]
    if (Math.abs(dz) > 1e-7) {
      const px = (d1*n2[1] - d2*n1[1]) / dz
      const py = (n1[0]*d2 - n2[0]*d1) / dz
      p3 = [px, py, 0]
    } else {
      const dy = n1[0]*n2[2] - n1[2]*n2[0]
      if (Math.abs(dy) > 1e-7) {
        const px = (d1*n2[2] - d2*n1[2]) / dy
        const pz = (n1[0]*d2 - n2[0]*d1) / dy
        p3 = [px, 0, pz]
      } else {
        const dx = n1[1]*n2[2] - n1[2]*n2[1]
        const py = (d1*n2[2] - d2*n1[2]) / dx
        const pz = (n1[1]*d2 - n2[1]*d1) / dx
        p3 = [0, py, pz]
      }
    }

    const p2 = project2D(p3, ref)
    const d2x = dot3(dir3, ref.u)
    const d2y = dot3(dir3, ref.w)

    // Perpendicular form: a*x + b*y = c
    const a = -d2y, b = d2x
    const nn = Math.sqrt(a*a + b*b)
    if (nn < 1e-9) continue
    lines.push({ a: a/nn, b: b/nn, c: (a*p2[0] + b*p2[1]) / nn })
  }

  return lines
}

// Compute signature array for a 2D point
function signature(lines: Line2D[], x: number, y: number): string {
  return lines.map(l => l.a*x + l.b*y >= l.c ? '1' : '0').join('')
}

// Compute cell polygon from its signature (null if unbounded or degenerate)
function cellPoly(lines: Line2D[], sig: string, bound = BOUNDS): Vec2[] | null {
  let poly: Vec2[] = [
    [-bound, -bound], [bound, -bound],
    [bound, bound], [-bound, bound],
  ]
  for (let i = 0; i < lines.length; i++) {
    const { a, b, c } = lines[i]
    const s = sig[i] === '1' ? 1 : -1
    poly = clipByHP(poly, s*a, s*b, s*c)
    if (!poly.length) return null
  }
  if (poly.length < 3) return null
  if (poly.some(p => Math.abs(p[0]) >= bound - 0.01 || Math.abs(p[1]) >= bound - 0.01)) return null
  // Remove consecutive near-duplicate vertices created when clip lines pass through polygon vertices
  const EPS2 = 1e-10
  const deduped: Vec2[] = [poly[0]]
  for (let i = 1; i < poly.length; i++) {
    const prev = deduped[deduped.length - 1], cur = poly[i]
    if ((cur[0]-prev[0])**2 + (cur[1]-prev[1])**2 > EPS2) deduped.push(cur)
  }
  while (deduped.length > 1) {
    const f = deduped[0], l = deduped[deduped.length - 1]
    if ((f[0]-l[0])**2 + (f[1]-l[1])**2 <= EPS2) deduped.pop()
    else break
  }
  if (deduped.length < 3) return null
  return deduped
}

// Find all bounded cells by sampling near every pairwise line intersection.
// This avoids the BFS ghost-cell problem: signatures are seeded only from real geometric points.
export function computeCells(lines: Line2D[], bound = BOUNDS): CellPolygon[] {
  const sigSet = new Set<string>()
  sigSet.add(signature(lines, 0, 0))  // face centroid = inside cell A

  const eps = 0.001
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const li = lines[i], lj = lines[j]
      const det = li.a * lj.b - li.b * lj.a
      if (Math.abs(det) < 1e-9) continue  // parallel lines
      const px = (li.c * lj.b - lj.c * li.b) / det
      const py = (li.a * lj.c - lj.a * li.c) / det
      // Sample 8 perturbed points around the intersection to catch all adjacent cells
      for (const dx of [-eps, 0, eps]) {
        for (const dy of [-eps, 0, eps]) {
          if (dx === 0 && dy === 0) continue
          sigSet.add(signature(lines, px + dx, py + dy))
        }
      }
    }
  }

  const cells: CellPolygon[] = []
  let id = 0
  for (const sig of sigSet) {
    const poly = cellPoly(lines, sig, bound)
    if (poly) {
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
      const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
      cells.push({ id: id++, typeId: -1, vertices: poly, centroid: [cx, cy], mirrorHalf: false })
    }
  }
  return cells
}

// The compound of five tetrahedra has exactly one tetrahedron face per icosahedron
// face plane. In the reference plane it is the triangle below (tetrahedron vertices
// at φ²·(±1,±1,±1) even-parity cube corners, projected to 2D). Its edges lie on
// stellation lines, so every cell is fully inside or outside. Cells inside one
// 6-cell orbit form one of its two mirror triples (C₃ orbits).
function markTetraTriangle(cells: CellPolygon[]): void {
  const phi2 = (3 + Math.sqrt(5)) / 2  // φ²
  const planes = buildFacePlanes()
  const ref = planes[0]  // outward normal ∝ (-1,1,1)/√3
  const tri3: Vec3[] = [
    [phi2, phi2, phi2],
    [-phi2, phi2, -phi2],
    [-phi2, -phi2, phi2],
  ]
  const tri = tri3.map(v => project2D(v, ref))

  const inTri = ([px, py]: Vec2): boolean => {
    let neg = false, pos = false
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = tri[i], [x2, y2] = tri[(i + 1) % 3]
      const d = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
      if (d < 0) neg = true
      if (d > 0) pos = true
    }
    return !(neg && pos)
  }

  for (const c of cells) c.mirrorHalf = inTri(c.centroid)
}

// Symmetry group of the reference face acting on its plane: candidate
// rotations take projected vertex 0 to vertex j, candidate reflections use
// the bisecting axis. A candidate is kept only if its 3D counterpart (about
// the face axis) maps the whole set of face planes onto itself — the face
// polygon's own symmetry can exceed the polyhedron's, and only the latter
// leaves the stellation diagram invariant: regular faces of the Platonic
// solids give the usual D_k, the rhombic-triacontahedron faces D₂, and the
// truncated icosahedron's regular hexagons only D₃.
// With includeReflections = false, just the rotation subgroup.
// [row-major 2x2]: apply(m, [x,y]) = [m[0]*x+m[1]*y, m[2]*x+m[3]*y]
function faceSymmetryOps(poly: PolyId, refIdx = 0, includeReflections = true): number[][] {
  const planes = buildFacePlanes(poly)
  const { verts, faces } = getPolyhedron(poly)
  const ref = planes[refIdx]
  const pts = faces[refIdx].map(vi => project2D(verts[vi], ref))

  // 3D linear map of the in-plane op (the face axis passes through the
  // origin and the face centroid, and both rotations and in-plane
  // reflections fix the normal direction)
  const isPolySymmetry = (m: number[]): boolean => {
    const Tu = add3(scale3(ref.u, m[0]), scale3(ref.w, m[2]))
    const Tw = add3(scale3(ref.u, m[1]), scale3(ref.w, m[3]))
    const T = (v: Vec3): Vec3 => add3(
      add3(scale3(Tu, dot3(v, ref.u)), scale3(Tw, dot3(v, ref.w))),
      scale3(ref.normal, dot3(v, ref.normal)))
    return planes.every(pj => {
      const tn = T(pj.normal)
      return planes.some(pk =>
        Math.abs(pk.d - pj.d) < 1e-6 &&
        (tn[0]-pk.normal[0])**2 + (tn[1]-pk.normal[1])**2 + (tn[2]-pk.normal[2])**2 < 1e-10)
    })
  }

  const a0 = Math.atan2(pts[0][1], pts[0][0])
  const ops: number[][] = []
  for (let j = 0; j < pts.length; j++) {
    const aj = Math.atan2(pts[j][1], pts[j][0])
    const th = aj - a0
    const rot = [Math.cos(th), -Math.sin(th), Math.sin(th), Math.cos(th)]
    if (isPolySymmetry(rot)) ops.push(rot)
    if (!includeReflections) continue
    const b = (a0 + aj) / 2
    const refl = [Math.cos(2*b), Math.sin(2*b), Math.sin(2*b), -Math.cos(2*b)]
    if (isPolySymmetry(refl)) ops.push(refl)
  }
  return ops
}

function applyOp(m: readonly number[], p: Vec2): Vec2 {
  return [m[0]*p[0] + m[1]*p[1], m[2]*p[0] + m[3]*p[1]]
}

// Union cells equivalent under the given in-plane ops: for each cell and each
// transform, evaluate the signature at the transformed centroid and look up
// which cell occupies that region (avoids floating-point centroid matching).
// Returns each cell's group root index.
function groupBySymmetry(cells: CellPolygon[], lines: Line2D[], ops: number[][]): number[] {
  const n = cells.length
  const parent = Array.from({length: n}, (_, i) => i)

  // Map from signature-at-centroid to cell index
  const sigToIdx = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    sigToIdx.set(signature(lines, cells[i].centroid[0], cells[i].centroid[1]), i)
  }

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }

  for (let i = 0; i < n; i++) {
    for (const m of ops) {
      const tc = applyOp(m, cells[i].centroid)
      const j = sigToIdx.get(signature(lines, tc[0], tc[1]))
      if (j !== undefined) parent[find(i)] = find(j)
    }
  }
  return cells.map((_, i) => find(i))
}

// Assign typeIds by D_k equivalence classes
export function classifyCells(cells: CellPolygon[], lines: Line2D[], ops: number[][]): void {
  const roots = groupBySymmetry(cells, lines, ops)
  const rootToType = new Map<number, number>()
  let nextType = 0
  for (let i = 0; i < cells.length; i++) {
    if (!rootToType.has(roots[i])) rootToType.set(roots[i], nextType++)
    cells[i].typeId = rootToType.get(roots[i])!
  }
}

// Mark mirror halves for chiral painting: re-group with the rotation subgroup
// only. A D_k orbit either stays one C_k orbit (achiral) or splits into two
// suborbits, which are then necessarily mirror images of each other (a
// reflection-invariant C_k suborbit would itself be a full D_k orbit).
// The halves get opposite mirrorHalf flags.
function markChiralHalves(cells: CellPolygon[], lines: Line2D[], rotOps: number[][]): void {
  const roots = groupBySymmetry(cells, lines, rotOps)
  const typeRoots = new Map<number, Set<number>>()
  for (let i = 0; i < cells.length; i++) {
    let s = typeRoots.get(cells[i].typeId)
    if (!s) { s = new Set(); typeRoots.set(cells[i].typeId, s) }
    s.add(roots[i])
  }
  for (let i = 0; i < cells.length; i++) {
    const s = typeRoots.get(cells[i].typeId)!
    cells[i].mirrorHalf = s.size === 2 && roots[i] === Math.min(...s)
  }
}

// Remap typeIds so 0 = nearest to origin, in order of avg 3D centroid distance.
// Each orbit's cells live on a plane at its own distance, so comparison across
// orbits must use the lifted 3D distance (single-orbit ordering is unchanged:
// √(d² + r²) is monotonic in r).
function sortTypesByDistance(orbits: OrbitData[], numTypes: number): void {
  const distSum = new Array(numTypes).fill(0)
  const distCount = new Array(numTypes).fill(0)
  for (const od of orbits) {
    for (const c of od.cells) {
      distSum[c.typeId] += Math.hypot(od.planeDist, len2(c.centroid))
      distCount[c.typeId]++
    }
  }
  const avgDist = distSum.map((d, i) => d / (distCount[i] || 1))
  // order[newId] = oldId
  const order = Array.from({ length: numTypes }, (_, i) => i)
  order.sort((a, b) => avgDist[a] - avgDist[b])
  const remap: number[] = new Array(numTypes)
  order.forEach((oldId, newId) => { remap[oldId] = newId })
  for (const od of orbits) for (const c of od.cells) c.typeId = remap[c.typeId]
}

// One stellation diagram per face orbit. Polyhedra with a single face shape
// (icosa, dodeca, octa) have one orbit; the icosidodecahedron has two
// (triangles in the icosa planes, pentagons in the dodeca planes), each with
// its own diagram. Cell typeIds are global across orbits.
export interface OrbitData {
  refFace: number       // face index whose plane hosts this diagram
  lines: Line2D[]
  cells: CellPolygon[]
  planeDist: number     // distance of the face plane from the origin
}

interface StellationData {
  orbits: OrbitData[]
  faceOrbit: number[]   // face index → orbit index
  numTypes: number
  // Orbit-0 diagram, for single-diagram consumers
  lines: Line2D[]
  cells: CellPolygon[]
}

const _dataCache = new Map<PolyId, StellationData>()

export function getStellationData(poly: PolyId = 'icosa'): StellationData {
  let data = _dataCache.get(poly)
  if (!data) {
    const { faces } = getPolyhedron(poly)
    const planes = buildFacePlanes(poly)

    // Group faces into orbits by size: for all supported polyhedra,
    // same-size faces are equivalent under the symmetry group
    const orbitOfSize = new Map<number, number>()
    const faceOrbit = faces.map(f => {
      let o = orbitOfSize.get(f.length)
      if (o === undefined) { o = orbitOfSize.size; orbitOfSize.set(f.length, o) }
      return o
    })

    const orbits: OrbitData[] = []
    let numTypes = 0
    for (let o = 0; o < orbitOfSize.size; o++) {
      const refFace = faceOrbit.indexOf(o)
      const lines = computeStellationLines(poly, refFace)
      const cells = computeCells(lines)
      classifyCells(cells, lines, faceSymmetryOps(poly, refFace))
      // Chiral halves from rotation-only symmetry. The icosahedron instead
      // uses the five-tetrahedra triangle convention (markTetraTriangle
      // below), which its chiral presets are written in.
      if (poly !== 'icosa') markChiralHalves(cells, lines, faceSymmetryOps(poly, refFace, false))
      const nt = Math.max(...cells.map(c => c.typeId)) + 1
      for (const c of cells) c.typeId += numTypes
      numTypes += nt
      orbits.push({ refFace, lines, cells, planeDist: planes[refFace].d })
    }
    sortTypesByDistance(orbits, numTypes)

    if (poly === 'icosa') {
      const cells = orbits[0].cells
      markTetraTriangle(cells)

      // Merge outer cells (outside the outer triangle, avgDist > 6) into one type.
      // BOUNDS=16 finds two outer orbits (dist≈7.9 and dist≈9.1); they represent the
      // same stellation region and should be painted/selected together.
      const distSum = new Array(numTypes).fill(0), distCnt = new Array(numTypes).fill(0)
      for (const c of cells) { distSum[c.typeId] += len2(c.centroid); distCnt[c.typeId]++ }
      const avgDist = distSum.map((d, i) => d / (distCnt[i] || 1))
      const firstOuter = avgDist.findIndex(d => d > 6.0)
      if (firstOuter >= 0) {
        for (const c of cells) { if (c.typeId > firstOuter) c.typeId = firstOuter }
        numTypes = firstOuter + 1
      }
    }
    data = { orbits, faceOrbit, numTypes, lines: orbits[0].lines, cells: orbits[0].cells }
    _dataCache.set(poly, data)
  }
  return data
}

// ---- Explode grouping: 3D cells of the 20-plane arrangement ----
// Cutting space by all 20 face planes yields convex 3D chunks (the stellation
// cells). Each rendered facet (a 2D diagram cell lifted onto one face plane)
// separates two such chunks. When exploding, a facet moves with the chunk it
// bounds: the inner (origin-side) chunk normally, or the outer chunk when the
// region is seen from underneath (primed in the Wikipedia Faces column).
interface ExplodeGroups {
  offsets: Int32Array // face index → base index into inner/outer (per-face cell counts vary by orbit)
  inner: Int32Array   // offsets[faceIdx] + cellIdx → 3D chunk index
  outer: Int32Array
  centroids: Vec3[]   // chunk index → centroid (average of bounding facet centroids)
}

const _explodeCache = new Map<PolyId, ExplodeGroups>()

function getExplodeGroups(poly: PolyId): ExplodeGroups {
  const cached = _explodeCache.get(poly)
  if (cached) return cached
  const { orbits, faceOrbit } = getStellationData(poly)
  const planes = buildFacePlanes(poly)
  const EPS = 1e-5

  const offsets = new Int32Array(planes.length + 1)
  for (let fi = 0; fi < planes.length; fi++) {
    offsets[fi + 1] = offsets[fi] + orbits[faceOrbit[fi]].cells.length
  }

  // Identify a 3D chunk by which side of each face plane it is on
  const sigOf = (p: Vec3): string => {
    let s = ''
    for (const pl of planes) s += dot3(pl.normal, p) < pl.d ? '1' : '0'
    return s
  }

  const sigToIdx = new Map<string, number>()
  const sums: Vec3[] = []
  const counts: number[] = []
  const groupAt = (p: Vec3, facetCentroid: Vec3): number => {
    const sig = sigOf(p)
    let idx = sigToIdx.get(sig)
    if (idx === undefined) {
      idx = sums.length
      sigToIdx.set(sig, idx)
      sums.push([0, 0, 0])
      counts.push(0)
    }
    sums[idx] = add3(sums[idx], facetCentroid)
    counts[idx]++
    return idx
  }

  const inner = new Int32Array(offsets[planes.length])
  const outer = new Int32Array(offsets[planes.length])
  for (let fi = 0; fi < planes.length; fi++) {
    const pl = planes[fi]
    const cells = orbits[faceOrbit[fi]].cells
    for (let ci = 0; ci < cells.length; ci++) {
      const c3 = lift3D(cells[ci].centroid, pl)
      inner[offsets[fi] + ci] = groupAt(sub3(c3, scale3(pl.normal, EPS)), c3)
      outer[offsets[fi] + ci] = groupAt(add3(c3, scale3(pl.normal, EPS)), c3)
    }
  }

  const centroids = sums.map((s, i) => scale3(s, 1 / counts[i]))
  const groups = { offsets, inner, outer, centroids }
  _explodeCache.set(poly, groups)
  return groups
}

// Build 3D triangles for a given set of selected type IDs, for all 20 faces
export interface StellationMesh {
  positions: Float32Array   // xyz per vertex
  normals: Float32Array     // xyz per vertex
  typeIds: Uint8Array       // cell typeId per vertex
  faceIds: Uint8Array       // face-plane index per vertex
  count: number             // number of vertices
  edgePositions: Float32Array // facet polygon edges as GL line segments (xyz pairs)
  edgeCount: number           // number of line vertices
}

export function buildMesh(
  selectedTypes: Set<number>,
  explodeFactor: number,
  halfTypes?: ReadonlyMap<number, boolean>,  // typeId → required mirrorHalf value (chiral half-orbits)
  primedTypes?: ReadonlySet<number>,         // regions seen from underneath → explode with outer chunk
  visibleFaces?: ReadonlySet<number>,        // face-plane indices to render (default: all)
  poly: PolyId = 'icosa',
  closeCells = false,                        // render the full boundary of every selected 3D chunk
  faceCut = false                            // hide whole cells beyond the reference face's plane
): StellationMesh {
  const { orbits, faceOrbit } = getStellationData(poly)
  const planes = buildFacePlanes(poly)
  const groups = explodeFactor > 0 || closeCells ? getExplodeGroups(poly) : null

  // Face cut: drop whole facets whose (un-exploded) centroid lies beyond the
  // reference face's plane, keeping the centre side. Decided per cell so an
  // exploded cell is never sliced — it just isn't emitted in the first place.
  const ref = planes[0]
  const cutD = ref.d + 1e-6
  const beyondCut = (cell: CellPolygon, plane: FacePlane): boolean => {
    const c = lift3D(cell.centroid, plane)
    return dot3(ref.normal, c) > cutD
  }

  const selected = (cell: CellPolygon): boolean =>
    selectedTypes.has(cell.typeId) &&
    (!halfTypes?.has(cell.typeId) || halfTypes.get(cell.typeId) === cell.mirrorHalf)

  // Closed-cell mode: the selection picks 3D chunks (the chunk each selected
  // facet explodes with), and every boundary facet of those chunks is drawn —
  // the unselected ones are the "closing" faces. Chunk selection ignores
  // visibleFaces (a display-only cutaway filter applied at render time).
  let chunkSel: Set<number> | null = null
  if (closeCells && groups) {
    chunkSel = new Set()
    for (let fi = 0; fi < planes.length; fi++) {
      const cells = orbits[faceOrbit[fi]].cells
      const cutPlane = planes[fi]
      for (let ci = 0; ci < cells.length; ci++) {
        if (!selected(cells[ci])) continue
        if (faceCut && beyondCut(cells[ci], cutPlane)) continue
        chunkSel.add(primedTypes?.has(cells[ci].typeId)
          ? groups.outer[groups.offsets[fi] + ci]
          : groups.inner[groups.offsets[fi] + ci])
      }
    }
  }

  const posArr: number[] = []
  const normArr: number[] = []
  const typeArr: number[] = []
  const faceArr: number[] = []
  const edgeArr: number[] = []

  for (let fi = 0; fi < planes.length; fi++) {
    if (visibleFaces && !visibleFaces.has(fi)) continue
    const plane = planes[fi]
    const n = plane.normal
    const cells = orbits[faceOrbit[fi]].cells

    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci]
      if (faceCut && beyondCut(cell, plane)) continue

      // One copy of the facet per 3D chunk it moves with (a facet between two
      // selected chunks is drawn for both so each cell stays closed when exploded)
      const offsets: Vec3[] = []
      if (chunkSel && groups) {
        const gIn = groups.inner[groups.offsets[fi] + ci]
        const gOut = groups.outer[groups.offsets[fi] + ci]
        const picked: number[] = []
        if (chunkSel.has(gIn)) picked.push(gIn)
        if (chunkSel.has(gOut) && gOut !== gIn) picked.push(gOut)
        if (!picked.length) continue
        if (explodeFactor > 0) {
          for (const g of picked) offsets.push(scale3(groups.centroids[g], explodeFactor * 0.8))
        } else {
          offsets.push([0, 0, 0])  // unexploded copies coincide: emit once
        }
      } else {
        if (!selected(cell)) continue
        // Explode: move with the 3D chunk this facet bounds, away from the origin
        let offset: Vec3 = [0, 0, 0]
        if (groups && explodeFactor > 0) {
          const gi = primedTypes?.has(cell.typeId)
            ? groups.outer[groups.offsets[fi] + ci]
            : groups.inner[groups.offsets[fi] + ci]
          offset = scale3(groups.centroids[gi], explodeFactor * 0.8)
        }
        offsets.push(offset)
      }

      for (const offset of offsets) {
        // Fan triangulation from first vertex
        const v3d = cell.vertices.map(v2 => {
          const base = lift3D(v2, plane)
          return add3(base, offset)
        })

        for (let k = 1; k < v3d.length - 1; k++) {
          const a = v3d[0], b = v3d[k], c = v3d[k+1]
          for (const p of [a, b, c]) {
            posArr.push(p[0], p[1], p[2])
            normArr.push(n[0], n[1], n[2])
            typeArr.push(cell.typeId)
            faceArr.push(fi)
          }
        }

        // Polygon boundary edges for outline rendering
        for (let k = 0; k < v3d.length; k++) {
          const a = v3d[k], b = v3d[(k + 1) % v3d.length]
          edgeArr.push(a[0], a[1], a[2], b[0], b[1], b[2])
        }
      }
    }
  }

  const count = posArr.length / 3
  return {
    positions: new Float32Array(posArr),
    normals: new Float32Array(normArr),
    typeIds: new Uint8Array(typeArr),
    faceIds: new Uint8Array(faceArr),
    count,
    edgePositions: new Float32Array(edgeArr),
    edgeCount: edgeArr.length / 3,
  }
}

// ---- "Block" mode: the arrangement carved out of a bounding cube ----------
// The face planes cut a bounding cube into pieces: every bounded stellation
// cell as usual, plus filler pieces where the unbounded chunks meet the cube.
// At explode 0 the assembled pieces ARE the cube; exploding scatters them.
// Implemented by adding the 6 cube planes to the arrangement: each plane's
// 2D cells are recomputed in its own frame (clipped by the cube lines), and
// chunks are identified by their side-of-every-plane signature.
interface BlockFacet {
  planeIdx: number     // index into BlockData.planes (face planes then cube faces)
  vertices: Vec2[]
  typeId: number       // original cell type, or numTypes for filler pieces
  inner: number        // chunk indices on each side
  outer: number
}

interface BlockData {
  planes: FacePlane[]
  numBase: number          // count of original face planes
  facets: BlockFacet[]
  centroids: Vec3[]        // chunk index → centroid
  insideCube: boolean[]    // chunk index → is a piece of the block?
}

const _blockCache = new Map<PolyId, BlockData>()

export function getBlockData(poly: PolyId): BlockData {
  const cached = _blockCache.get(poly)
  if (cached) return cached
  const data = getStellationData(poly)
  const basePlanes = buildFacePlanes(poly)

  // Bounding cube: just beyond every bounded cell vertex
  let maxC = 0
  for (let fi = 0; fi < basePlanes.length; fi++) {
    for (const c of data.orbits[data.faceOrbit[fi]].cells) {
      for (const v of c.vertices) {
        const p = lift3D(v, basePlanes[fi])
        maxC = Math.max(maxC, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))
      }
    }
  }
  const B = maxC * 1.05

  const cubePlanes: FacePlane[] = []
  for (let axis = 0; axis < 3; axis++) {
    for (const sgn of [1, -1]) {
      const normal: Vec3 = [0, 0, 0]
      normal[axis] = sgn
      const u: Vec3 = [0, 0, 0]
      u[(axis + 1) % 3] = 1
      cubePlanes.push({
        normal, d: B, centroid: scale3(normal, B), u,
        w: cross3(normal, u),
      })
    }
  }
  const planes = [...basePlanes, ...cubePlanes]

  // Chunk identification by plane-side signature; '1' = origin side
  const sigOf = (p: Vec3): string => {
    let s = ''
    for (const pl of planes) s += dot3(pl.normal, p) < pl.d ? '1' : '0'
    return s
  }
  const sigToChunk = new Map<string, number>()
  const sums: Vec3[] = []
  const counts: number[] = []
  const insideCube: boolean[] = []
  const chunkAt = (p: Vec3, facetCentroid: Vec3): number => {
    const sig = sigOf(p)
    let idx = sigToChunk.get(sig)
    if (idx === undefined) {
      idx = sums.length
      sigToChunk.set(sig, idx)
      sums.push([0, 0, 0])
      counts.push(0)
      insideCube.push(!sig.slice(basePlanes.length).includes('0'))
    }
    sums[idx] = add3(sums[idx], facetCentroid)
    counts[idx]++
    return idx
  }

  const EPS = 1e-5
  const bound = B * 1.8 + 3  // covers the cube's largest cross-section
  const facets: BlockFacet[] = []

  for (let pi = 0; pi < planes.length; pi++) {
    const lines = linesForPlane(planes, pi)
    const cells2 = computeCells(lines, bound)

    // Type lookup against the original orbit diagram. Its frame may differ
    // from this plane's by a face rotation, which permutes cells within a
    // type, so the signature lookup still lands on the right typeId.
    let lookup: ((p: Vec2) => number | undefined) | null = null
    if (pi < basePlanes.length) {
      const od = data.orbits[data.faceOrbit[pi]]
      const sigToType = new Map<string, number>()
      for (const c of od.cells) {
        sigToType.set(signature(od.lines, c.centroid[0], c.centroid[1]), c.typeId)
      }
      lookup = (p: Vec2) => sigToType.get(signature(od.lines, p[0], p[1]))
    }

    for (const c of cells2) {
      const c3 = lift3D(c.centroid, planes[pi])
      if (Math.abs(c3[0]) > B + 1e-6 || Math.abs(c3[1]) > B + 1e-6 || Math.abs(c3[2]) > B + 1e-6) continue
      const typeId = lookup?.(c.centroid) ?? data.numTypes
      const n = planes[pi].normal
      facets.push({
        planeIdx: pi,
        vertices: c.vertices,
        typeId,
        inner: chunkAt(sub3(c3, scale3(n, EPS)), c3),
        outer: chunkAt(add3(c3, scale3(n, EPS)), c3),
      })
    }
  }

  const centroids = sums.map((s, i) => scale3(s, 1 / counts[i]))
  const block = { planes, numBase: basePlanes.length, facets, centroids, insideCube }
  _blockCache.set(poly, block)
  return block
}

// Mesh of the cube block cut by all face planes (see getBlockData)
export function buildBlockMesh(
  explodeFactor: number,
  visibleFaces?: ReadonlySet<number>,
  poly: PolyId = 'icosa'
): StellationMesh {
  const bd = getBlockData(poly)

  const posArr: number[] = []
  const normArr: number[] = []
  const typeArr: number[] = []
  const faceArr: number[] = []
  const edgeArr: number[] = []

  for (const f of bd.facets) {
    if (visibleFaces && f.planeIdx < bd.numBase && !visibleFaces.has(f.planeIdx)) continue
    const plane = bd.planes[f.planeIdx]
    const n = plane.normal

    // One copy per adjacent piece (chunks outside the cube are not pieces)
    const picked: number[] = []
    if (bd.insideCube[f.inner]) picked.push(f.inner)
    if (bd.insideCube[f.outer] && f.outer !== f.inner) picked.push(f.outer)
    if (!picked.length) continue
    const offsets: Vec3[] = explodeFactor > 0
      ? picked.map(g => scale3(bd.centroids[g], explodeFactor * 0.8))
      : [[0, 0, 0]]

    for (const offset of offsets) {
      const v3d = f.vertices.map(v2 => add3(lift3D(v2, plane), offset))
      for (let k = 1; k < v3d.length - 1; k++) {
        for (const p of [v3d[0], v3d[k], v3d[k + 1]]) {
          posArr.push(p[0], p[1], p[2])
          normArr.push(n[0], n[1], n[2])
          typeArr.push(f.typeId)
          faceArr.push(f.planeIdx)
        }
      }
      for (let k = 0; k < v3d.length; k++) {
        const a = v3d[k], b = v3d[(k + 1) % v3d.length]
        edgeArr.push(a[0], a[1], a[2], b[0], b[1], b[2])
      }
    }
  }

  return {
    positions: new Float32Array(posArr),
    normals: new Float32Array(normArr),
    typeIds: new Uint8Array(typeArr),
    faceIds: new Uint8Array(faceArr),
    count: posArr.length / 3,
    edgePositions: new Float32Array(edgeArr),
    edgeCount: edgeArr.length / 3,
  }
}
