# WebGPU 水面模拟 — 光线步进渲染器

基于 WebGPU 的实时泳池水面模拟。使用 compute shader 进行波动方程求解，fragment shader 中通过光线步进（ray march）渲染整个场景，实现水面折射、反射、菲涅尔效果和焦散。

## 架构概览

```
┌─────────────────────────────────────────────────┐
│                  每帧流程                        │
│                                                 │
│  1. 更新相机 uniform（含 invViewProj）           │
│  2. Compute Pass ×3（波动方程步进）              │
│  3. Render Pass ×1（全屏三角形 → ray march）     │
│                                                 │
│  GPU 管线:                                      │
│  ┌──────────┐    ┌──────────────────────┐       │
│  │ Compute  │───→│ Ray March Fragment   │       │
│  │ 波动模拟  │    │ 全场景光线追踪        │       │
│  │ 512×512  │    │ (水面步进+解析几何)    │       │
│  └──────────┘    └──────────────────────┘       │
└─────────────────────────────────────────────────┘
```

单文件 `index.html`，无外部依赖。

---

## 一、Compute Pipeline — 波动方程模拟

### 1.1 核心算法

在 512×512 的高度场网格上求解二维波动方程：

```
h_new = 2 * h_current - h_previous + c² * laplacian
h_new *= damping
```

- **c²** = 0.23（波速平方）
- **damping** = 0.998（每步衰减，防止能量无限积累）
- **laplacian** = 上 + 下 + 左 + 右 − 4 × 中心（5 点离散拉普拉斯算子）

### 1.2 三缓冲区旋转（Ping-Pong）

波动方程需要同时访问「当前帧」和「上一帧」的高度数据，写入「下一帧」：

```
bufState=0: current=A, previous=B, next=C
bufState=1: current=C, previous=A, next=B
bufState=2: current=B, previous=C, next=A
```

每步完成后 `bufState = (bufState + 1) % 3`，缓冲区角色轮换。

### 1.3 球体障碍物

球体在水面处的截面圆作为刚性障碍：

- 圆内的网格点强制设为 `h = 0`
- 邻居采样时，如果邻居在球体内，则使用当前格点自身的值（Neumann 反射边界条件）
- 泳池边界同样使用 Neumann 反射

### 1.4 水滴扰动

每帧最多处理一个水滴。水滴以高斯衰减叠加到高度场：

```
falloff = exp(-dist² / (radius² × 0.25))
h_new += strength × falloff
```

### 1.5 每帧多步

每帧执行 3 次 compute dispatch（子步进），第 1 步带水滴，后 2 步清除水滴参数。必须使用**独立的 CommandEncoder** 提交每一步，因为 `writeBuffer` 是立即生效的，而 encoder 内的工作是批量的。

---

## 二、Render Pipeline — 光线步进

### 2.1 全屏三角形（Vertex Shader）

不需要顶点缓冲区。利用 `vertex_index` 生成覆盖全屏的单个三角形：

```wgsl
let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
// vi=0 → uv=(0,0), vi=1 → uv=(2,0), vi=2 → uv=(0,2)
// 映射到 clip space: pos = uv * 2 - 1
```

3 个顶点生成一个超大三角形，光栅化后恰好覆盖 `[-1,1]×[-1,1]` 的整个屏幕。

### 2.2 射线构造（Fragment Shader 入口）

```
屏幕 UV → NDC [-1,+1] → invViewProj 反投影 → 世界空间近/远平面点
射线起点 ro = camera.eye
射线方向 rd = normalize(farPoint - nearPoint)
```

`invViewProj` 是 `(projMat × viewMat)` 的逆矩阵，在 JS 端每帧计算后写入 camera uniform。

### 2.3 场景求交 — 混合策略

**关键设计**：不是对整个场景做 ray march。硬几何使用解析求交（O(1)），只有动态水面用步进。

对每条射线，按以下顺序测试 4 类目标，记录最近命中：

#### 第 1 层：泳池内壁（水面以上部分）

```
AABB: [-HW, 0, -HD] → [HW, RIM_TOP, HD]
方法: ray-AABB 解析求交
过滤: 只接受侧面墙壁（abs(N.y) < 0.5），跳过顶面和底面
```

跳过顶面是关键——否则 y=RIM_TOP 处的顶面命中会遮挡下方的水面。

#### 第 2 层：池沿（Rim）

池沿是「外盒减内盒」的 CSG 差运算：

```
外盒: [-OW, RIM_BOT, -OD] → [OW, RIM_TOP, OD]   (OW = HW + 1.5)
内盒: [-HW, RIM_BOT, -HD] → [HW, RIM_TOP, HD]

逻辑:
1. 射线与外盒求交，得到 entry point
2. 如果 entry 落在内盒区域内 → 射线穿过了泳池中央
   → 与内盒求交，取 exit point → 这就是 rim 内侧面的命中
3. 如果 entry 在内盒外 → 直接就是 rim 外表面的命中
```

