import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { globeLayers, latLonToVec3, vec3ToLatLon } from "./geo";
import { createEarthMaterial } from "./earthMaterial";
import { packField, rampTexture } from "./dataTexture";
import type { GridGeom } from "../../lib/data/grids";
import type { RampKind } from "../../lib/color/ramps";

export interface GlobeField {
  key: string;
  geom: GridGeom;
  values: ArrayLike<number>;
  sig?: ArrayLike<number>;
  scale: number;
  ramp: RampKind;
}

export interface GlobePin {
  id: string;
  lat: number;
  lon: number;
  tone?: "primary" | "secondary";
}

export interface GlobeArc {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
}

export interface GlobeView {
  lat: number;
  lon: number;
  distance: number;
}

interface GlobeProps {
  field: GlobeField | null;
  sigOnly?: boolean;
  view: GlobeView;
  /** bump to force a fly-to even when view values repeat */
  viewNonce?: number;
  pins?: GlobePin[];
  arcs?: GlobeArc[];
  idleSpin?: boolean;
  /** horizontal shift of the globe centre in CSS pixels (positive = right) */
  shiftX?: number;
  shiftY?: number;
  onPick?: (lat: number, lon: number) => void;
  onViewChange?: (v: GlobeView) => void;
  onHover?: (pos: { lat: number; lon: number } | null) => void;
  className?: string;
  label?: string;
}

const MIN_D = 1.55;
const MAX_D = 6;

