// ============================================================
// Debug Mode - Stage definitions for each scene
// ============================================================

export const DEBUG_STAGES = {
  rayMarch: [
    {
      id: 1,
      name: "SDF Distance Field",
      debugMode: 1,
      description:
        "Visualizes the signed distance field (SDF) as a grayscale image. Each pixel shows the distance from the camera ray's hit point to the nearest surface. Bright areas are far from surfaces, dark areas are close. This is the fundamental building block of ray marching — the SDF tells the ray how far it can safely step forward.",
    },
    {
      id: 2,
      name: "Ray March Steps Heatmap",
      debugMode: 2,
      description:
        "Shows how many ray march iterations were needed to find a surface at each pixel, displayed as a heatmap (blue = few steps, red = many steps). Areas near surface edges, thin features, and grazing angles require more steps. This visualization helps identify performance hotspots in the ray marching algorithm.",
    },
    {
      id: 3,
      name: "Surface Normals",
      debugMode: 3,
      description:
        "Displays surface normals mapped to RGB color (N * 0.5 + 0.5). Red = X component, Green = Y component, Blue = Z component. Normals are computed numerically by sampling the SDF at small offsets. Correct normals are essential for all subsequent lighting calculations.",
    },
    {
      id: 4,
      name: "Material IDs",
      debugMode: 4,
      description:
        "Each material in the scene is assigned a unique ID and rendered with a distinct flat color. This shows how the SDF function classifies different objects: floor, spheres, torus, and pillars. Material IDs drive the per-object color and shading properties.",
    },
    {
      id: 5,
      name: "Diffuse Lighting",
      debugMode: 5,
      description:
        "Shows only the Lambertian diffuse lighting component: dot(N, L) * lightColor * materialColor. No shadows, no ambient occlusion, no specular highlights. This is the simplest physically-based lighting — the cosine of the angle between the surface normal and light direction.",
    },
    {
      id: 6,
      name: "Soft Shadows",
      debugMode: 6,
      description:
        "Displays the soft shadow factor as a grayscale image. White = fully lit, black = fully shadowed. Soft shadows are computed by marching a secondary ray toward the light source and tracking how close it passes to other surfaces. The closer the ray passes, the darker the shadow — creating smooth penumbra edges.",
    },
    {
      id: 7,
      name: "Ambient Occlusion",
      debugMode: 7,
      description:
        "Shows the ambient occlusion (AO) factor as grayscale. AO estimates how much ambient light reaches each surface point by sampling the SDF at increasing distances along the normal. Concave areas (corners, crevices) appear darker because nearby geometry blocks ambient light. AO adds depth and contact shadows to the final image.",
    },
    {
      id: 8,
      name: "Full Render",
      debugMode: 0,
      description:
        "The complete ray marched scene combining all previous stages: SDF-based geometry, diffuse and specular lighting, soft shadows, ambient occlusion, reflections for metallic spheres, volumetric fog, ACES tone mapping, and gamma correction. This is identical to the benchmark rendering output.",
    },
  ],

  particleCompute: [
    {
      id: 1,
      name: "Initial Distribution",
      debugMode: 1,
      description:
        "Shows particles in their initial spawned positions with no forces applied. Particles are distributed in a cylindrical pattern around the origin. Velocity and position remain at their initial values. This baseline shows the starting state before any simulation.",
    },
    {
      id: 2,
      name: "Attractor Forces Only",
      debugMode: 2,
      description:
        "Particles are affected only by the four gravitational attractor points, with turbulence disabled. Attractors orbit the scene and pull particles with an inverse-square-distance force. You can see particles forming streams and clusters around the attractor positions.",
    },
    {
      id: 3,
      name: "Turbulence Only",
      debugMode: 3,
      description:
        "Particles are affected only by 3D noise-based turbulence, with attractors disabled. The turbulence field creates chaotic, organic motion patterns. Each particle samples a 3D noise function at its position to compute a force vector, creating swirling, fluid-like behavior.",
    },
    {
      id: 4,
      name: "Combined Forces",
      debugMode: 4,
      description:
        "Both attractor forces and turbulence are active simultaneously. This is the same force computation as the full render, showing how the two force types interact. Attractors provide large-scale structure while turbulence adds fine-scale detail and chaos.",
    },
    {
      id: 5,
      name: "Life Cycle Visualization",
      debugMode: 5,
      description:
        "Particles are colored based on their remaining life value instead of velocity. Green = newly spawned (full life), transitioning through yellow to red = near death. When life reaches zero, particles respawn at a random position. This shows the particle lifecycle and respawn distribution.",
    },
    {
      id: 6,
      name: "Full Render",
      debugMode: 0,
      description:
        "The complete particle simulation with all forces active and velocity-based coloring. Color maps from blue (slow) through cyan and yellow to red (fast). Alpha fades with life value. Additive blending creates a glowing, volumetric effect. This is identical to the benchmark rendering output.",
    },
  ],

  geometryStress: [
    {
      id: 1,
      name: "Flat Shading (Lambert)",
      debugMode: 1,
      description:
        "Simple single-light Lambertian diffuse shading: albedo * max(dot(N, L), 0.0). Uses only the first light source with no attenuation, no specular, no Fresnel. This is the simplest physically-plausible shading model — brightness depends only on the angle between the surface normal and light direction.",
    },
    {
      id: 2,
      name: "Normal Distribution (GGX)",
      debugMode: 2,
      description:
        "Visualizes the GGX Normal Distribution Function (NDF) as grayscale for the first light. The NDF describes the statistical distribution of microfacet orientations on the surface. Bright spots appear where the halfway vector H aligns with the surface normal N. Rougher surfaces spread the highlight over a wider area.",
    },
    {
      id: 3,
      name: "Fresnel Effect",
      debugMode: 3,
      description:
        "Shows the Fresnel-Schlick approximation as RGB color for the first light. Fresnel describes how reflectivity increases at grazing angles. At normal incidence (facing the camera directly), reflectivity is low (F0 ≈ 0.04 for dielectrics). At grazing angles (edges of spheres), reflectivity approaches 1.0, creating bright rim effects.",
    },
    {
      id: 4,
      name: "Geometry Function",
      debugMode: 4,
      description:
        "Visualizes the Smith geometry attenuation function as grayscale for the first light. This function models self-shadowing and masking of microfacets. It attenuates the specular reflection when the view or light direction is at a grazing angle, preventing energy from exceeding physical limits.",
    },
    {
      id: 5,
      name: "Single Light PBR",
      debugMode: 5,
      description:
        "Complete PBR shading using only the first light source, with ACES tone mapping and gamma correction. Shows the full BRDF (diffuse + specular) combining GGX distribution, Fresnel, and geometry terms. This isolates how a single light interacts with the PBR material model.",
    },
    {
      id: 6,
      name: "Multi-Light (no tonemapping)",
      debugMode: 6,
      description:
        "All 12 dynamic lights contributing to PBR shading, but without ACES tone mapping or gamma correction. The raw HDR values are clamped to [0, 1]. Bright areas appear blown out because there is no tone mapping to compress the dynamic range. This shows why tone mapping is essential for realistic rendering.",
    },
    {
      id: 7,
      name: "Full Render",
      debugMode: 0,
      description:
        "The complete PBR pipeline with all 12 lights, ACES tone mapping, and gamma correction. This combines ambient lighting, Cook-Torrance specular BRDF, energy conservation, distance attenuation, and post-processing. This is identical to the benchmark rendering output.",
    },
  ],
};
