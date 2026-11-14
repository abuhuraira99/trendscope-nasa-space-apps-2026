import * as THREE from "three";

export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const earthFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uData;
  uniform sampler2D uPrev;
  uniform sampler2D uRamp;
  uniform sampler2D uPrevRamp;
  uniform sampler2D uLand;
  uniform vec4 uGeom;      // lat0, dlat, nlat, lon0
  uniform vec2 uGeom2;     // dlon, nlon
  uniform vec4 uPrevGeom;
  uniform vec2 uPrevGeom2;
  uniform float uMix;      // crossfade prev -> current
  uniform float uHasData;
  uniform float uHasPrev;
  uniform float uSigOnly;  // 1 = hide cells that fail the false discovery test
  uniform vec3 uLightDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  vec2 gridUv(vec4 g, vec2 g2, float lat, float lon) {
    float row = (lat - g.x) / g.y;
    float col = (lon - g.w) / g2.x; // texture repeats in S, so no wrap seam
    return vec2((col + 0.5) / g2.y, (row + 0.5) / g.z);
  }

  vec4 layer(sampler2D data, sampler2D ramp, vec4 g, vec2 g2, float lat, float lon, out float alpha) {
    vec4 d = texture2D(data, gridUv(g, g2, lat, lon));
    float valid = smoothstep(0.35, 0.65, d.b);
    // 1 where the trend passes the false discovery test, fading smoothly at the edges.
    float strong = smoothstep(0.62, 0.9, d.g);
    // Diagonal hatching marks places where the change could be chance (the convention of
    // scientific trend maps). Screen-space so the lines stay crisp at every zoom.
    float hatch = step(0.62, fract((gl_FragCoord.x - gl_FragCoord.y) / 7.0));
    float weak = 0.18 + 0.3 * hatch;
    float strength = mix(weak, 1.0, strong);
    strength = mix(strength, strong, uSigOnly);
    alpha = valid * strength;
    return vec4(texture2D(ramp, vec2(d.r, 0.5)).rgb, 1.0);
  }

  void main() {
    float lat = vUv.y * 180.0 - 90.0;
    float lon = vUv.x * 360.0 - 180.0;
    float land = texture2D(uLand, vUv).r;
    // Linear-light values (the output is encoded to sRGB once, at the end).
    vec3 ocean = vec3(0.0033, 0.0044, 0.0061);
    vec3 ground = vec3(0.0108, 0.0131, 0.0168);
    vec3 col = mix(ocean, ground, land);

    if (uHasPrev > 0.5 && uMix < 1.0) {
      float aPrev;
      vec3 cPrev = layer(uPrev, uPrevRamp, uPrevGeom, uPrevGeom2, lat, lon, aPrev).rgb;
      col = mix(col, cPrev, aPrev * (1.0 - uMix));
    }
    if (uHasData > 0.5) {
      float a;
      vec3 c = layer(uData, uRamp, uGeom, uGeom2, lat, lon, a).rgb;
      col = mix(col, c, a * uMix);
    }

    // Soft daylight from the upper left, high ambient so the data stays readable.
    float lambert = max(dot(normalize(vNormalW), normalize(uLightDir)), 0.0);
    col *= 0.82 + 0.26 * lambert;
    // Limb darkening: the sphere reads as a sphere without any glow.
    float facing = clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0);
    col *= mix(0.55, 1.0, pow(facing, 0.55));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createEarthMaterial(land: THREE.Texture): THREE.ShaderMaterial {
  const blank = new THREE.DataTexture(new Uint8Array([128, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  return new THREE.ShaderMaterial({
    vertexShader: earthVertex,
    fragmentShader: earthFragment,
    uniforms: {
      uData: { value: blank },
      uPrev: { value: blank },
      uRamp: { value: blank },
      uPrevRamp: { value: blank },
      uLand: { value: land },
      uGeom: { value: new THREE.Vector4(-90, 1, 181, -180) },
      uGeom2: { value: new THREE.Vector2(1.25, 288) },
      uPrevGeom: { value: new THREE.Vector4(-90, 1, 181, -180) },
      uPrevGeom2: { value: new THREE.Vector2(1.25, 288) },
      uMix: { value: 1 },
      uHasData: { value: 0 },
      uHasPrev: { value: 0 },
      uSigOnly: { value: 0 },
      uLightDir: { value: new THREE.Vector3(-0.6, 0.55, 0.9).normalize() },
    },
  });
}