function Earth({
  field,
  sigOnly,
  view,
  viewNonce,
  pins,
  arcs,
  idleSpin,
  onPick,
  onViewChange,
  onHover,
}: Omit<GlobeProps, "className" | "label" | "shiftX" | "shiftY">) {
  const layers = useMemo(() => globeLayers(), []);
  const material = useMemo(() => createEarthMaterial(layers.land), [layers]);
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();

  // Orientation state, animated toward the target.
  const st = useRef({
    lat: view.lat,
    lon: view.lon,
    dist: view.distance,
    tLat: view.lat,
    tLon: view.lon,
    tDist: view.distance,
    vLon: 0,
    vLat: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    downX: 0,
    downY: 0,
    moved: 0,
    idleSince: performance.now(),
    flying: false,
  });

  useEffect(() => {
    const s = st.current;
    s.tLat = view.lat;
    s.tLon = nearestLon(s.lon, view.lon);
    s.tDist = view.distance;
    s.flying = true;
    s.idleSince = performance.now();
  }, [view.lat, view.lon, view.distance, viewNonce]);

  // Field textures with a crossfade between variables.
  const texRef = useRef<{ key: string; tex: THREE.DataTexture } | null>(null);
  const mixRef = useRef(1);
  useEffect(() => {
    const u = material.uniforms;
    if (!field) {
      u.uHasData.value = 0;
      return;
    }
    const prev = texRef.current;
    const sameShape =
      prev && prev.key.split("|")[0] === field.key.split("|")[0] && prev.tex.image.width === field.geom.nlon * 4;
    if (prev && sameShape && field.key.includes("|year") && prev.key.includes("|year")) {
      // time-lapse frames reuse the texture without a crossfade
      const t = packField(field.geom, field.values, field.scale, field.sig, prev.tex);
      u.uData.value = t;
      texRef.current = { key: field.key, tex: t };
      u.uRamp.value = rampTexture(field.ramp);
      return;
    }
    const tex = packField(field.geom, field.values, field.scale, field.sig);
    if (prev) {
      u.uPrev.value = prev.tex;
      u.uPrevRamp.value = u.uRamp.value;
      (u.uPrevGeom.value as THREE.Vector4).copy(u.uGeom.value);
      (u.uPrevGeom2.value as THREE.Vector2).copy(u.uGeom2.value);
      u.uHasPrev.value = 1;
      mixRef.current = 0;
    }
    u.uData.value = tex;
    u.uRamp.value = rampTexture(field.ramp);
    (u.uGeom.value as THREE.Vector4).set(field.geom.lat0, field.geom.dlat, field.geom.nlat, field.geom.lon0);
    (u.uGeom2.value as THREE.Vector2).set(field.geom.dlon, field.geom.nlon);
    u.uHasData.value = 1;
    texRef.current = { key: field.key, tex };
  }, [field, material]);

  useEffect(() => {
    material.uniforms.uSigOnly.value = sigOnly ? 1 : 0;
  }, [sigOnly, material]);

  // Wheel zoom and window-level drag tracking.
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = st.current;
      s.tDist = clamp(s.tDist * Math.exp(e.deltaY * 0.0012), MIN_D, MAX_D);
      s.flying = false;
      s.idleSince = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      const s = st.current;
      if (!s.dragging) return;
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.moved += Math.abs(dx) + Math.abs(dy);
      const k = (0.16 * (s.dist - 0.6)) / 2.2;
      s.tLon = s.lon = s.lon - dx * k;
      s.tLat = s.lat = clamp(s.lat + dy * k, -80, 80);
      s.vLon = -dx * k;
      s.vLat = dy * k;
    };
    const onUp = () => {
      const s = st.current;
      if (!s.dragging) return;
      s.dragging = false;
      s.idleSince = performance.now();
      el.style.cursor = "";
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gl]);

  const lastReport = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const now = performance.now();
    if (!s.dragging) {
      // inertia after a drag
      if (Math.abs(s.vLon) > 0.001 || Math.abs(s.vLat) > 0.001) {
        s.lon += s.vLon;
        s.lat = clamp(s.lat + s.vLat, -80, 80);
        s.tLon = s.lon;
        s.tLat = s.lat;
        s.vLon *= 0.92;
        s.vLat *= 0.92;
      }
      const ease = 1 - Math.exp(-dt * (s.flying ? 3.2 : 8));
      s.lat += (s.tLat - s.lat) * ease;
      s.lon += (s.tLon - s.lon) * ease;
      if (s.flying && Math.abs(s.tLat - s.lat) < 0.01 && Math.abs(s.tLon - s.lon) < 0.01) s.flying = false;
      if (idleSpin && !s.flying && now - s.idleSince > 4000) {
        s.lon += dt * 3.2;
        s.tLon = s.lon;
      }
    }
    s.dist += (s.tDist - s.dist) * (1 - Math.exp(-dt * 6));
    camera.position.set(0, 0, s.dist);
    camera.lookAt(0, 0, 0);
    if (group.current) {
      group.current.rotation.set((s.lat * Math.PI) / 180, -Math.PI / 2 - (s.lon * Math.PI) / 180, 0, "XYZ");
    }
    if (mixRef.current < 1) {
      mixRef.current = Math.min(1, mixRef.current + dt / 0.55);
      material.uniforms.uMix.value = 1 - Math.pow(1 - mixRef.current, 3);
      if (mixRef.current >= 1) material.uniforms.uHasPrev.value = 0;
    }
    if (onViewChange && now - lastReport.current > 250) {
      lastReport.current = now;
      onViewChange({ lat: s.lat, lon: wrapLon(s.lon), distance: s.dist });
    }
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    s.dragging = true;
    s.lastX = s.downX = e.clientX;
    s.lastY = s.downY = e.clientY;
    s.moved = 0;
    s.vLon = s.vLat = 0;
    s.flying = false;
    gl.domElement.style.cursor = "grabbing";
  };

  const onUpMesh = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    if (s.moved < 6 && mesh.current && onPick) {
      const local = mesh.current.worldToLocal(e.point.clone());
      const { lat, lon } = vec3ToLatLon(local);
      onPick(lat, lon);
    }
  };

  const onMoveMesh = (e: ThreeEvent<PointerEvent>) => {
    if (!onHover || !mesh.current || st.current.dragging) return;
    const local = mesh.current.worldToLocal(e.point.clone());
    onHover(vec3ToLatLon(local));
  };

  return (
    <group ref={group}>
      <mesh
        ref={mesh}
        material={material}
        onPointerDown={onDown}
        onPointerUp={onUpMesh}
        onPointerMove={onMoveMesh}
        onPointerOut={() => onHover?.(null)}
      >
        <sphereGeometry args={[1, 256, 128]} />
      </mesh>
      <lineSegments geometry={layers.graticule}>
        <lineBasicMaterial color="#ece8e1" transparent opacity={0.06} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={layers.coast}>
        <lineBasicMaterial color="#ece8e1" transparent opacity={0.34} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={layers.borders}>
        <lineBasicMaterial color="#ece8e1" transparent opacity={0.12} depthWrite={false} />
      </lineSegments>
      {pins?.map((p) => <Pin key={p.id} pin={p} />)}
      {arcs?.map((a, i) => <Arc key={i} arc={a} />)}
    </group>
  );
}

