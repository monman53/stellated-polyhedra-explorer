export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

// Vec3 ops
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]]
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]]
export const scale3 = (v: Vec3, s: number): Vec3 => [v[0]*s, v[1]*s, v[2]*s]
export const dot3 = (a: Vec3, b: Vec3): number => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
export const len3 = (v: Vec3): number => Math.sqrt(dot3(v, v))
export const norm3 = (v: Vec3): Vec3 => scale3(v, 1 / len3(v))
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0],
]
export const neg3 = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]]
export const centroid3 = (pts: Vec3[]): Vec3 => {
  const s: Vec3 = [0,0,0]
  for (const p of pts) { s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2] }
  return scale3(s, 1/pts.length)
}

// Vec2 ops
export const add2 = (a: Vec2, b: Vec2): Vec2 => [a[0]+b[0], a[1]+b[1]]
export const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0]-b[0], a[1]-b[1]]
export const scale2 = (v: Vec2, s: number): Vec2 => [v[0]*s, v[1]*s]
export const dot2 = (a: Vec2, b: Vec2): number => a[0]*b[0] + a[1]*b[1]
export const len2 = (v: Vec2): number => Math.sqrt(dot2(v, v))
export const norm2 = (v: Vec2): Vec2 => scale2(v, 1 / len2(v))
export const rot2 = (v: Vec2, angle: number): Vec2 => {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [v[0]*c - v[1]*s, v[0]*s + v[1]*c]
}

// 4x4 column-major matrix (for WebGL)
export type Mat4 = Float32Array

export function mat4Identity(): Mat4 {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
}

export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16)
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[i + k*4] * b[k + j*4]
      out[i + j*4] = sum
    }
  return out
}

export function mat4Perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  return new Float32Array([
    f/aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far+near)*nf, -1,
    0, 0, 2*far*near*nf, 0,
  ])
}

// Symmetric orthographic projection (column-major, like mat4Perspective)
export function mat4Ortho(halfW: number, halfH: number, near: number, far: number): Mat4 {
  const nf = 1 / (near - far)
  return new Float32Array([
    1/halfW, 0, 0, 0,
    0, 1/halfH, 0, 0,
    0, 0, 2*nf, 0,
    0, 0, (far+near)*nf, 1,
  ])
}

export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const f = norm3(sub3(center, eye))
  const s = norm3(cross3(f, up))
  const u = cross3(s, f)
  return new Float32Array([
    s[0], u[0], -f[0], 0,
    s[1], u[1], -f[1], 0,
    s[2], u[2], -f[2], 0,
    -dot3(s,eye), -dot3(u,eye), dot3(f,eye), 1,
  ])
}

export function mat4RotX(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a)
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1])
}

export function mat4RotY(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a)
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1])
}

export function mat4Transpose(m: Mat4): Mat4 {
  return new Float32Array([
    m[0],m[4],m[8],m[12],
    m[1],m[5],m[9],m[13],
    m[2],m[6],m[10],m[14],
    m[3],m[7],m[11],m[15],
  ])
}

export function mat4NormalMatrix(m: Mat4): Mat4 {
  // Upper-left 3x3 inverse transpose (for uniform-scale models, just extract upper-left)
  return m
}
