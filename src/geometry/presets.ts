// 59 stellations of the icosahedron.
// Source: Wikipedia "The Fifty-Nine Icosahedra" — "List of the fifty-nine icosahedra".
//
// Each preset lists the FACES column of that table: the stellation-diagram
// region numbers (0–13, Du Val numbering) that form the visible surface of
// the solid. Since this app renders selected diagram regions as flat polygons
// on all 20 face planes, the Faces column directly describes what to draw.
//
// Primed numbers in the table (e.g. 3') mean the region is seen from
// underneath; it is the same diagram region, so primes are dropped here.
//
// The Du Val numbering (verified against the numbered diagram SVG,
// File:Icosahedron_stellation_diagram_center.svg) maps to our cell types
// (sorted by centroid distance) via FACE_TO_TYPE below.

export interface Preset {
  name: string
  symbol?: string
  // Du Val cell notation from the table (e.g. 'De₂f₁′f₂g₂'). Chiral rows
  // (33–59) carry the prime on f₁ — they use one handedness of the f₁ layer.
  duVal?: string
  // Wenninger model number (e.g. 'W42'), where the table lists one
  wenninger?: string
  faces: number[]   // stellation-diagram region numbers (Du Val), primes stripped
  // Regions marked with a prime in the table (e.g. 3') — seen from underneath,
  // i.e. these facets bound the solid from below. Used to pick which 3D chunk
  // a facet moves with when exploding.
  primed?: number[]
  // Chiral rows (33–59) use only one handedness of the f1 cell layer — the only
  // chiral layer (all its facet regions 5,6,9,10 are 6-cell orbits). Each entry
  // selects one mirror triple of that region: 'R' = the half associated with the
  // chosen (dextro) f1 cells, 'L' = the mirror half. Derived per row from layer
  // visibility (verified against the primed/unprimed Faces column of the table).
  halves?: { [region: number]: 'R' | 'L' }
}

// Wikipedia region number → our typeId (cell orbits sorted by centroid distance).
// Derived by fitting the numbered-diagram SVG labels onto our computed cells.
export const FACE_TO_TYPE: readonly number[] = [0, 1, 2, 4, 3, 7, 6, 5, 11, 9, 8, 12, 10, 13]

