// ============================================================
// Scene 1: Ray March - Fullscreen quad vertex + fragment shader
// ============================================================

export const rayMarchVertexShader = /* wgsl */ `
@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  // Fullscreen triangle (3 vertices cover entire screen)
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
  );
  return vec4f(pos[vi], 0.0, 1.0);
}
`;

export const rayMarchFragmentShader = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  time: f32,
  _pad: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const MAX_STEPS: i32 = 128;
const MAX_DIST: f32 = 80.0;
const SURF_DIST: f32 = 0.001;
const SHADOW_STEPS: i32 = 32;
const AO_STEPS: i32 = 5;
const PI: f32 = 3.14159265;

fn rot2(a: f32) -> mat2x2f {
  let c = cos(a); let s = sin(a);
  return mat2x2f(c, s, -s, c);
}

fn sdSphere(p: vec3f, r: f32) -> f32 {
  return length(p) - r;
}

fn sdTorus(p: vec3f, t: vec2f) -> f32 {
  let q = vec2f(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn opSmoothUnion(d1: f32, d2: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5*(d2-d1)/k, 0.0, 1.0);
  return mix(d2, d1, h) - k*h*(1.0-h);
}

fn sceneSDF(p: vec3f) -> vec2f {
  let t = u.time;

  // Floor
  var d = p.y + 1.5;
  var matId: f32 = 1.0;

  // 8 animated reflective spheres
  for (var i: i32 = 0; i < 8; i++) {
    let fi = f32(i);
    let angle = fi * PI * 0.25 + t * 0.5;
    let r = 3.0 + sin(t * 0.3 + fi) * 0.5;
    let center = vec3f(cos(angle)*r, sin(t*0.7+fi*0.8)*0.8, sin(angle)*r);
    let sd = sdSphere(p - center, 0.5 + sin(fi*1.3)*0.15);
    if (sd < d) {
      d = sd;
      matId = 2.0;
    }
  }

  // Twisted torus
  var tp = p - vec3f(0.0, 0.5, 0.0);
  let twist = rot2(tp.y * 2.0 + t);
  let tpxz = twist * tp.xz;
  tp = vec3f(tpxz.x, tp.y, tpxz.y);
  let torusDist = sdTorus(tp, vec2f(1.8, 0.3));
  if (torusDist < d) {
    d = torusDist;
    matId = 3.0;
  }

  // Repeating pillars
  var pp = p;
  let rep = 6.0;
  let ppx = pp.x - round(pp.x / rep) * rep;
  let ppz = pp.z - round(pp.z / rep) * rep;
  pp = vec3f(ppx, pp.y, ppz);
  let pillarDist = sdBox(pp - vec3f(0.0, 1.5, 0.0), vec3f(0.3, 3.0, 0.3)) - 0.05;
  if (pillarDist < d) {
    d = pillarDist;
    matId = 4.0;
  }

  return vec2f(d, matId);
}

fn calcNormal(p: vec3f) -> vec3f {
  let e = vec2f(0.001, 0.0);
  return normalize(vec3f(
    sceneSDF(p + e.xyy).x - sceneSDF(p - e.xyy).x,
    sceneSDF(p + e.yxy).x - sceneSDF(p - e.yxy).x,
    sceneSDF(p + e.yyx).x - sceneSDF(p - e.yyx).x
  ));
}

fn rayMarch(ro: vec3f, rd: vec3f) -> vec2f {
  var t: f32 = 0.0;
  var matId: f32 = 0.0;
  for (var i: i32 = 0; i < MAX_STEPS; i++) {
    let p = ro + rd * t;
    let hit = sceneSDF(p);
    if (hit.x < SURF_DIST) {
      matId = hit.y;
      break;
    }
    t += hit.x;
    if (t > MAX_DIST) { break; }
  }
  return vec2f(t, matId);
}

fn softShadow(ro: vec3f, rd: vec3f, mint: f32, maxt: f32) -> f32 {
  var res: f32 = 1.0;
  var t = mint;
  for (var i: i32 = 0; i < SHADOW_STEPS; i++) {
    let h = sceneSDF(ro + rd * t).x;
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (t > maxt) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

fn calcAO(p: vec3f, n: vec3f) -> f32 {
  var occ: f32 = 0.0;
  var sca: f32 = 1.0;
  for (var i: i32 = 0; i < AO_STEPS; i++) {
    let h = 0.01 + 0.12 * f32(i);
    let d = sceneSDF(p + n * h).x;
    occ += (h - d) * sca;
    sca *= 0.95;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

fn getMaterial(matId: f32) -> vec3f {
  if (matId < 1.5) { return vec3f(0.4, 0.4, 0.45); } // floor
  if (matId < 2.5) { return vec3f(0.9, 0.3, 0.2); }  // spheres
  if (matId < 3.5) { return vec3f(0.2, 0.7, 0.9); }  // torus
  return vec3f(0.6, 0.6, 0.5);                        // pillars
}

fn acesToneMap(x: vec3f) -> vec3f {
  let a = x * (x * 2.51 + vec3f(0.03));
  let b = x * (x * 2.43 + vec3f(0.59)) + vec3f(0.14);
  return a / b;
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv = (fragCoord.xy - 0.5 * u.resolution) / u.resolution.y;
  let t = u.time;

  // Camera
  let camR = 8.0;
  let ro = vec3f(cos(t*0.3)*camR, 2.0+sin(t*0.5)*1.5, sin(t*0.3)*camR);
  let ta = vec3f(0.0, 0.5, 0.0);
  let ww = normalize(ta - ro);
  let uu = normalize(cross(ww, vec3f(0.0, 1.0, 0.0)));
  let vv = cross(uu, ww);
  let rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  // Light
  let lightPos = vec3f(4.0*cos(t*0.5), 6.0, 4.0*sin(t*0.5));
  let lightCol = vec3f(1.0, 0.95, 0.8) * 2.0;

  var col = vec3f(0.02, 0.02, 0.04); // sky

  let hit = rayMarch(ro, rd);
  let dist = hit.x;
  let matId = hit.y;

  if (dist < MAX_DIST) {
    let p = ro + rd * dist;
    let n = calcNormal(p);
    let baseCol = getMaterial(matId);

    // Lighting
    let ld = normalize(lightPos - p);
    let diff = max(dot(n, ld), 0.0);
    let h = normalize(ld - rd);
    let spec = pow(max(dot(n, h), 0.0), 64.0);

    let shadow = softShadow(p + n*0.01, ld, 0.02, length(lightPos - p));
    let ao = calcAO(p, n);

    col = baseCol * (diff * shadow * lightCol + vec3f(0.05, 0.06, 0.1)) * ao;
    col += spec * shadow * vec3f(0.8) * ao;

    // Reflection for spheres
    if (matId > 1.5 && matId < 2.5) {
      let refDir = reflect(rd, n);
      let refHit = rayMarch(p + n * 0.02, refDir);
      if (refHit.x < MAX_DIST) {
        let rp = p + n * 0.02 + refDir * refHit.x;
        let rn = calcNormal(rp);
        let rMat = getMaterial(refHit.y);
        let rDiff = max(dot(rn, ld), 0.0);
        col = mix(col, rMat * rDiff * lightCol * 0.5, 0.35);
      }
    }

    // Volumetric fog
    let fogAmount = 1.0 - exp(-dist * 0.04);
    let fogColor = vec3f(0.03, 0.04, 0.08);
    col = mix(col, fogColor, fogAmount);
  }

  // Tone mapping
  col = acesToneMap(col);
  col = pow(col, vec3f(1.0/2.2));

  return vec4f(col, 1.0);
}
`;

// ============================================================
// Scene 2: Particle Compute shader
// ============================================================

export const particleComputeShader = /* wgsl */ `
struct Particle {
  pos: vec3f,
  life: f32,
  vel: vec3f,
  _pad: f32,
  color: vec4f,
};

struct SimParams {
  deltaTime: f32,
  time: f32,
  numParticles: u32,
  _pad: u32,
  attractors: array<vec4f, 4>,
};

@group(0) @binding(0) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(1) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(2) var<uniform> params: SimParams;

fn hash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453123);
}

fn noise3d(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n = i.x + i.y * 157.0 + 113.0 * i.z;
  return mix(
    mix(mix(hash(n), hash(n+1.0), u.x),
        mix(hash(n+157.0), hash(n+158.0), u.x), u.y),
    mix(mix(hash(n+113.0), hash(n+114.0), u.x),
        mix(hash(n+270.0), hash(n+271.0), u.x), u.y),
    u.z
  );
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.numParticles) { return; }

  var p = particlesIn[idx];
  let dt = params.deltaTime;

  // Gravitational attractors
  var force = vec3f(0.0);
  for (var i: u32 = 0u; i < 4u; i++) {
    let attr = params.attractors[i];
    let diff = attr.xyz - p.pos;
    let dist = max(length(diff), 0.1);
    force += normalize(diff) * attr.w / (dist * dist);
  }

  // Turbulence noise
  let noiseScale = 2.0;
  let np = p.pos * noiseScale + vec3f(params.time * 0.3);
  let turbulence = vec3f(
    noise3d(np) - 0.5,
    noise3d(np + vec3f(17.0)) - 0.5,
    noise3d(np + vec3f(31.0)) - 0.5
  ) * 4.0;

  force += turbulence;

  // Integrate
  p.vel += force * dt;
  p.vel *= 0.99; // drag
  p.pos += p.vel * dt;

  // Update life
  p.life -= dt * 0.05;

  // Respawn if dead
  if (p.life <= 0.0) {
    let seed = f32(idx) * 0.001 + params.time;
    let angle = hash(seed) * 6.2832;
    let r = hash(seed + 1.0) * 2.0;
    p.pos = vec3f(cos(angle)*r, (hash(seed+2.0)-0.5)*2.0, sin(angle)*r);
    p.vel = vec3f(
      (hash(seed+3.0)-0.5)*0.5,
      hash(seed+4.0)*1.0,
      (hash(seed+5.0)-0.5)*0.5
    );
    p.life = 0.5 + hash(seed+6.0)*0.5;
  }

  // Color based on velocity
  let speed = length(p.vel);
  let t = clamp(speed / 8.0, 0.0, 1.0);
  // Blue -> Cyan -> Yellow -> Red
  var col: vec3f;
  if (t < 0.33) {
    col = mix(vec3f(0.1, 0.2, 1.0), vec3f(0.0, 1.0, 1.0), t/0.33);
  } else if (t < 0.66) {
    col = mix(vec3f(0.0, 1.0, 1.0), vec3f(1.0, 1.0, 0.0), (t-0.33)/0.33);
  } else {
    col = mix(vec3f(1.0, 1.0, 0.0), vec3f(1.0, 0.2, 0.0), (t-0.66)/0.34);
  }
  p.color = vec4f(col, 0.4 * p.life);

  particlesOut[idx] = p;
}
`;

// ============================================================
// Scene 2: Particle Render (billboard quads)
// ============================================================

export const particleVertexShader = /* wgsl */ `
struct Particle {
  pos: vec3f,
  life: f32,
  vel: vec3f,
  _pad: f32,
  color: vec4f,
};

struct Camera {
  viewProj: mat4x4f,
  right: vec3f,
  _pad1: f32,
  up: vec3f,
  _pad2: f32,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> camera: Camera;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  let p = particles[ii];

  // Billboard quad (2 triangles = 6 vertices)
  var quadPos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)
  );
  let qp = quadPos[vi];
  let size = 0.03;
  let worldPos = p.pos + (camera.right * qp.x + camera.up * qp.y) * size;

  var out: VSOut;
  out.pos = camera.viewProj * vec4f(worldPos, 1.0);
  out.color = p.color;
  out.uv = qp * 0.5 + 0.5;
  return out;
}
`;

export const particleFragmentShader = /* wgsl */ `
struct FSIn {
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
};

