// GLSL shader sources for each shading mode

// Vertex shaders use highp: on mobile GPUs mediump is fp16, which makes the
// transformed depths jitter and the faces z-fight/flicker (worse zoomed out).

// ---- Clipping (sphere crop + view-aligned cross section) ----
// Every pass discards fragments outside the crop sphere (model-space radius²
// in u_clipR2) or nearer to the camera than the cross-section plane
// (view-space z in u_clipZ). Large values = no clipping.
// highp so the clip tests stay stable on the cut plane: a mediump v_mpos
// jitters right at the half-space boundary (sandstorm on the cut surface).
const CLIP_VARYINGS = `
varying highp vec3 v_mpos;
varying highp float v_vz;
`
const CLIP_VERT_ASSIGN = `
  v_mpos = a_pos;
  v_vz = (u_mv * vec4(a_pos, 1.0)).z;
`
const CLIP_FRAG_DECL = `
${CLIP_VARYINGS}
uniform float u_clipR2;
uniform float u_clipZ;
`
const CLIP_TEST = `
  if (dot(v_mpos, v_mpos) > u_clipR2) discard;
  if (v_vz > u_clipZ) discard;
`

// ---- Flat + Lambert shading ----
export const FLAT_VERT = `
precision highp float;
attribute vec3 a_pos;
attribute vec3 a_normal;
attribute vec3 a_color;
uniform mat4 u_mvp;
uniform mat4 u_mv;
varying vec3 v_normal;
varying vec3 v_color;
${CLIP_VARYINGS}
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_normal = normalize(mat3(u_mv) * a_normal);
  v_color = a_color;
${CLIP_VERT_ASSIGN}
}
`

export const FLAT_FRAG = `
precision mediump float;
varying vec3 v_normal;
varying vec3 v_color;
uniform vec3 u_lightDir;
uniform float u_alpha;
${CLIP_FRAG_DECL}
void main() {
${CLIP_TEST}
  vec3 n = normalize(v_normal);
  if (!gl_FrontFacing) n = -n; // shade the visible side of each facet
  float diff = max(dot(n, normalize(u_lightDir)), 0.0);
  float ambient = 0.25;
  gl_FragColor = vec4(v_color * (ambient + (1.0 - ambient) * diff), u_alpha);
}
`

// ---- Two-sided Lambert (strong ambient) ----
// Reuses FLAT_VERT. The normal is flipped for back-facing fragments so the
// visible side of each facet is shaded by its own orientation toward the
// light — interior faces of concave stellations stay readable without the
// odd dark band an abs() would produce. Used by the Focus color mode.
export const LIT_FRAG = `
precision mediump float;
varying vec3 v_normal;
varying vec3 v_color;
uniform vec3 u_lightDir;
uniform float u_alpha;
${CLIP_FRAG_DECL}
void main() {
${CLIP_TEST}
  vec3 n = normalize(v_normal);
  if (!gl_FrontFacing) n = -n;
  float diff = max(dot(n, normalize(u_lightDir)), 0.0);
  gl_FragColor = vec4(v_color * (0.45 + 0.55 * diff), u_alpha);
}
`

// ---- Position-only passes: facet outlines (GL lines) and solid fills ----
export const LINE_VERT = `
precision highp float;
attribute vec3 a_pos;
uniform mat4 u_mvp;
uniform mat4 u_mv;
${CLIP_VARYINGS}
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
${CLIP_VERT_ASSIGN}
}
`

export const SOLID_FRAG = `
precision mediump float;
uniform vec4 u_color;
${CLIP_FRAG_DECL}
void main() {
${CLIP_TEST}
  gl_FragColor = u_color;
}
`

// ---- Normal vector coloring (MathWorld / classic Mathematica style) ----
// White surface lit by three colored directional lights (red, green, blue)
// in view space — the lighting model behind the classic MathWorld
// polyhedron renders (front faces pale periwinkle, left purple, right
// orange, top-right mint, bottom maroon). Facet normals are constant per
// polygon, so the result is flat-shaded.
export const NORMAL_VERT = `
precision highp float;
attribute vec3 a_pos;
attribute vec3 a_normal;
uniform mat4 u_mvp;
uniform mat4 u_mv;
varying vec3 v_normal;
${CLIP_VARYINGS}
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_normal = normalize(mat3(u_mv) * a_normal);
${CLIP_VERT_ASSIGN}
}
`

// Saturation/lightness post-adjust shared by the normal-based shaders.
// u_sl = (0.5, 0.5) is neutral: S mixes toward gray, L scales toward
// black (< 0.5) or white (> 0.5).
const SL_ADJUST = `
uniform vec2 u_sl;
vec3 adjustSL(vec3 c) {
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(luma), c, u_sl.x * 2.0);
  float l = u_sl.y * 2.0;
  return l <= 1.0 ? c * l : mix(c, vec3(1.0), l - 1.0);
}
`

export const MATHWORLD_FRAG = `
precision mediump float;
varying vec3 v_normal;
uniform float u_alpha;
${SL_ADJUST}
${CLIP_FRAG_DECL}
void main() {
${CLIP_TEST}
  vec3 n = normalize(v_normal);
  if (!gl_FrontFacing) n = -n; // two-sided: interior faces colored by their visible side
  float r = max(dot(n, normalize(vec3(1.0, 0.0, 1.0))), 0.0);
  float g = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
  float b = max(dot(n, normalize(vec3(0.0, 1.0, 1.0))), 0.0);
  vec3 c = vec3(r, g, b);
  // Baseline of the reference renders: slightly desaturated and lightened
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 0.85);
  c = mix(c, vec3(1.0), 0.12);
  gl_FragColor = vec4(adjustSL(c), u_alpha);
}
`