export const PRESETS: Preset[] = [
  // ── 1–8: main shells ──────────────────────────────────────────────────────
  { name: 'Regular icosahedron',            symbol: '{3,5}',   duVal: 'A', wenninger: 'W4',  faces: [0] },
  { name: 'Small triambic icosahedron',                        duVal: 'B', wenninger: 'W26', faces: [1] },
  { name: 'Compound of five octahedra',                        duVal: 'C', wenninger: 'W23', faces: [2] },
  { name: 'Stellation 4',                                      duVal: 'D',                   faces: [3, 4] },
  { name: 'Stellation 5',                                      duVal: 'E',                   faces: [5, 6, 7] },
  { name: 'Second stellation of icosahedron',                  duVal: 'F', wenninger: 'W27', faces: [8, 9, 10] },
  { name: 'Great icosahedron',              symbol: '{3,5/2}', duVal: 'G', wenninger: 'W41', faces: [11, 12] },
  { name: 'Final stellation of icosahedron',                   duVal: 'H', wenninger: 'W42', faces: [13] },

  // ── 9–14: e1/f1/g1 cells ──────────────────────────────────────────────────
  { name: 'Stellation 9',                                      duVal: 'e₁',     wenninger: 'W37', faces: [3, 5],           primed: [3] },
  { name: 'Stellation 10',                                     duVal: 'f₁',                       faces: [5, 6, 9, 10],    primed: [5, 6] },
  { name: 'Fourth stellation of icosahedron',                  duVal: 'g₁',     wenninger: 'W29', faces: [10, 12],         primed: [10] },
  { name: 'Stellation 12',                                     duVal: 'e₁f₁',                     faces: [3, 6, 9, 10],    primed: [3, 6] },
  { name: 'Stellation 13',                                     duVal: 'e₁f₁g₁',                   faces: [3, 6, 9, 12],    primed: [3, 6] },
  { name: 'Stellation 14',                                     duVal: 'f₁g₁',                     faces: [5, 6, 9, 12],    primed: [5, 6] },

  // ── 15–20: e2/f2/g2 cells ─────────────────────────────────────────────────
  { name: 'Stellation 15',                                     duVal: 'e₂',                       faces: [4, 6, 7],        primed: [4] },
  { name: 'Stellation 16',                                     duVal: 'f₂',                       faces: [7, 8],           primed: [7] },
  { name: 'Stellation 17',                                     duVal: 'g₂',                       faces: [8, 9, 11],       primed: [8, 9] },
  { name: 'Stellation 18',                                     duVal: 'e₂f₂',                     faces: [4, 6, 8],        primed: [4] },
  { name: 'Stellation 19',                                     duVal: 'e₂f₂g₂',                   faces: [4, 6, 9, 11],    primed: [4, 9] },
  { name: 'Fifth stellation of icosahedron',                   duVal: 'f₂g₂',   wenninger: 'W30', faces: [7, 9, 11],       primed: [7, 9] },

  // ── 21–26: shells + e1/f1/g1 ──────────────────────────────────────────────
  { name: 'Seventh stellation of icosahedron',                 duVal: 'De₁',    wenninger: 'W32', faces: [4, 5] },
  { name: 'Compound of ten tetrahedra',                        duVal: 'Ef₁',    wenninger: 'W25', faces: [7, 9, 10] },
  { name: 'Sixth stellation of icosahedron',                   duVal: 'Fg₁',    wenninger: 'W31', faces: [8, 9, 12] },
  { name: 'Stellation 24',                                     duVal: 'De₁f₁',                    faces: [4, 6, 9, 10],    primed: [6] },
  { name: 'Stellation 25',                                     duVal: 'De₁f₁g₁',                  faces: [4, 6, 9, 12],    primed: [6] },
  { name: 'Excavated dodecahedron',                            duVal: 'Ef₁g₁',  wenninger: 'W28', faces: [7, 9, 12] },

  // ── 27–32: shells + e2/f2/g2 ──────────────────────────────────────────────
  { name: 'Stellation 27',                                     duVal: 'De₂',                      faces: [3, 6, 7] },
  { name: 'Stellation 28',                                     duVal: 'Ef₂',                      faces: [5, 6, 8] },
  { name: 'Eighth stellation of icosahedron',                  duVal: 'Fg₂',    wenninger: 'W33', faces: [10, 11] },
  { name: 'Great triambic icosahedron',                        duVal: 'De₂f₂',  wenninger: 'W34', faces: [3, 6, 8] },
  { name: 'Stellation 31',                                     duVal: 'De₂f₂g₂',                  faces: [3, 6, 9, 11],    primed: [9] },
  { name: 'Stellation 32',                                     duVal: 'Ef₂g₂',                    faces: [5, 6, 9, 11],    primed: [9] },

  // ── 33–44: chiral (half f1), f1-family ────────────────────────────────────
  { name: 'Tenth stellation of icosahedron',                   duVal: 'f₁′',    wenninger: 'W35', faces: [5, 6, 9, 10],          primed: [5, 6],
    halves: { 5: 'R', 6: 'R', 9: 'R', 10: 'R' } },
  { name: 'Eleventh stellation of icosahedron',                duVal: 'e₁f₁′',  wenninger: 'W36', faces: [3, 5, 6, 9, 10],       primed: [3, 6],
    halves: { 5: 'L', 6: 'R', 9: 'R', 10: 'R' } },
  { name: 'Stellation 35',                                     duVal: 'De₁f₁′',                   faces: [4, 5, 6, 9, 10],       primed: [6],
    halves: { 5: 'L', 6: 'R', 9: 'R', 10: 'R' } },
  { name: 'Stellation 36',                                     duVal: 'f₁′g₁',                    faces: [5, 6, 9, 10, 12],      primed: [5, 6, 10],
    halves: { 5: 'R', 6: 'R', 9: 'R', 10: 'L' } },
  { name: 'Fourteenth stellation of icosahedron',              duVal: 'e₁f₁′g₁', wenninger: 'W39', faces: [3, 5, 6, 9, 10, 12],  primed: [3, 6, 10],
    halves: { 5: 'L', 6: 'R', 9: 'R', 10: 'L' } },
  { name: 'Stellation 38',                                     duVal: 'De₁f₁′g₁',                 faces: [4, 5, 6, 9, 10, 12],   primed: [6, 10],
    halves: { 5: 'L', 6: 'R', 9: 'R', 10: 'L' } },
  { name: 'Stellation 39',                                     duVal: 'f₁′g₂',                    faces: [5, 6, 8, 9, 10, 11],   primed: [5, 6, 8, 9],
    halves: { 5: 'R', 6: 'R', 9: 'L', 10: 'R' } },
  { name: 'Stellation 40',                                     duVal: 'e₁f₁′g₂',                  faces: [3, 5, 6, 8, 9, 10, 11], primed: [3, 6, 8, 9],
    halves: { 5: 'L', 6: 'R', 9: 'L', 10: 'R' } },
  { name: 'Stellation 41',                                     duVal: 'De₁f₁′g₂',                 faces: [4, 5, 6, 8, 9, 10, 11], primed: [6, 8, 9],
    halves: { 5: 'L', 6: 'R', 9: 'L', 10: 'R' } },
  { name: 'Stellation 42',                                     duVal: 'f₁′f₂g₂',                  faces: [5, 6, 7, 9, 10, 11],   primed: [5, 6, 7, 9],
    halves: { 5: 'R', 6: 'R', 9: 'L', 10: 'R' } },
  { name: 'Stellation 43',                                     duVal: 'e₁f₁′f₂g₂',                faces: [3, 5, 6, 7, 9, 10, 11], primed: [3, 6, 7, 9],
    halves: { 5: 'L', 6: 'R', 9: 'L', 10: 'R' } },
  { name: 'Stellation 44',                                     duVal: 'De₁f₁′f₂g₂',               faces: [4, 5, 6, 7, 9, 10, 11], primed: [6, 7, 9],
    halves: { 5: 'L', 6: 'R', 9: 'L', 10: 'R' } },

  // ── 45–59: chiral (half f1), e2 + f1 families mixed ───────────────────────
  { name: 'Fifteenth stellation of icosahedron',               duVal: 'e₂f₁′',  wenninger: 'W40', faces: [4, 5, 6, 7, 9, 10],    primed: [4, 5],
    halves: { 5: 'R', 6: 'L', 9: 'R', 10: 'R' } },
  { name: 'Stellation 46',                                     duVal: 'De₂f₁′',                   faces: [3, 5, 6, 7, 9, 10],    primed: [5],
    halves: { 5: 'R', 6: 'L', 9: 'R', 10: 'R' } },
  { name: 'Compound of five tetrahedra',                       duVal: 'Ef₁′',   wenninger: 'W24', faces: [5, 6, 7, 9, 10],
    halves: { 5: 'L', 6: 'L', 9: 'R', 10: 'R' } },
  { name: 'Stellation 48',                                     duVal: 'e₂f₁′g₁',                  faces: [4, 5, 6, 7, 9, 10, 12], primed: [4, 5, 10],
    halves: { 5: 'R', 6: 'L', 9: 'R', 10: 'L' } },
  { name: 'Stellation 49',                                     duVal: 'De₂f₁′g₁',                 faces: [3, 5, 6, 7, 9, 10, 12], primed: [5, 10],
    halves: { 5: 'R', 6: 'L', 9: 'R', 10: 'L' } },
  { name: 'Stellation 50',                                     duVal: 'Ef₁′g₁',                   faces: [5, 6, 7, 9, 10, 12],   primed: [10],
    halves: { 5: 'L', 6: 'L', 9: 'R', 10: 'L' } },
  { name: 'Thirteenth stellation of icosahedron',              duVal: 'e₂f₁′f₂', wenninger: 'W38', faces: [4, 5, 6, 8, 9, 10],   primed: [4, 5],
    halves: { 5: 'R', 6: 'L', 9: 'R', 10: 'R' } },
  { name: 'Stellation 52',                                     duVal: 'De₂f₁′f₂',                 faces: [3, 5, 6, 8, 9, 10],    primed: [5],
    halves: { 5: 'R', 6: 'L', 9: 'R', 10: 'R' } },
  { name: 'Stellation 53',                                     duVal: 'Ef₁′f₂',                   faces: [5, 6, 8, 9, 10],
    halves: { 5: 'L', 6: 'L', 9: 'R', 10: 'R' } },
  { name: 'Stellation 54',                                     duVal: 'e₂f₁′f₂g₁',                faces: [4, 5, 6, 8, 9, 10, 12], primed: [4, 5, 10],
    halves: { 5: 'R', 6: 'L', 9: 'R', 10: 'L' } },
  { name: 'Stellation 55',                                     duVal: 'De₂f₁′f₂g₁',               faces: [3, 5, 6, 8, 9, 10, 12], primed: [5, 10],
    halves: { 5: 'R', 6: 'L', 9: 'R', 10: 'L' } },
  { name: 'Stellation 56',                                     duVal: 'Ef₁′f₂g₁',                 faces: [5, 6, 8, 9, 10, 12],   primed: [10],
    halves: { 5: 'L', 6: 'L', 9: 'R', 10: 'L' } },
  { name: 'Stellation 57',                                     duVal: 'e₂f₁′f₂g₂',                faces: [4, 5, 6, 9, 10, 11],   primed: [4, 5, 9],
    halves: { 5: 'R', 6: 'L', 9: 'L', 10: 'R' } },
  { name: 'Stellation 58',                                     duVal: 'De₂f₁′f₂g₂',               faces: [3, 5, 6, 9, 10, 11],   primed: [5, 9],
    halves: { 5: 'R', 6: 'L', 9: 'L', 10: 'R' } },
  { name: 'Stellation 59',                                     duVal: 'Ef₁′f₂g₂',                 faces: [5, 6, 9, 10, 11],      primed: [9],
    halves: { 5: 'L', 6: 'L', 9: 'L', 10: 'R' } },
]