@fragment
fn fs_main(inp: FSIn) -> @location(0) vec4f {
  let d = length(inp.uv - vec2f(0.5));
  let glow = exp(-d * d * 8.0);
  return vec4f(inp.color.rgb * glow, inp.color.a * glow);
}
`;

// ============================================================
// Scene 3: Geometry Stress - PBR vertex + fragment
// ============================================================

export const geometryVertexShader = /* wgsl */ `
struct Uniforms {
  viewProj: mat4x4f,
  cameraPos: vec3f,
  time: f32,
  numInstances: u32,
  _pad1: u32,
  _pad2: u32,
  _pad3: u32,
};

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) instanceColor: vec3f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

fn hash1(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453123);
}

@vertex
fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @builtin(instance_index) iid: u32
) -> VSOut {
  let fi = f32(iid);
  let t = uniforms.time;

  // Distribute instances in a grid-like pattern with some randomness
  let gridSize = 55u; // ~55x55 = 3025
  let gx = f32(iid % gridSize);
  let gz = f32(iid / gridSize);
  let spacing = 2.5;
  let offsetX = (gx - f32(gridSize)/2.0) * spacing + hash1(fi*1.1) * 0.5;
  let offsetZ = (gz - f32(gridSize)/2.0) * spacing + hash1(fi*2.2) * 0.5;
  let bounceY = sin(t * 2.0 + fi * 0.1) * 0.3 + 0.5;

  let worldP = position + vec3f(offsetX, bounceY, offsetZ);

  var out: VSOut;
  out.pos = uniforms.viewProj * vec4f(worldP, 1.0);
  out.worldPos = worldP;
  out.normal = normal;

  // Varied colors per instance
  out.instanceColor = vec3f(
    0.3 + hash1(fi*3.3) * 0.7,
    0.3 + hash1(fi*5.5) * 0.7,
    0.3 + hash1(fi*7.7) * 0.7
  );

  return out;
}
`;

export const geometryFragmentShader = /* wgsl */ `
struct Uniforms {
  viewProj: mat4x4f,
  cameraPos: vec3f,
  time: f32,
  numInstances: u32,
  _pad1: u32,
  _pad2: u32,
  _pad3: u32,
};