#### 第 3 层：球体（水面以上部分）

```
方法: ray-sphere 解析求交（二次方程判别式）
过滤: 只渲染 p.y > 0 的命中点（水面以上部分可见）
```

#### 第 4 层：水面（Ray March）

这是唯一使用步进的部分。详见下文 §2.4。

#### 优先级

所有 4 层的 t 值做比较，最小 t 胜出。水面以下的内容（地面、水下球体）不直接绘制，而是通过水面折射射线间接访问。

### 2.4 水面 Ray March 详解

```
                 camera
                   │ 射线
                   ▼
    ╔══════════════╧════════════════╗ ← waterMax (y=1.5)
    ║  步进区间 (48步均匀)          ║
    ║     ┌─ 二分细化 (8步) ─┐     ║
    ║     ▼                  ▼     ║
    ║ ~~~~ 水面 (heightfield) ~~~~ ║ ← y ≈ 0
    ║                              ║
    ╚══════════════════════════════╝ ← waterMin (y=-1.0)
```

**步骤 1 — AABB 裁剪**

```wgsl
waterMin = (-HW, -1.0, -HD)
waterMax = (HW,  1.5,  HD)
```

先用 ray-AABB 计算射线在水面可能区域内的 `[tStart, tEnd]` 区间。水面振幅约 ±0.5，所以 y 范围 [-1, 1.5] 足够。

**步骤 2 — 均匀步进（48 步）**

在 `[tStart, tEnd]` 区间内等距采样 48 个点。每个点计算：

```
h = waterHeightAt(p) - p.y
```

- `h < 0`：射线在水面**之上**（射线 y > 水面高度）
- `h ≥ 0`：射线在水面**之下**（射线 y ≤ 水面高度）

当连续两步之间 h 从负变正（`hPrev < 0 && h >= 0`），说明射线穿过了水面。

**步骤 3 — 二分细化（8 次）**

在粗步进发现交叉的区间 `[tPrev, t]` 内做 8 次二分查找：

```wgsl
for j in 0..8:
    tM = (tA + tB) / 2
    hM = waterHeightAt(pM) - pM.y
    if hM < 0: tA = tM   // 还在水面之上，收缩左界
    else:      tB = tM    // 穿过了水面，收缩右界
```

最终精度 = `dt / 2^8 = dt / 256`。以典型 dt ≈ 0.5 计算，精度约 0.002 世界单位。

**步骤 4 — 高度场双线性插值**

`sampleH(u, v)` 不是最近邻采样，而是双线性插值：

```wgsl
h00 = heights[iy * GRID + ix]       // 左下
h10 = heights[iy * GRID + ix + 1]   // 右下
h01 = heights[(iy+1) * GRID + ix]   // 左上
h11 = heights[(iy+1) * GRID + ix+1] // 右上
return mix(mix(h00, h10, fx), mix(h01, h11, fx), fy)
```

这确保水面在步进采样时是平滑的，避免锯齿伪影。

### 2.5 水面着色

命中水面后，执行完整的物理光学模拟：

```
                    反射 (skyColor)
                   ╱
camera ──→ 水面命中点
                   ╲
                    折射 → traceUnderwater()
                              ├→ ray-AABB → 泳池地面/墙壁
                              └→ ray-sphere → 球体
```

#### 菲涅尔（Schlick 近似）

```wgsl
r0 = ((1 - IOR) / (1 + IOR))²    // IOR = 1.33（水）
fresnel = r0 + (1 - r0) × (1 - cosθ)⁵
```

- 垂直看水面（cosθ ≈ 1）→ fresnel ≈ 0.02，几乎全透明
- 掠射角度（cosθ ≈ 0）→ fresnel ≈ 1.0，几乎全反射

#### 折射射线

```wgsl
refractDir = refract(-V, waterNormal, 1.0 / 1.33)
```

WGSL 内置 `refract()` 函数，基于 Snell 定律。折射射线进入水下后，用解析方法（ray-AABB + ray-sphere）追踪命中。

#### 水面法线

有限差分法，4 次高度场采样：

```wgsl
N = normalize(vec3f(hL - hR, eps × 2.0, hD - hU))
```

#### 最终合成

```wgsl
color = mix(underwaterColor, reflectedSkyColor, fresnel) + specular
```

### 2.6 水下追踪（`traceUnderwater`）

折射射线进入水体后，**不再步进**，而是用解析方法：

1. `raySphere` → 检测球体
2. `rayAABB` → 检测泳池内壁和地面 `[-HW,-POOL_H,-HD] → [HW, 0.5, HD]`
3. 取最近命中 → 着色

然后应用水下效果：

```wgsl
// Beer-Lambert 吸收定律（红光吸收最快）
absorb = exp(-distance × vec3(0.08, 0.025, 0.03))
color *= absorb

// 与水色混合（距离越远越接近水色）
color = mix(waterTint, color, exp(-distance × 0.04))
```