function Pin({ pin }: { pin: GlobePin }) {
  const ref = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const born = useRef(performance.now());
  const pos = useMemo(() => latLonToVec3(pin.lat, pin.lon, 1.004), [pin.lat, pin.lon]);
  useEffect(() => {
    born.current = performance.now();
  }, [pin.lat, pin.lon]);
  useEffect(() => {
    ref.current?.lookAt(pos.clone().multiplyScalar(2));
  }, [pos]);
  useFrame(() => {
    const t = ((performance.now() - born.current) / 1000) % 2.4;
    if (ring.current) {
      const k = Math.min(1, t / 1.4);
      const sc = 1 + k * 3.2;
      ring.current.scale.set(sc, sc, 1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7;
    }
  });
  const color = pin.tone === "secondary" ? "#a8adb5" : "#ece8e1";
  return (
    <group ref={ref} position={pos}>
      <mesh>
        <circleGeometry args={[0.009, 32]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh>
        <ringGeometry args={[0.014, 0.017, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.014, 0.0165, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Arc({ arc }: { arc: GlobeArc }) {
  const geom = useMemo(() => {
    const a = latLonToVec3(arc.from.lat, arc.from.lon, 1);
    const b = latLonToVec3(arc.to.lat, arc.to.lon, 1);
    const pts: THREE.Vector3[] = [];
    const angle = a.angleTo(b);
    for (let i = 0; i <= 96; i++) {
      const t = i / 96;
      const v = new THREE.Vector3().copy(a).multiplyScalar(Math.sin((1 - t) * angle))
        .add(new THREE.Vector3().copy(b).multiplyScalar(Math.sin(t * angle)))
        .divideScalar(Math.sin(angle) || 1)
        .normalize();
      v.multiplyScalar(1.004 + Math.sin(Math.PI * t) * 0.12 * Math.min(1, angle));
      pts.push(v);
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [arc.from.lat, arc.from.lon, arc.to.lat, arc.to.lon]);
  return (
    <primitive
      object={new THREE.Line(geom, new THREE.LineDashedMaterial({ color: "#ece8e1", dashSize: 0.02, gapSize: 0.014, transparent: true, opacity: 0.7 }))}
      onUpdate={(l: THREE.Line) => l.computeLineDistances()}
    />
  );
}

function ViewShift({ shiftX = 0, shiftY = 0 }: { shiftX?: number; shiftY?: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (shiftX || shiftY) {
      cam.setViewOffset(size.width, size.height, -shiftX, -shiftY, size.width, size.height);
    } else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, shiftX, shiftY]);
  return null;
}

export default function Globe({ className, label, shiftX, shiftY, ...rest }: GlobeProps) {
  return (
    <div className={className} role="application" aria-label={label ?? "Interactive globe. Drag to rotate, scroll to zoom, click a place to investigate it."}>
      <Canvas
        camera={{ fov: 32, near: 0.1, far: 50, position: [0, 0, rest.view.distance] }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ touchAction: "none" }}
      >
        <ViewShift shiftX={shiftX} shiftY={shiftY} />
        <Earth {...rest} />
      </Canvas>
    </div>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function wrapLon(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function nearestLon(current: number, target: number) {
  let t = target;
  while (t - current > 180) t -= 360;
  while (t - current < -180) t += 360;
  return t;
}
