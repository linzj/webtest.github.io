// ============================================================
// Benchmark Manager, Frame Time Graph, GPU Timestamp Helper
// ============================================================

const SCENE_DURATION = 20.0; // seconds per scene
const SCENE_NAMES = ["Ray March", "Particle Compute", "Geometry Stress"];
const SCENE_WEIGHTS = [0.4, 0.35, 0.25];

export class BenchmarkManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentScene = 0;
    this.sceneStartTime = 0;
    this.totalStartTime = 0;
    this.running = false;
    this.finished = false;

    // Per-scene stats
    this.sceneStats = [
      { frameTimes: [], fps: [], gpuTimes: [] },
      { frameTimes: [], fps: [], gpuTimes: [] },
      { frameTimes: [], fps: [], gpuTimes: [] },
    ];

    // Current frame stats
    this.currentFPS = 0;
    this.currentFrameTime = 0;
    this.minFPS = Infinity;
    this.maxFPS = 0;

    // Per-scene FPS tracking
    this.sceneMinFPS = Infinity;
    this.sceneMaxFPS = 0;

    this.sceneScores = [0, 0, 0];
    this.finalScore = 0;
  }

  start(time) {
    this.reset();
    this.running = true;
    this.totalStartTime = time;
    this.sceneStartTime = time;
  }

  update(time, dt) {
    if (!this.running || this.finished) return false;

    // FPS
    this.currentFrameTime = dt * 1000;
    this.currentFPS = dt > 0 ? 1.0 / dt : 0;

    const stats = this.sceneStats[this.currentScene];
    stats.frameTimes.push(this.currentFrameTime);
    stats.fps.push(this.currentFPS);

    // Track per-scene min/max
    if (this.currentFPS > 0 && this.currentFPS < Infinity) {
      if (this.currentFPS < this.sceneMinFPS)
        this.sceneMinFPS = this.currentFPS;
      if (this.currentFPS > this.sceneMaxFPS)
        this.sceneMaxFPS = this.currentFPS;
    }

    // Check scene transition
    const sceneElapsed = time - this.sceneStartTime;
    if (sceneElapsed >= SCENE_DURATION) {
      this.computeSceneScore(this.currentScene);
      this.currentScene++;
      if (this.currentScene >= 3) {
        this.finished = true;
        this.running = false;
        this.computeFinalScore();
        return true; // signal finished
      }
      this.sceneStartTime = time;
      this.sceneMinFPS = Infinity;
      this.sceneMaxFPS = 0;
      return false;
    }
    return false;
  }

  addGPUTime(ms) {
    if (this.running && !this.finished) {
      this.sceneStats[this.currentScene].gpuTimes.push(ms);
    }
  }

  getSceneProgress() {
    if (!this.running && !this.finished) return 0;
    return 0; // will be computed from time
  }

  getSceneElapsed(time) {
    return time - this.sceneStartTime;
  }

  getSceneProgressPercent(time) {
    const elapsed = time - this.sceneStartTime;
    return Math.min(elapsed / SCENE_DURATION, 1.0);
  }

  getOverallProgress(time) {
    const total = time - this.totalStartTime;
    return Math.min(total / (SCENE_DURATION * 3), 1.0);
  }

  getAvgFPS() {
    const stats = this.sceneStats[this.currentScene];
    if (stats.fps.length === 0) return 0;
    // Use recent 60 frames for display
    const recent = stats.fps.slice(-60);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  getAvgGPUTime() {
    const stats = this.sceneStats[this.currentScene];
    if (stats.gpuTimes.length === 0) return -1;
    const recent = stats.gpuTimes.slice(-60);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  computeSceneScore(sceneIdx) {
    const stats = this.sceneStats[sceneIdx];
    if (stats.fps.length === 0) {
      this.sceneScores[sceneIdx] = 0;
      return;
    }

    const fpsArr = stats.fps.filter((f) => f > 0 && f < Infinity);
    if (fpsArr.length === 0) {
      this.sceneScores[sceneIdx] = 0;
      return;
    }

    const mean = fpsArr.reduce((a, b) => a + b, 0) / fpsArr.length;
    const variance =
      fpsArr.reduce((sum, f) => sum + (f - mean) ** 2, 0) / fpsArr.length;
    const stdDev = Math.sqrt(variance);

    const stabilityFactor = Math.max(0.5, Math.min(1.0, 1.0 - stdDev / mean));

    const canvas = document.getElementById("gpuCanvas");
    const w = canvas.width;
    const h = canvas.height;
    const resolutionFactor = (w * h) / (1920 * 1080);

    this.sceneScores[sceneIdx] = mean * stabilityFactor * resolutionFactor;
  }

  computeFinalScore() {
    this.finalScore = Math.round(
      (this.sceneScores[0] * SCENE_WEIGHTS[0] +
        this.sceneScores[1] * SCENE_WEIGHTS[1] +
        this.sceneScores[2] * SCENE_WEIGHTS[2]) *
        100,
    );
  }

  get sceneName() {
    if (this.finished) return "Complete";
    if (!this.running) return "Ready";
    return SCENE_NAMES[this.currentScene];
  }
}

// ============================================================
// Frame Time Graph - 2D canvas sparkline
// ============================================================

export class FrameTimeGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.history = [];
    this.maxFrames = 300;
  }

  push(frameTimeMs) {
    this.history.push(frameTimeMs);
    if (this.history.length > this.maxFrames) {
      this.history.shift();
    }
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, w, h);

    if (this.history.length < 2) return;

    // Reference lines
    const maxMs = 50;
    const y16 = h - (16.67 / maxMs) * h;
    const y33 = h - (33.33 / maxMs) * h;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(0, y16);
    ctx.lineTo(w, y16);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, y33);
    ctx.lineTo(w, y33);
    ctx.stroke();

    ctx.setLineDash([]);

    // Bars
    const barW = w / this.maxFrames;
    for (let i = 0; i < this.history.length; i++) {
      const ms = this.history[i];
      const barH = Math.min((ms / maxMs) * h, h);

      if (ms <= 16.67) {
        ctx.fillStyle = "#00e676";
      } else if (ms <= 33.33) {
        ctx.fillStyle = "#ffea00";
      } else {
        ctx.fillStyle = "#ff5252";
      }

      const x = i * barW;
      ctx.fillRect(x, h - barH, Math.max(barW - 0.5, 0.5), barH);
    }
  }
}