---

## 三、着色系统

### 3.1 全局光照（GI 近似）

所有表面使用半球光照模拟环境光：

```wgsl
skyUp      = vec3(0.45, 0.55, 0.65)   // 天空向下照射
groundBounce = vec3(0.18, 0.30, 0.25) // 地面反弹光
hemiLight  = mix(groundBounce, skyUp, N.y × 0.5 + 0.5)
```

加上主光源（半 Lambert 包裹光照）和填充光：

```wgsl
mainLight = lightColor × (dot(N, L) × 0.4 + 0.6)   // 半 Lambert
fillLight = fillColor × max(dot(N, fillDir), 0.0) × 0.35
totalLight = hemiLight + mainLight × shadow + fillLight
```

### 3.2 焦散（Caustics）

利用高度场曲率模拟光线聚焦效应：

```wgsl
laplacian = hL + hR + hD + hU - 4.0 × hC
intensity = 1.0 / max(1.0 - laplacian × k, 0.05) - 1.0
```

物理直觉：laplacian > 0（凹面）→ 光线汇聚 → 亮焦散。

色散效果：R/G/B 三通道使用不同的 UV 偏移计算独立的 laplacian，产生彩虹边缘。

### 3.3 球体阴影

从被照射点沿光线方向做 ray-sphere 测试：

```wgsl
oc = worldPos - sphereCenter
b = dot(oc, lightDir)
if b >= 0: 球体在背后，无阴影
否则: 计算射线到球心最近距离 → 在球体内为硬阴影(0.25)，边缘0.6单位内为软半影
```

### 3.4 天空模型

三段式天空颜色：

```
仰角 > 0:  horizon(暖灰) → zenith(蓝) 线性插值
仰角 < 0:  horizon(暖灰) → ground(暗绿) 按 -y×2 插值
```

### 3.5 色调映射

```wgsl
finalColor = 1.0 - exp(-finalColor × 1.2)
```

指数映射：保持中间调不变，只压缩高光，避免 Reinhard 对中间调的过度压暗。

---

## 四、GPU 缓冲区布局

### Camera Uniform（224 字节）

| 偏移(字节) | 偏移(float) | 字段                  | 大小 |
| ---------- | ----------- | --------------------- | ---- |
| 0          | 0           | viewMat (mat4x4f)     | 64B  |
| 64         | 16          | projMat (mat4x4f)     | 64B  |
| 128        | 32          | eye (vec4f)           | 16B  |
| 144        | 36          | invViewProj (mat4x4f) | 64B  |

### Light Uniform（48 字节）

| 偏移 | 字段              | 值                   |
| ---- | ----------------- | -------------------- |
| 0    | direction (vec4f) | (0.4, 0.9, 0.3, 0)   |
| 16   | color (vec4f)     | (1.0, 0.98, 0.95, 0) |
| 32   | ambient (vec4f)   | (0.25, 0.28, 0.3, 0) |

### Compute Params Uniform（48 字节）

| 偏移 | 字段                                   |
| ---- | -------------------------------------- |
| 0    | time, dt, damping, c²                  |
| 16   | dropX, dropY, dropRadius, dropStrength |
| 32   | sphereX, sphereZ, sphereR, (padding)   |

### Height Buffers（A, B, C）

每个 512 × 512 × 4 = 1,048,576 字节（1MB），`storage` 类型。

---

## 五、场景几何常量

```
泳池内部:  [-10, -3, -10] → [10, 0.9, 10]   (20×3×20)
池沿(rim):  外扩 1.5 单位, y ∈ [0.5, 0.9]
球体:       中心 (-3, 0.5, 0), 半径 1.2
水面:       y ≈ 0, 由 heightfield 动态偏移
```

---

## 六、性能分析

| 操作                    | 每像素开销                      |
| ----------------------- | ------------------------------- |
| 射线构造 + 4 层解析求交 | ~10 ALU                         |
| 水面步进 (48步)         | 48 × heightfield 采样           |
| 二分细化 (8步)          | 8 × heightfield 采样            |
| 水面法线                | 4 × heightfield 采样            |
| 折射水下追踪            | 2 × 解析求交                    |
| 焦散                    | 15 × heightfield 采样           |
| **总计**                | ~75 heightfield 采样 + 少量 ALU |

每次 heightfield 采样 = 4 次 storage buffer 读取（双线性插值）。

单 draw call（3 顶点），无顶点缓冲区。1080p@60fps 在中端 GPU 上可达。

---

## 七、交互

- **点击水面**：产生波纹（射线反投影到 y=0 平面得到水面坐标）
- **拖拽**：轨道相机旋转（spherical coordinates）
- **滚轮**：缩放（调整相机距离 8-50）
- **自动**：每 1.5-3.5 秒随机掉落一个水滴，缓慢自动旋转相机