// ---- Shared vertex shader for the view-dependent (experimental) shaders ----
// Like FLAT_VERT but also passes the view-space position for Fresnel terms.
export const FANCY_VERT = `
precision highp float;
attribute vec3 a_pos;
attribute vec3 a_normal;
attribute vec3 a_color;
uniform mat4 u_mvp;
uniform mat4 u_mv;
varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_vpos;
${CLIP_VARYINGS}
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_normal = normalize(mat3(u_mv) * a_normal);
  v_color = a_color;
  v_vpos = (u_mv * vec4(a_pos, 1.0)).xyz;
${CLIP_VERT_ASSIGN}
}
`

// ---- Iridescent (thin-film) ----
// Hue cycles with the view angle (Fresnel) plus the normal orientation, like
// a soap film: facets shift color as the solid rotates. S/L adjust applies.
export const IRIDESCENT_FRAG = `
precision mediump float;
varying vec3 v_normal;
varying vec3 v_vpos;
uniform float u_alpha;
${SL_ADJUST}
${CLIP_FRAG_DECL}
vec3 hue2rgb(float h) {
  return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}
void main() {
${CLIP_TEST}
  vec3 n = normalize(v_normal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-v_vpos);
  float fr = 1.0 - max(dot(n, v), 0.0);
  // Film hue: view-angle phase plus a slow drift with the normal direction
  float h = fr * 1.6 + n.x * 0.12 + n.y * 0.2;
  vec3 c = mix(vec3(0.5), hue2rgb(fract(h)), 0.8);
  float light = 0.5 + 0.5 * max(dot(n, normalize(vec3(0.5, 0.8, 1.0))), 0.0);
  c *= light;
  c += pow(fr, 3.0) * 0.3;  // rim sheen
  gl_FragColor = vec4(adjustSL(c), u_alpha);
}
`

// ---- Toon (cel shading) ----
// Palette colors with the Lambert term quantized into bands, plus darkened
// grazing facets for a paper-craft silhouette feel.
export const TOON_FRAG = `
precision mediump float;
varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_vpos;
uniform vec3 u_lightDir;
uniform float u_alpha;
${CLIP_FRAG_DECL}
void main() {
${CLIP_TEST}
  vec3 n = normalize(v_normal);
  if (!gl_FrontFacing) n = -n;
  float diff = max(dot(n, normalize(u_lightDir)), 0.0);
  float band = diff > 0.7 ? 1.0 : diff > 0.4 ? 0.74 : diff > 0.12 ? 0.5 : 0.34;
  float fr = 1.0 - max(dot(n, normalize(-v_vpos)), 0.0);
  vec3 c = v_color * band * mix(1.0, 0.45, smoothstep(0.78, 0.95, fr));
  gl_FragColor = vec4(c, u_alpha);
}
`

// ---- Metal (matcap-style fake environment) ----
// The reflected view ray samples a procedural environment (sky/ground
// gradient plus two highlight lobes); the palette color tints the metal —
// the Uniform palette with a warm color gives the classic golden model look.
export const METAL_FRAG = `
precision mediump float;
varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_vpos;
uniform float u_alpha;
${CLIP_FRAG_DECL}
void main() {
${CLIP_TEST}
  vec3 n = normalize(v_normal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-v_vpos);
  vec3 r = reflect(-v, n);
  vec3 env = mix(vec3(0.20, 0.17, 0.15), vec3(1.05), smoothstep(-0.4, 0.9, r.y));
  env += pow(max(dot(r, normalize(vec3(0.7, 0.6, 0.4))), 0.0), 24.0) * 0.7;
  env += pow(max(dot(r, normalize(vec3(-0.6, 0.2, 0.7))), 0.0), 10.0) * 0.3;
  float fr = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  vec3 c = v_color * env + fr * 0.15;
  gl_FragColor = vec4(c, u_alpha);
}
`

// ---- Fresnel glass ----
// A translucent crystal look: the palette color shows faintly across the
// face but the grazing edges glow brightly (Fresnel). Alpha rises with the
// rim too, so the silhouette and inner edges read while flat areas stay
// glassy. Writes its own alpha, so it works without the opacity slider.
export const GLASS_FRAG = `
precision mediump float;
varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_vpos;
uniform vec3 u_lightDir;
uniform float u_alpha;
${CLIP_FRAG_DECL}
void main() {
${CLIP_TEST}
  vec3 n = normalize(v_normal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-v_vpos);
  float fr = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  float spec = pow(max(dot(n, normalize(u_lightDir + v)), 0.0), 40.0);
  vec3 c = v_color * 0.35 + fr * (vec3(1.0) - v_color * 0.3) + spec * 0.8;
  float a = clamp((0.18 + 0.82 * fr + spec) * u_alpha, 0.0, 1.0);
  gl_FragColor = vec4(c, a);
}
`

// Plain normal-to-RGB mapping (MeshNormalMaterial look): N * 0.5 + 0.5
export const NORMAL_FRAG = `
precision mediump float;
varying vec3 v_normal;
uniform float u_alpha;
${SL_ADJUST}
${CLIP_FRAG_DECL}
void main() {
${CLIP_TEST}
  vec3 n = normalize(v_normal);
  if (!gl_FrontFacing) n = -n; // two-sided: interior faces colored by their visible side
  gl_FragColor = vec4(adjustSL(n * 0.5 + 0.5), u_alpha);
}
`
