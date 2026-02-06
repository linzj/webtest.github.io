// ============================================================
// WebGPU GPU Benchmark - Main Entry
// ============================================================

import {
  rayMarchVertexShader,
  rayMarchFragmentShader,
  particleComputeShader,
  particleVertexShader,
  particleFragmentShader,
  geometryVertexShader,
  geometryFragmentShader,
} from "./shaders.js";

import {
  BenchmarkManager,
  FrameTimeGraph,
  GPUTimestampHelper,
} from "./benchmark.js";

// ============================================================
// Math utilities
// ============================================================

function mat4Perspective(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

function mat4LookAt(eye, target, up) {
  const zx = eye[0] - target[0],
    zy = eye[1] - target[1],
    zz = eye[2] - target[2];
  let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
  const fz = [zx / len, zy / len, zz / len];

  const sx = up[1] * fz[2] - up[2] * fz[1];
  const sy = up[2] * fz[0] - up[0] * fz[2];
  const sz = up[0] * fz[1] - up[1] * fz[0];
  len = Math.sqrt(sx * sx + sy * sy + sz * sz);
  const fs = [sx / len, sy / len, sz / len];

  const ux = fz[1] * fs[2] - fz[2] * fs[1];
  const uy = fz[2] * fs[0] - fz[0] * fs[2];
  const uz = fz[0] * fs[1] - fz[1] * fs[0];

  return new Float32Array([
    fs[0],
    ux,
    fz[0],
    0,
    fs[1],
    uy,
    fz[1],
    0,
    fs[2],
    uz,
    fz[2],
    0,
    -(fs[0] * eye[0] + fs[1] * eye[1] + fs[2] * eye[2]),
    -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
    -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]),
    1,
  ]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[i] * b[j * 4] +
        a[4 + i] * b[j * 4 + 1] +
        a[8 + i] * b[j * 4 + 2] +
        a[12 + i] * b[j * 4 + 3];
    }
  }
  return out;
}

// ============================================================
// Icosphere generation
// ============================================================

function createIcosphere(subdivisions) {
  const t = (1 + Math.sqrt(5)) / 2;

  let vertices = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];

  // Normalize to unit sphere
  vertices = vertices.map((v) => {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  });

  let faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const midpointCache = {};
  function getMidpoint(i1, i2) {
    const key = Math.min(i1, i2) + "_" + Math.max(i1, i2);
    if (midpointCache[key] !== undefined) return midpointCache[key];
    const v1 = vertices[i1],
      v2 = vertices[i2];
    const mid = [(v1[0] + v2[0]) / 2, (v1[1] + v2[1]) / 2, (v1[2] + v2[2]) / 2];
    const len = Math.sqrt(mid[0] * mid[0] + mid[1] * mid[1] + mid[2] * mid[2]);
    mid[0] /= len;
    mid[1] /= len;
    mid[2] /= len;
    const idx = vertices.length;
    vertices.push(mid);
    midpointCache[key] = idx;
    return idx;
  }

  for (let s = 0; s < subdivisions; s++) {
    const newFaces = [];
    for (const [a, b, c] of faces) {
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      newFaces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = newFaces;
  }

  // Flatten to typed arrays
  const posData = new Float32Array(faces.length * 3 * 3);
  const normData = new Float32Array(faces.length * 3 * 3);
  let vi = 0;
  for (const [a, b, c] of faces) {
    for (const idx of [a, b, c]) {
      const v = vertices[idx];
      posData[vi] = v[0];
      normData[vi++] = v[0];
      posData[vi] = v[1];
      normData[vi++] = v[1];
      posData[vi] = v[2];
      normData[vi++] = v[2];
    }
  }

  return {
    positions: posData,
    normals: normData,
    vertexCount: faces.length * 3,
  };
}

// ============================================================
// DOM refs
// ============================================================