// ── Dodecahedron ─────────────────────────────────────────────────────────────
// The dodecahedron has just three stellations. Cell types sorted by distance:
// 0 = face pentagon, 1 = pentagram points, 2 = great-dodecahedron wedges,
// 3 = great-stellated spikes. Region numbers map 1:1 onto typeIds.
export const FACE_TO_TYPE_DODECA: readonly number[] = [0, 1, 2, 3]

export const DODECA_PRESETS: Preset[] = [
  { name: 'Regular dodecahedron',           symbol: '{5,3}',   wenninger: 'W5',  faces: [0] },
  { name: 'Small stellated dodecahedron',   symbol: '{5/2,5}', wenninger: 'W20', faces: [1] },
  { name: 'Great dodecahedron',             symbol: '{5,5/2}', wenninger: 'W21', faces: [2] },
  { name: 'Great stellated dodecahedron',   symbol: '{5/2,3}', wenninger: 'W22', faces: [3] },
]

// ── Octahedron ───────────────────────────────────────────────────────────────
// The octahedron has a single stellation: the stella octangula (compound of
// two tetrahedra). Types: 0 = face triangle, 1 = the spike triangles.
export const FACE_TO_TYPE_OCTA: readonly number[] = [0, 1]

export const OCTA_PRESETS: Preset[] = [
  { name: 'Regular octahedron', symbol: '{3,4}', wenninger: 'W2',  faces: [0] },
  { name: 'Stella octangula',                    wenninger: 'W19', faces: [1] },
]

