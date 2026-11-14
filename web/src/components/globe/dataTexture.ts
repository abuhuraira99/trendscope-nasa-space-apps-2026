import * as THREE from "three";
import type { GridGeom } from "../../lib/data/grids";
import { rampLUT, type RampKind } from "../../lib/color/ramps";

/**
 * Packs a field into an RGBA8 texture, upsampled `factor` times with Catmull-Rom interpolation so
 * the 1-degree cells read as a continuous field up close:
 *   R = value mapped from [-scale, +scale] to [0, 1]
 *   G = significance (0 = none, 0.5 = p < 0.05, 1 = survives the false discovery rate test)
 *   B = 1 where the cell has data
 * Missing cells are filled from valid neighbours first so interpolation does not bleed toward zero
 * along coastlines; B keeps the true mask. Longitude wraps, latitude clamps.
 * Texel j of the upsampled grid sits at source column (j + 0.5) / factor - 0.5, which keeps the
 * shader's (col + 0.5) / n mapping valid.
 */
export function packField(
  geom: GridGeom,
  values: ArrayLike<number>,
  scale: number,
  sig?: ArrayLike<number>,
  existing?: THREE.DataTexture,
  factor = 4,
): THREE.DataTexture {
  const { nlat, nlon } = geom;
  const n = nlat * nlon;
  const filled = new Float32Array(n);
  const valid = new Float32Array(n);
  const sigv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      filled[i] = v;
      valid[i] = 1;
    } else filled[i] = NaN;
    const s = sig ? sig[i] : 2;
    sigv[i] = Number.isFinite(s) ? (s >= 1.5 ? 1 : s >= 0.5 ? 0.5 : 0) : 0;
  }
  fillGaps(filled, nlat, nlon, 4);
  for (let i = 0; i < n; i++) if (Number.isNaN(filled[i])) filled[i] = 0;

  const W = nlon * factor;
  const H = nlat * factor;
  const total = W * H;
  const data =
    existing && (existing.image.data as Uint8Array).length === total * 4
      ? (existing.image.data as Uint8Array)
      : new Uint8Array(total * 4);

  // Precompute source positions and Catmull-Rom weights per output column and row.
  const colIdx = new Int32Array(W * 4);
  const colW = new Float32Array(W * 4);
  const colLin = new Int32Array(W * 2);
  const colLinW = new Float32Array(W);
  for (let j = 0; j < W; j++) {
    const x = (j + 0.5) / factor - 0.5;
    const x0 = Math.floor(x);
    const t = x - x0;
    const w = catmull(t);
    for (let k = 0; k < 4; k++) {
      colIdx[j * 4 + k] = (((x0 - 1 + k) % nlon) + nlon) % nlon;
      colW[j * 4 + k] = w[k];
    }
    colLin[j * 2] = ((x0 % nlon) + nlon) % nlon;
    colLin[j * 2 + 1] = (((x0 + 1) % nlon) + nlon) % nlon;
    colLinW[j] = t;
  }
  const rowIdx = new Int32Array(H * 4);
  const rowW = new Float32Array(H * 4);
  const rowLin = new Int32Array(H * 2);
  const rowLinW = new Float32Array(H);
  for (let i = 0; i < H; i++) {
    const y = (i + 0.5) / factor - 0.5;
    const y0 = Math.floor(y);
    const t = y - y0;
    const w = catmull(t);
    for (let k = 0; k < 4; k++) {
      rowIdx[i * 4 + k] = Math.min(nlat - 1, Math.max(0, y0 - 1 + k));
      rowW[i * 4 + k] = w[k];
    }
    rowLin[i * 2] = Math.min(nlat - 1, Math.max(0, y0));
    rowLin[i * 2 + 1] = Math.min(nlat - 1, Math.max(0, y0 + 1));
    rowLinW[i] = t;
  }

  // Separable pass: rows first into a temp buffer of size nlat x W.
  const tmp = new Float32Array(nlat * W);
  for (let r = 0; r < nlat; r++) {
    const base = r * nlon;
    for (let j = 0; j < W; j++) {
      const o = j * 4;
      tmp[r * W + j] =
        filled[base + colIdx[o]] * colW[o] +
        filled[base + colIdx[o + 1]] * colW[o + 1] +
        filled[base + colIdx[o + 2]] * colW[o + 2] +
        filled[base + colIdx[o + 3]] * colW[o + 3];
    }
  }
  const inv = 1 / (2 * scale);
  for (let i = 0; i < H; i++) {
    const o = i * 4;
    const r0 = rowIdx[o] * W;
    const r1 = rowIdx[o + 1] * W;
    const r2 = rowIdx[o + 2] * W;
    const r3 = rowIdx[o + 3] * W;
    const w0 = rowW[o];
    const w1 = rowW[o + 1];
    const w2 = rowW[o + 2];
    const w3 = rowW[o + 3];
    const la = rowLin[i * 2] * nlon;
    const lb = rowLin[i * 2 + 1] * nlon;
    const ty = rowLinW[i];
    for (let j = 0; j < W; j++) {
      const v = tmp[r0 + j] * w0 + tmp[r1 + j] * w1 + tmp[r2 + j] * w2 + tmp[r3 + j] * w3;
      const t = 0.5 + v * inv;
      const ca = colLin[j * 2];
      const cb = colLin[j * 2 + 1];
      const tx = colLinW[j];
      const w00 = (1 - tx) * (1 - ty);
      const w01 = tx * (1 - ty);
      const w10 = (1 - tx) * ty;
      const w11 = tx * ty;
      const sg = sigv[la + ca] * w00 + sigv[la + cb] * w01 + sigv[lb + ca] * w10 + sigv[lb + cb] * w11;
      const vd = valid[la + ca] * w00 + valid[la + cb] * w01 + valid[lb + ca] * w10 + valid[lb + cb] * w11;
      const p = (i * W + j) * 4;
      data[p] = t <= 0 ? 0 : t >= 1 ? 255 : (t * 255 + 0.5) | 0;
      data[p + 1] = (sg * 255 + 0.5) | 0;
      data[p + 2] = (vd * 255 + 0.5) | 0;
      data[p + 3] = 255;
    }
  }

  if (existing && existing.image.width === W && existing.image.height === H) {
    existing.needsUpdate = true;
    return existing;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function catmull(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
}

function fillGaps(a: Float32Array, nlat: number, nlon: number, passes: number) {
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    const next = a.slice();
    for (let r = 0; r < nlat; r++) {
      for (let c = 0; c < nlon; c++) {
        const i = r * nlon + c;
        if (!Number.isNaN(a[i])) continue;
        let sum = 0;
        let k = 0;
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= nlat) continue;
          for (let dc = -1; dc <= 1; dc++) {
            const v = a[rr * nlon + ((c + dc + nlon) % nlon)];
            if (!Number.isNaN(v)) {
              sum += v;
              k++;
            }
          }
        }
        if (k) {
          next[i] = sum / k;
          changed = true;
        }
      }
    }
    a.set(next);
    if (!changed) break;
  }
}

const rampTextures = new Map<RampKind, THREE.DataTexture>();

export function rampTexture(kind: RampKind): THREE.DataTexture {
  let t = rampTextures.get(kind);
  if (!t) {
    t = new THREE.DataTexture(rampLUT(kind), 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    rampTextures.set(kind, t);
  }
  return t;
}