const canvas = document.getElementById("gpuCanvas");
const graphCanvas = document.getElementById("graphCanvas");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const errorScreen = document.getElementById("errorScreen");
const errorMsg = document.getElementById("errorMsg");
const scoreScreen = document.getElementById("scoreScreen");
const restartBtn = document.getElementById("restartBtn");
const overlay = document.getElementById("overlay");

// Overlay elements
const elGpuName = document.getElementById("gpuName");
const elResolution = document.getElementById("resolution");
const elFps = document.getElementById("fps");
const elFrameTime = document.getElementById("frameTime");
const elFpsMin = document.getElementById("fpsMin");
const elFpsMax = document.getElementById("fpsMax");
const elFpsAvg = document.getElementById("fpsAvg");
const elGpuTime = document.getElementById("gpuTime");
const elPrimitives = document.getElementById("primitives");
const elSceneName = document.getElementById("sceneName");
const elScenePercent = document.getElementById("scenePercent");
const elProgressBar = document.getElementById("progressBar");
const elFinalScore = document.getElementById("finalScore");
const elScore1 = document.getElementById("score1");
const elScore2 = document.getElementById("score2");
const elScore3 = document.getElementById("score3");

// ============================================================
// WebGPU Init
// ============================================================

let device, context, canvasFormat, gpuTimer;
let benchmarkManager, frameTimeGraph;
let scenes = [];
let lastTime = 0;
let animFrameId = null;

async function initWebGPU() {
  if (!navigator.gpu) {
    showError(
      "WebGPU is not supported in this browser. Please use Chrome 113+ or Edge 113+.",
    );
    return false;
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    showError("Failed to get WebGPU adapter. Your GPU may not support WebGPU.");
    return false;
  }

  // Detect GPU name
  let gpuName = "Unknown GPU";
  try {
    if (adapter.info) {
      const info = adapter.info;
      gpuName = info.description || info.device || info.architecture || gpuName;
    } else if (adapter.requestAdapterInfo) {
      const info = await adapter.requestAdapterInfo();
      gpuName = info.description || info.device || gpuName;
    }
  } catch (e) {
    /* ignore */
  }
  elGpuName.textContent = gpuName;

  // Request features
  const requiredFeatures = [];
  if (adapter.features.has("timestamp-query")) {
    requiredFeatures.push("timestamp-query");
  }

  const requiredLimits = {};
  const adapterLimit = adapter.limits.maxStorageBufferBindingSize;
  // Request up to 256MB or whatever the adapter supports
  requiredLimits.maxStorageBufferBindingSize = Math.min(
    adapterLimit,
    256 * 1024 * 1024,
  );

  device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits,
  });

  device.lost.then((info) => {
    console.error("WebGPU device lost:", info.message);
    if (info.reason !== "destroyed") {
      showError("GPU device lost: " + info.message);
    }
  });

  // Canvas setup
  context = canvas.getContext("webgpu");
  canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  resizeCanvas();

  gpuTimer = new GPUTimestampHelper(device);
  benchmarkManager = new BenchmarkManager();
  frameTimeGraph = new FrameTimeGraph(graphCanvas);

  return true;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  elResolution.textContent = `${canvas.width}x${canvas.height}`;

  context.configure({
    device,
    format: canvasFormat,
    alphaMode: "opaque",
  });
}

function showError(msg) {
  startScreen.classList.add("hidden");
  errorScreen.classList.remove("hidden");
  errorMsg.textContent = msg;
}

// ============================================================
// Scene 1: Ray March
// ============================================================