// ── Icosidodecahedron ────────────────────────────────────────────────────────
// Two face orbits: 20 triangles in the icosahedron's planes and 12 pentagons
// in the dual dodecahedron's planes — so each orbit has its own stellation
// diagram and the 76 cell types are numbered globally by distance.
// The presets reference computed typeIds directly (identity mapping); the
// compound/final selections were derived numerically (parity ray tests for
// the compounds, bounded/unbounded chunk tests for the final stellation).
export const FACE_TO_TYPE_ICOSIDODECA: readonly number[] =
  Array.from({ length: 76 }, (_, i) => i)

export const ICOSIDODECA_PRESETS: Preset[] = [
  { name: 'Icosidodecahedron', wenninger: 'W12', faces: [0, 1] },
  // Its first stellation: the dual compound (pyramids over every face)
  { name: 'Compound of dodecahedron and icosahedron', faces: [2, 3] },
  { name: 'Compound of great icosahedron and great stellated dodecahedron',
    faces: [41, 44, 50, 54, 56, 59, 60, 67, 68] },
  { name: 'Final stellation of icosidodecahedron',
    faces: [54, 60, 63, 65, 67, 71, 72, 73, 74, 75] },
]

// ── Rhombic triacontahedron ──────────────────────────────────────────────────
// Dual of the icosidodecahedron: 30 golden-rhombus faces (D₂ symmetry each),
// 193 diagram cells in 54 types. The compound and hexecontahedron selections
// were derived numerically (cube/rhombohedron inside tests on each facet);
// the final stellation via bounded/unbounded chunk tests.
export const FACE_TO_TYPE_RHOMBIC30: readonly number[] =
  Array.from({ length: 54 }, (_, i) => i)