// ============================================================
// GPU Timestamp Helper
// ============================================================

export class GPUTimestampHelper {
  constructor(device) {
    this.device = device;
    this.available = device.features.has("timestamp-query");
    this.lastGPUTimeMs = -1;
    this.pendingRead = false;

    if (this.available) {
      this.querySet = device.createQuerySet({
        type: "timestamp",
        count: 2,
      });
      this.resolveBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      this.resultBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    }
  }

  beginPass() {
    if (!this.available) return {};
    return {
      timestampWrites: {
        querySet: this.querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    };
  }

  resolve(encoder) {
    if (!this.available) return;
    encoder.resolveQuerySet(this.querySet, 0, 2, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.resultBuffer, 0, 16);
  }

  async readTimestamp() {
    if (!this.available || this.pendingRead) return;
    this.pendingRead = true;
    try {
      await this.resultBuffer.mapAsync(GPUMapMode.READ);
      const times = new BigUint64Array(this.resultBuffer.getMappedRange());
      const start = Number(times[0]);
      const end = Number(times[1]);
      this.lastGPUTimeMs = (end - start) / 1e6; // nanoseconds to ms
      this.resultBuffer.unmap();
    } catch (e) {
      // Ignore mapping errors
    }
    this.pendingRead = false;
  }

  destroy() {
    if (this.available) {
      this.querySet.destroy();
      this.resolveBuffer.destroy();
      this.resultBuffer.destroy();
    }
  }
}