function createRayMarchScene() {
  const uniformData = new Float32Array(4); // resolution.xy, time, pad
  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({
    code: rayMarchVertexShader + "\n" + rayMarchFragmentShader,
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vs_main" },
    fragment: {
      module: shaderModule,
      entryPoint: "fs_main",
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: "triangle-list" },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  return {
    name: "Ray March",
    primitiveCount: "1 quad (fullscreen)",
    update(time) {
      uniformData[0] = canvas.width;
      uniformData[1] = canvas.height;
      uniformData[2] = time;
      uniformData[3] = 0;
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    },
    render(encoder, textureView) {
      const tsWrites = gpuTimer.beginPass();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        ...tsWrites,
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    },
  };
}

// ============================================================
// Scene 2: Particle Compute + Render
// ============================================================

function createParticleScene() {
  const NUM_PARTICLES = 1_000_000;
  const PARTICLE_STRIDE = 48; // 3f pos + 1f life + 3f vel + 1f pad + 4f color = 12 floats = 48 bytes
  const bufferSize = NUM_PARTICLES * PARTICLE_STRIDE;

  // Initialize particles
  const initData = new Float32Array(NUM_PARTICLES * 12);
  for (let i = 0; i < NUM_PARTICLES; i++) {
    const base = i * 12;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 4;
    initData[base + 0] = Math.cos(angle) * r; // pos.x
    initData[base + 1] = (Math.random() - 0.5) * 4; // pos.y
    initData[base + 2] = Math.sin(angle) * r; // pos.z
    initData[base + 3] = Math.random(); // life
    initData[base + 4] = (Math.random() - 0.5) * 0.5; // vel.x
    initData[base + 5] = Math.random() * 1.0; // vel.y
    initData[base + 6] = (Math.random() - 0.5) * 0.5; // vel.z
    initData[base + 7] = 0; // pad
    initData[base + 8] = 0.2; // color r
    initData[base + 9] = 0.5; // color g
    initData[base + 10] = 1.0; // color b
    initData[base + 11] = 0.5; // color a
  }

  // Ping-pong storage buffers
  const particleBuffers = [
    device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  ];
  device.queue.writeBuffer(particleBuffers[0], 0, initData);
  device.queue.writeBuffer(particleBuffers[1], 0, initData);

  // Sim params: deltaTime, time, numParticles, pad, 4x attractors (vec4f)
  const simParamSize = 16 + 4 * 16; // 80 bytes
  const simParamBuffer = device.createBuffer({
    size: simParamSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Camera uniform: mat4 viewProj + vec3 right + pad + vec3 up + pad = 64 + 16 + 16 = 96
  const cameraBuffer = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Compute pipeline
  const computeModule = device.createShaderModule({
    code: particleComputeShader,
  });
  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "main" },
  });

  // Compute bind groups (ping-pong)
  const computeBindGroups = [
    device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffers[0] } },
        { binding: 1, resource: { buffer: particleBuffers[1] } },
        { binding: 2, resource: { buffer: simParamBuffer } },
      ],
    }),
    device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffers[1] } },
        { binding: 1, resource: { buffer: particleBuffers[0] } },
        { binding: 2, resource: { buffer: simParamBuffer } },
      ],
    }),
  ];

  // Render pipeline
  const renderModule = device.createShaderModule({
    code: particleVertexShader + "\n" + particleFragmentShader,
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vs_main" },
    fragment: {
      module: renderModule,
      entryPoint: "fs_main",
      targets: [
        {
          format: canvasFormat,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  // Render bind groups (read from output of compute)
  const renderBindGroups = [
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffers[1] } }, // compute wrote to [1]
        { binding: 1, resource: { buffer: cameraBuffer } },
      ],
    }),
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffers[0] } }, // compute wrote to [0]
        { binding: 1, resource: { buffer: cameraBuffer } },
      ],
    }),
  ];

  let pingPong = 0;
  const simParamData = new Float32Array(simParamSize / 4);

  return {
    name: "Particle Compute",
    primitiveCount: "1M particles",
    update(time, dt) {
      // Sim params
      simParamData[0] = Math.min(dt, 0.05); // deltaTime capped
      simParamData[1] = time;
      simParamData[2] = NUM_PARTICLES; // u32 as float bits
      simParamData[3] = 0;

      // 4 animated attractors
      for (let i = 0; i < 4; i++) {
        const angle = time * (0.3 + i * 0.2) + i * Math.PI * 0.5;
        const r = 2.0 + Math.sin(time * 0.5 + i) * 1.0;
        const base = 4 + i * 4;
        simParamData[base + 0] = Math.cos(angle) * r;
        simParamData[base + 1] = Math.sin(time * 0.7 + i * 1.5) * 1.5;
        simParamData[base + 2] = Math.sin(angle) * r;
        simParamData[base + 3] = 15.0 + Math.sin(time + i) * 5.0; // strength
      }

      // Fix: write numParticles as u32
      const u32View = new Uint32Array(simParamData.buffer);
      u32View[2] = NUM_PARTICLES;

      device.queue.writeBuffer(simParamBuffer, 0, simParamData);

      // Camera
      const camR = 6.0;
      const eye = [
        Math.cos(time * 0.3) * camR,
        2.0 + Math.sin(time * 0.5) * 1.5,
        Math.sin(time * 0.3) * camR,
      ];
      const target = [0, 0, 0];
      const up = [0, 1, 0];

      const view = mat4LookAt(eye, target, up);
      const aspect = canvas.width / canvas.height;
      const proj = mat4Perspective(Math.PI / 3, aspect, 0.1, 100);
      const viewProj = mat4Multiply(proj, view);

      // Extract right and up from view matrix
      const camData = new Float32Array(24);
      camData.set(viewProj, 0);
      // right = first row of view matrix
      camData[16] = view[0];
      camData[17] = view[4];
      camData[18] = view[8];
      camData[19] = 0;
      // up = second row of view matrix
      camData[20] = view[1];
      camData[21] = view[5];
      camData[22] = view[9];
      camData[23] = 0;

      device.queue.writeBuffer(cameraBuffer, 0, camData);
    },
    render(encoder, textureView) {
      // Compute pass
      const computePass = encoder.beginComputePass();
      computePass.setPipeline(computePipeline);
      computePass.setBindGroup(0, computeBindGroups[pingPong]);
      computePass.dispatchWorkgroups(Math.ceil(NUM_PARTICLES / 256));
      computePass.end();

      // Render pass
      const tsWrites = gpuTimer.beginPass();
      const renderPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0.02, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        ...tsWrites,
      });
      renderPass.setPipeline(renderPipeline);
      renderPass.setBindGroup(0, renderBindGroups[pingPong]);
      renderPass.draw(6, NUM_PARTICLES, 0, 0);
      renderPass.end();

      pingPong = 1 - pingPong;
    },
  };
}