export const RHOMBIC30_PRESETS: Preset[] = [
  { name: 'Rhombic triacontahedron', faces: [0] },
  // Cubes on the 5 orthogonal triples of 2-fold axes, faces in the 30 planes
  { name: 'Compound of five cubes', faces: [6, 7, 9, 10] },
  // Union of 20 acute golden rhombohedra at the center (the Wolfram-logo solid)
  { name: 'Rhombic hexecontahedron', faces: [6, 11, 16, 20, 24, 25, 29] },
  { name: 'Final stellation of rhombic triacontahedron',
    faces: [37, 43, 47, 48, 50, 51, 52, 53] },
]

// ── Truncated icosahedron ────────────────────────────────────────────────────
// The football: 20 hexagons in the icosa face planes + 12 pentagons in the
// truncation planes — 515 diagram cells in 85 types. Stellating it can
// "regrow" the icosahedron (and even reach the great icosahedron and the
// great stellated dodecahedron, whose faces share these planes). Selections
// derived numerically: halfspace tests for the convex solids, parity ray
// tests for the star solids, boundedness for the final stellation.
export const FACE_TO_TYPE_TRUNCICOSA: readonly number[] =
  Array.from({ length: 85 }, (_, i) => i)

export const TRUNCICOSA_PRESETS: Preset[] = [
  { name: 'Truncated icosahedron', wenninger: 'W9', faces: [0, 1] },
  { name: 'Icosahedron (truncation regrown)', faces: [0, 2] },
  { name: 'Dodecahedron', faces: [1, 4, 5] },
  { name: 'Great icosahedron', faces: [49, 52, 53, 55, 65, 74] },
  { name: 'Great stellated dodecahedron',
    faces: [37, 40, 45, 48, 51, 57, 64, 68, 70, 77] },
  { name: 'Final stellation of truncated icosahedron',
    faces: [64, 70, 72, 75, 77, 80, 81, 82, 83, 84] },
]

// ── Truncated dodecahedron ───────────────────────────────────────────────────
// 12 decagons in the dodeca face planes + 20 triangles in the truncation
// planes (icosa-face axes) — 515 diagram cells in 85 types. Its stellations
// reach all four Kepler–Poinsot star polyhedra. Selections derived
// numerically as for the truncated icosahedron.
export const FACE_TO_TYPE_TRUNCDODECA: readonly number[] =
  Array.from({ length: 85 }, (_, i) => i)