struct Light {
  position: vec3f,
  _pad: f32,
  color: vec3f,
  intensity: f32,
};

struct Lights {
  lights: array<Light, 12>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> lights: Lights;

const PI: f32 = 3.14159265;

// Fresnel-Schlick
fn fresnelSchlick(cosTheta: f32, F0: vec3f) -> vec3f {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// GGX Normal Distribution
fn distributionGGX(N: vec3f, H: vec3f, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let denom = NdotH2 * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom);
}

// Smith's geometry function
fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r*r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

fn geometrySmith(N: vec3f, V: vec3f, L: vec3f, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

@fragment
fn fs_main(
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) instanceColor: vec3f
) -> @location(0) vec4f {
  let N = normalize(normal);
  let V = normalize(uniforms.cameraPos - worldPos);

  let albedo = instanceColor;
  let metallic: f32 = 0.3;
  let roughness: f32 = 0.4;
  let F0 = mix(vec3f(0.04), albedo, metallic);

  var Lo = vec3f(0.0);

  // 12 dynamic point lights
  for (var i: u32 = 0u; i < 12u; i++) {
    let light = lights.lights[i];
    let L = normalize(light.position - worldPos);
    let H = normalize(V + L);
    let distance = length(light.position - worldPos);
    let attenuation = 1.0 / (distance * distance + 1.0);
    let radiance = light.color * light.intensity * attenuation;

    let NDF = distributionGGX(N, H, roughness);
    let G = geometrySmith(N, V, L, roughness);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    let numerator = NDF * G * F;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    let specular = numerator / denominator;

    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - metallic);
    let NdotL = max(dot(N, L), 0.0);

    Lo += (kD * albedo / PI + specular) * radiance * NdotL;
  }

  let ambient = vec3f(0.03) * albedo;
  var color = ambient + Lo;

  // ACES tone mapping
  let a = color * (color * 2.51 + vec3f(0.03));
  let b = color * (color * 2.43 + vec3f(0.59)) + vec3f(0.14);
  color = a / b;

  // Gamma
  color = pow(color, vec3f(1.0/2.2));

  return vec4f(color, 1.0);
}
`;