// ============================================================
// Scene 3: Geometry Stress (Instanced PBR Icospheres)
// ============================================================

function createGeometryScene() {
  const NUM_INSTANCES = 3000;
  const NUM_LIGHTS = 12;

  // Generate icosphere mesh
  const mesh = createIcosphere(4);

  // Vertex buffers
  const posBuffer = device.createBuffer({
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(posBuffer, 0, mesh.positions);

  const normBuffer = device.createBuffer({
    size: mesh.normals.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(normBuffer, 0, mesh.normals);

  // Uniform buffer: mat4 viewProj(64) + vec3 cameraPos(12) + f32 time(4) + u32 numInstances(4) + vec3 pad(12) = 96
  const uniformBuffer = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Lights buffer: 12 lights x (vec3 pos + pad + vec3 color + f32 intensity) = 12 * 32 = 384
  const lightsBuffer = device.createBuffer({
    size: NUM_LIGHTS * 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Depth texture
  let depthTexture = createDepthTexture();

  function createDepthTexture() {
    return device.createTexture({
      size: [canvas.width, canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  // Shader + Pipeline
  const vertModule = device.createShaderModule({ code: geometryVertexShader });
  const fragModule = device.createShaderModule({
    code: geometryFragmentShader,
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: vertModule,
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
        },
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }],
        },
      ],
    },
    fragment: {
      module: fragModule,
      entryPoint: "fs_main",
      targets: [{ format: canvasFormat }],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "back",
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: lightsBuffer } },
    ],
  });

  const triCount = (mesh.vertexCount / 3) * NUM_INSTANCES;

  return {
    name: "Geometry Stress",
    primitiveCount: (triCount / 1e6).toFixed(1) + "M tris",
    _depthTexture: depthTexture,
    resize() {
      if (this._depthTexture) this._depthTexture.destroy();
      this._depthTexture = createDepthTexture();
      depthTexture = this._depthTexture;
    },
    update(time) {
      // Camera
      const camR = 40.0;
      const eye = [
        Math.cos(time * 0.2) * camR,
        15.0 + Math.sin(time * 0.3) * 8.0,
        Math.sin(time * 0.2) * camR,
      ];
      const target = [0, 0, 0];
      const up = [0, 1, 0];

      const view = mat4LookAt(eye, target, up);
      const aspect = canvas.width / canvas.height;
      const proj = mat4Perspective(Math.PI / 3, aspect, 0.1, 200);
      const viewProj = mat4Multiply(proj, view);

      const uniformData = new Float32Array(24);
      uniformData.set(viewProj, 0);
      uniformData[16] = eye[0];
      uniformData[17] = eye[1];
      uniformData[18] = eye[2];
      uniformData[19] = time;

      const u32 = new Uint32Array(uniformData.buffer);
      u32[20] = NUM_INSTANCES;

      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      // Lights
      const lightsData = new Float32Array(NUM_LIGHTS * 8);
      for (let i = 0; i < NUM_LIGHTS; i++) {
        const base = i * 8;
        const angle = time * (0.3 + i * 0.1) + (i * Math.PI * 2) / NUM_LIGHTS;
        const lr = 20.0 + i * 5.0;

        if (i < 8) {
          // Orbiting lights
          lightsData[base + 0] = Math.cos(angle) * lr;
          lightsData[base + 1] = 5.0 + Math.sin(time * 0.5 + i) * 3.0;
          lightsData[base + 2] = Math.sin(angle) * lr;
        } else {
          // Static lights
          lightsData[base + 0] = Math.cos(i * 1.5) * 30.0;
          lightsData[base + 1] = 10.0 + i * 2.0;
          lightsData[base + 2] = Math.sin(i * 1.5) * 30.0;
        }
        lightsData[base + 3] = 0; // pad

        // Varied colors
        const hue = (i / NUM_LIGHTS) * 6.28;
        lightsData[base + 4] = 0.5 + 0.5 * Math.cos(hue);
        lightsData[base + 5] = 0.5 + 0.5 * Math.cos(hue + 2.09);
        lightsData[base + 6] = 0.5 + 0.5 * Math.cos(hue + 4.19);
        lightsData[base + 7] = 50.0 + Math.sin(time + i) * 20.0; // intensity
      }
      device.queue.writeBuffer(lightsBuffer, 0, lightsData);
    },
    render(encoder, textureView) {
      const tsWrites = gpuTimer.beginPass();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.01, g: 0.01, b: 0.02, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
        ...tsWrites,
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, posBuffer);
      pass.setVertexBuffer(1, normBuffer);
      pass.draw(mesh.vertexCount, NUM_INSTANCES, 0, 0);
      pass.end();
    },
  };
}

// ============================================================
// Render Loop
// ============================================================

function renderLoop(timestamp) {
  animFrameId = requestAnimationFrame(renderLoop);

  const time = timestamp / 1000;
  const dt = lastTime > 0 ? time - lastTime : 0.016;
  lastTime = time;

  // Update benchmark
  const finished = benchmarkManager.update(time, dt);

  if (finished) {
    showScoreScreen();
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
    return;
  }

  const sceneIdx = benchmarkManager.currentScene;
  const scene = scenes[sceneIdx];
  if (!scene) return;

  // Update scene
  scene.update(time, dt);

  // Render
  const encoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();
  scene.render(encoder, textureView);

  // GPU timestamp
  gpuTimer.resolve(encoder);
  device.queue.submit([encoder.finish()]);

  // Async GPU time read
  gpuTimer.readTimestamp().then(() => {
    if (gpuTimer.lastGPUTimeMs >= 0) {
      benchmarkManager.addGPUTime(gpuTimer.lastGPUTimeMs);
    }
  });

  // Update frame time graph
  frameTimeGraph.push(dt * 1000);
  frameTimeGraph.draw();

  // Update overlay
  updateOverlay(time);
}

function updateOverlay(time) {
  const bm = benchmarkManager;

  elFps.textContent = Math.round(bm.currentFPS);
  elFrameTime.textContent = bm.currentFrameTime.toFixed(2) + " ms";

  if (bm.sceneMinFPS < Infinity) {
    elFpsMin.textContent = Math.round(bm.sceneMinFPS);
  }
  if (bm.sceneMaxFPS > 0) {
    elFpsMax.textContent = Math.round(bm.sceneMaxFPS);
  }
  elFpsAvg.textContent = Math.round(bm.getAvgFPS());

  const gpuTimeMs = bm.getAvgGPUTime();
  elGpuTime.textContent = gpuTimeMs >= 0 ? gpuTimeMs.toFixed(2) + " ms" : "N/A";

  const scene = scenes[bm.currentScene];
  elPrimitives.textContent = scene ? scene.primitiveCount : "--";

  elSceneName.textContent = `Test ${bm.currentScene + 1}: ${bm.sceneName}`;
  const pct = bm.getSceneProgressPercent(time);
  elScenePercent.textContent = Math.round(pct * 100) + "%";
  elProgressBar.style.width = pct * 100 + "%";
}

// ============================================================
// Score Screen
// ============================================================

function showScoreScreen() {
  overlay.classList.add("hidden");
  scoreScreen.classList.remove("hidden");

  const bm = benchmarkManager;
  elScore1.textContent = Math.round(bm.sceneScores[0] * 100);
  elScore2.textContent = Math.round(bm.sceneScores[1] * 100);
  elScore3.textContent = Math.round(bm.sceneScores[2] * 100);

  // Animated counter
  const target = bm.finalScore;
  let current = 0;
  const scoreCard = document.querySelector(".score-card");
  scoreCard.classList.add("animate");

  const interval = setInterval(() => {
    current += Math.ceil(target / 60);
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    elFinalScore.textContent = current;
  }, 16);
}

// ============================================================
// Position the graph canvas
// ============================================================

function positionGraphCanvas() {
  const graphRow = document.querySelector(".graph-row");
  if (!graphRow) return;
  const rect = graphRow.getBoundingClientRect();
  graphCanvas.style.left = rect.left + 4 + "px";
  graphCanvas.style.top = rect.top + 2 + "px";
  graphCanvas.width = rect.width - 8;
  graphCanvas.height = rect.height - 4;
}

// ============================================================
// Start / Restart
// ============================================================

async function startBenchmark() {
  startScreen.classList.add("hidden");
  scoreScreen.classList.add("hidden");
  overlay.classList.remove("hidden");

  positionGraphCanvas();

  // Create scenes
  scenes = [
    createRayMarchScene(),
    createParticleScene(),
    createGeometryScene(),
  ];

  lastTime = 0;
  benchmarkManager.start(performance.now() / 1000);
  animFrameId = requestAnimationFrame(renderLoop);
}

// ============================================================
// Event Listeners
// ============================================================

startBtn.addEventListener("click", startBenchmark);
restartBtn.addEventListener("click", startBenchmark);

window.addEventListener("resize", () => {
  if (!device) return;
  resizeCanvas();
  positionGraphCanvas();
  // Recreate depth texture for geometry scene
  if (scenes[2] && scenes[2].resize) {
    scenes[2].resize();
  }
});

// ============================================================
// Init
// ============================================================

(async () => {
  const ok = await initWebGPU();
  if (!ok) return;
})();