// ── Cuboctahedron ────────────────────────────────────────────────────────────
// First solid with octahedral symmetry: 8 triangles in the octahedron's
// planes + 6 squares in the cube's — 54 diagram cells in 13 types. Its first
// stellation is the compound of cube and octahedron (the numeric
// first-shell derivation and the cube∪octa halfspace test agree exactly).
export const FACE_TO_TYPE_CUBOCTA: readonly number[] =
  Array.from({ length: 13 }, (_, i) => i)

export const CUBOCTA_PRESETS: Preset[] = [
  { name: 'Cuboctahedron', wenninger: 'W11', faces: [0, 1] },
  { name: 'Cube (squares regrown)', faces: [0, 2] },
  { name: 'Octahedron (triangles regrown)', faces: [1, 3] },
  { name: 'Compound of cube and octahedron', faces: [2, 3] },
  { name: 'Final stellation of cuboctahedron', faces: [6, 8, 10, 11, 12] },
]

// ── Rhombic dodecahedron ─────────────────────────────────────────────────────
// Dual of the cuboctahedron: 12 rhombic faces (D₂), 17 diagram cells in just
// 6 types. Its first stellation is Escher's solid (the space-filling star of
// "Waterfall", a compound of three flattened octahedra).
export const FACE_TO_TYPE_RHOMBICDODECA: readonly number[] =
  Array.from({ length: 6 }, (_, i) => i)

export const RHOMBICDODECA_PRESETS: Preset[] = [
  { name: 'Rhombic dodecahedron', faces: [0] },
  { name: "Escher's solid (first stellation)", faces: [1] },
  { name: 'Final stellation of rhombic dodecahedron', faces: [2, 4, 5] },
]

export const TRUNCDODECA_PRESETS: Preset[] = [
  { name: 'Truncated dodecahedron', wenninger: 'W10', faces: [0, 1] },
  { name: 'Dodecahedron (truncation regrown)', faces: [0, 2] },
  { name: 'Icosahedron', faces: [1, 4, 5] },
  { name: 'Small stellated dodecahedron', faces: [3, 6, 10, 13, 18, 24] },
  { name: 'Great dodecahedron', faces: [8, 17, 19, 23, 28] },
  { name: 'Great stellated dodecahedron',
    faces: [27, 30, 34, 35, 40, 41, 49, 51, 59, 63, 68, 69, 75] },
  { name: 'Great icosahedron', faces: [52, 54, 56, 58, 65, 77] },
  { name: 'Final stellation of truncated dodecahedron',
    faces: [63, 69, 71, 74, 75, 80, 81, 82, 83, 84] },
]

// Color palettes for cell types
export interface Palette {
  name: string
  // When true, the 3D view colors per face plane (10 hues, antipodal planes
  // paired) like the classic Wikipedia polyhedron SVGs; getColor is still
  // used for the 2D stellation diagram.
  byFace?: boolean
  // When true, the 3D view colors only face plane 0 (the plane the 2D
  // stellation diagram is drawn on) with the diagram's type colors and
  // renders every other facet near-white.
  focus?: boolean
  // When true, every cell uses one user-picked color (state.uniformColor);
  // getColor is a fallback only.
  uniform?: boolean
  // When true, cell type colors come from the depth-gradient with
  // user-adjustable saturation/lightness (state.depthSaturation/Lightness);
  // getColor is a fallback only.
  gradient?: boolean
  getColor: (typeId: number, numTypes: number) => [number, number, number]
}

const depthColor = (typeId: number, numTypes: number): [number, number, number] => {
  const h = typeId / Math.max(numTypes - 1, 1)
  const hue = h * 240
  return hslToRgb(hue/360, 0.7, 0.55)
}

export const COLOR_PALETTES: Palette[] = [
  {
    name: 'By depth',
    gradient: true,
    getColor: depthColor,
  },
  {
    name: 'Focus',
    focus: true,
    gradient: true,
    getColor: depthColor,
  },
  {
    name: 'By face',
    byFace: true,
    gradient: true,
    getColor: depthColor,
  },
  {
    name: 'Uniform',
    uniform: true,
    getColor: (_typeId: number, _n: number): [number, number, number] => [1, 1, 1],
  },
]

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}
