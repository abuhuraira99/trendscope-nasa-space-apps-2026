import * as THREE from "three";
import { feature, mesh } from "topojson-client";
import { geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import type { Topology, GeometryCollection } from "topojson-specification";

const DEG = Math.PI / 180;

/** Globe convention: lon 0 on +X, lon +90 on -Z, north on +Y (matches three's SphereGeometry UVs). */
export function latLonToVec3(lat: number, lon: number, r = 1, out = new THREE.Vector3()) {
  const phi = lat * DEG;
  const lam = lon * DEG;
  return out.set(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
}

export function vec3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const n = v.clone().normalize();
  return { lat: Math.asin(Math.max(-1, Math.min(1, n.y))) / DEG, lon: Math.atan2(-n.z, n.x) / DEG };
}

type LineCoords = number[][][];

function linesToGeometry(lines: LineCoords, r: number): THREE.BufferGeometry {
  const pts: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [lon1, lat1] = line[i];
      const [lon2, lat2] = line[i + 1];
      if (Math.abs(lon1 - lon2) > 180) continue; // antimeridian jump
      // densify long segments so they follow the curvature
      const steps = Math.max(1, Math.ceil(Math.hypot(lon2 - lon1, lat2 - lat1) / 2));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        latLonToVec3(lat1 + (lat2 - lat1) * t0, lon1 + (lon2 - lon1) * t0, r, a);
        latLonToVec3(lat1 + (lat2 - lat1) * t1, lon1 + (lon2 - lon1) * t1, r, b);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

function multiLines(geom: GeoJSON.Geometry | null): LineCoords {
  if (!geom) return [];
  if (geom.type === "MultiLineString") return geom.coordinates as LineCoords;
  if (geom.type === "LineString") return [geom.coordinates as number[][]];
  return [];
}

export interface GlobeLayers {
  coast: THREE.BufferGeometry;
  borders: THREE.BufferGeometry;
  graticule: THREE.BufferGeometry;
  land: THREE.CanvasTexture;
}

let cached: Promise<GlobeLayers> | null = null;

/** Coastlines, borders and the land mask, fetched once (Natural Earth via world-atlas). */
export function loadGlobeLayers(): Promise<GlobeLayers> {
  if (!cached) {
    const base = import.meta.env.BASE_URL;
    cached = Promise.all([
      fetch(`${base}geo/land-50m.json`).then((r) => r.json()),
      fetch(`${base}geo/countries-110m.json`).then((r) => r.json()),
    ]).then(([l, c]) => buildLayers(l as Topology, c as Topology));
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

function buildLayers(land: Topology, countries: Topology): GlobeLayers {
  const coastGeom = mesh(land, land.objects.land as GeometryCollection);
  const borderGeom = mesh(
    countries,
    countries.objects.countries as GeometryCollection,
    (a: unknown, b: unknown) => a !== b,
  );
  const grat = geoGraticule10();
  // A 30-degree graticule reads as an instrument scale without cluttering the data.
  const gratLines = (grat.coordinates as LineCoords).filter((line) => {
    const lonConst = line.every((p) => p[0] === line[0][0]);
    const latConst = line.every((p) => p[1] === line[0][1]);
    if (lonConst) return Math.round(line[0][0]) % 30 === 0;
    if (latConst) return Math.round(line[0][1]) % 30 === 0;
    return false;
  });

  // Land mask texture in equirectangular space for the base shading.
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const proj = geoEquirectangular()
    .scale(W / (2 * Math.PI))
    .translate([W / 2, H / 2]);
  const path = geoPath(proj, ctx);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  path(feature(land, land.objects.land as GeometryCollection) as unknown as GeoJSON.FeatureCollection);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;

  return {
    coast: linesToGeometry(multiLines(coastGeom), 1.0015),
    borders: linesToGeometry(multiLines(borderGeom), 1.0015),
    graticule: linesToGeometry(gratLines, 1.001),
    land: tex,
  };
}

/** Great-circle distance in degrees. */
export function angularDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const a = latLonToVec3(lat1, lon1);
  const b = latLonToVec3(lat2, lon2);
  return Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) / DEG;
}
