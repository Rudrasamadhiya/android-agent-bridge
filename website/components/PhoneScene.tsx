"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, useTexture } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { asset } from "@/lib/site";

// The hero only ever shows Agent Bridge's own app.
const SCREENS = ["app-connect", "app-transfer", "app-device"].map((n) => asset(`/screens/${n}.webp`));
const W = 1.62, H = 3.36, D = 0.17;
const SW = W - 0.12, SH = Math.min(H - 0.12, SW * (2000 / 900));
const FIELD_Z = -1.6;

// Cursor in normalised device coordinates, tracked on the whole window (the hero text sits
// above the canvas). With no mouse (phones), a virtual cursor drifts in slow loops instead.
function usePointer() {
  const p = useRef({ x: 0, y: 0, last: -1e9 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      p.current.x = (e.clientX / innerWidth) * 2 - 1;
      p.current.y = -(e.clientY / innerHeight) * 2 + 1;
      p.current.last = performance.now();
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, []);
  return p;
}

type Ptr = ReturnType<typeof usePointer>;

function cursor(ptr: Ptr, t: number) {
  const idle = performance.now() - ptr.current.last > 2500;
  if (!idle) return { x: ptr.current.x, y: ptr.current.y, live: true };
  return { x: Math.sin(t * 0.35) * 0.55, y: Math.sin(t * 0.5) * 0.35, live: false };
}

// A field of short dashes that the cursor pushes around. Each one is a spring tied to its
// home spot: the cursor repels it, the spring pulls it back, damping settles it.
function Field({ ptr, count }: { ptr: Ptr; count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { viewport, camera, size } = useThree();
  const vp = viewport.getCurrentViewport(camera, new THREE.Vector3(0, 0, FIELD_Z));
  const sim = useMemo(() => {
    const home = new Float32Array(count * 2), pos = new Float32Array(count * 2), vel = new Float32Array(count * 2), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // denser in a soft ring around the middle, sparse at the edges
      const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.7);
      home[i * 2] = Math.cos(a) * r * vp.width * 0.62;
      home[i * 2 + 1] = Math.sin(a) * r * vp.height * 0.62;
      pos[i * 2] = home[i * 2] * 1.6;
      pos[i * 2 + 1] = home[i * 2 + 1] * 1.6;
      seed[i] = Math.random() * 100;
    }
    return { home, pos, vel, seed };
    // rebuild the layout only when the canvas size changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, size.width, size.height]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const palette = ["#3ddc97", "#3ddc97", "#3ddc97", "#b8ff5c", "#7aa7ff", "#5b6370"].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) m.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [count]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m) return;
    const k = Math.min(dt, 1 / 30) * 60; // frame-rate independent steps
    const t = state.clock.elapsedTime;
    const c = cursor(ptr, t);
    const mx = (c.x * vp.width) / 2, my = (c.y * vp.height) / 2;
    const R = Math.min(vp.width, vp.height) * 0.26, R2 = R * R;
    const { home, pos, vel, seed } = sim;
    for (let i = 0; i < count; i++) {
      const ix = i * 2, iy = ix + 1;
      const hx = home[ix] + Math.sin(t * 0.6 + seed[i]) * 0.06, hy = home[iy] + Math.cos(t * 0.5 + seed[i]) * 0.06;
      let vx = vel[ix] + (hx - pos[ix]) * 0.018 * k, vy = vel[iy] + (hy - pos[iy]) * 0.018 * k;
      const dx = pos[ix] - mx, dy = pos[iy] - my, d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 1e-5) {
        const d = Math.sqrt(d2), f = (1 - d / R) * (c.live ? 0.05 : 0.025) * k;
        vx += (dx / d) * f; vy += (dy / d) * f;
      }
      const damp = Math.pow(0.9, k);
      vx *= damp; vy *= damp;
      pos[ix] += vx * k; pos[iy] += vy * k;
      vel[ix] = vx; vel[iy] = vy;
      // dashes point at the cursor and stretch with speed
      const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / (R * 1.2));
      dummy.position.set(pos[ix], pos[iy], FIELD_Z);
      dummy.rotation.set(0, 0, Math.atan2(dy, dx));
      const speed = Math.min(1, Math.hypot(vx, vy) * 18);
      dummy.scale.set(0.3 + near * 1.6 + speed * 1.6, 0.7 + near * 0.6, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[0.09, 0.02]} />
      <meshBasicMaterial transparent opacity={0.7} toneMapped={false} depthWrite={false} />
    </instancedMesh>
  );
}

// Rings that bloom where the agent "taps" on the screen.
function Taps() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const state = useRef([0, 0.33, 0.66].map((p) => ({ p, x: 0, y: 0 })));
  useFrame((_, dt) => {
    state.current.forEach((s, i) => {
      s.p += dt * 0.7;
      if (s.p > 1) { s.p = 0; s.x = (Math.random() - 0.5) * SW * 0.7; s.y = (Math.random() - 0.5) * SH * 0.7; }
      const m = refs.current[i];
      if (!m) return;
      m.position.set(s.x, s.y, D / 2 + 0.012);
      m.scale.setScalar(0.3 + s.p * 1.4);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - s.p) * 0.9;
    });
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m; }}>
          <ringGeometry args={[0.1, 0.13, 40]} />
          <meshBasicMaterial color="#b8ff5c" transparent depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

function Phone({ ptr }: { ptr: Ptr }) {
  const group = useRef<THREE.Group>(null);
  const textures = useTexture(SCREENS);
  textures.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; });
  const [idx, setIdx] = useState(0);
  const screen = useRef<THREE.MeshBasicMaterial>(null);
  const fade = useRef(1);
  const intro = useRef(0);
  // spring state for the tilt: angle and angular velocity on each axis
  const spring = useRef({ ry: Math.PI * 1.4, vy: 0, rx: 0, vx: 0, px: 0, vpx: 0 });
  useEffect(() => {
    const id = setInterval(() => { fade.current = 0; setIdx((i) => (i + 1) % SCREENS.length); }, 2800);
    return () => clearInterval(id);
  }, []);
  const { viewport } = useThree();
  const narrow = viewport.width < 6;

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const k = Math.min(dt, 1 / 30) * 60;
    const scroll = Math.min(1.5, window.scrollY / window.innerHeight);
    const t = state.clock.elapsedTime;
    const c = cursor(ptr, t);
    intro.current = Math.min(1, intro.current + dt * 0.7);
    const e = 1 - Math.pow(1 - intro.current, 3);
    const s = spring.current;
    // the phone turns to face the cursor; springs give it weight and a little overshoot
    const ty = c.x * 0.75 - 0.3 + scroll * 1.6, tx = -c.y * 0.45 + scroll * 0.35;
    s.vy = (s.vy + (ty - s.ry) * 0.012 * k) * Math.pow(0.86, k);
    s.vx = (s.vx + (tx - s.rx) * 0.012 * k) * Math.pow(0.86, k);
    s.ry += s.vy * k; s.rx += s.vx * k;
    const baseX = narrow ? 0 : Math.min(2.6, viewport.width * 0.23);
    s.vpx = (s.vpx + (baseX + c.x * 0.25 - s.px) * 0.01 * k) * Math.pow(0.85, k);
    s.px += s.vpx * k;
    g.rotation.set(s.rx, s.ry, -0.08 + Math.sin(t * 0.4) * 0.03 - s.vy * 2);
    g.position.set(s.px, Math.sin(t * 0.9) * 0.08 + c.y * 0.12 + scroll * 1.2 + (narrow ? -0.3 : -0.05), 0);
    const sc = narrow ? 0.95 : 1.12;
    g.scale.setScalar(sc * (1 - scroll * 0.12) * (0.5 + 0.5 * e));
    if (screen.current) { fade.current = Math.min(1, fade.current + dt * 3); screen.current.color.setScalar(0.35 + 0.65 * fade.current); }
  });

  return (
    <group ref={group}>
      <RoundedBox args={[W, H, D]} radius={0.17} smoothness={8}>
        <meshStandardMaterial color="#121418" metalness={0.85} roughness={0.28} />
      </RoundedBox>
      <mesh position={[0, 0, D / 2 + 0.001]}>
        <planeGeometry args={[W - 0.06, H - 0.06]} />
        <meshStandardMaterial color="#050607" metalness={0.2} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0, D / 2 + 0.004]}>
        <planeGeometry args={[SW, SH]} />
        <meshBasicMaterial ref={screen} map={textures[idx]} toneMapped={false} />
      </mesh>
      <mesh position={[0, SH / 2 - 0.08, D / 2 + 0.006]}>
        <circleGeometry args={[0.035, 24]} />
        <meshBasicMaterial color="#000" />
      </mesh>
      <mesh position={[W / 2 + 0.01, 0.75, 0]}><boxGeometry args={[0.03, 0.42, 0.07]} /><meshStandardMaterial color="#1a1d22" metalness={0.9} roughness={0.3} /></mesh>
      <mesh position={[W / 2 + 0.01, 0.2, 0]}><boxGeometry args={[0.03, 0.22, 0.07]} /><meshStandardMaterial color="#1a1d22" metalness={0.9} roughness={0.3} /></mesh>
      <Taps />
    </group>
  );
}

function Scene() {
  const ptr = usePointer();
  const { size } = useThree();
  const count = size.width < 700 ? 420 : 1000;
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <pointLight position={[-4, -2, 3]} intensity={30} color="#3ddc97" />
      <pointLight position={[4, 3, -2]} intensity={20} color="#7aa7ff" />
      <Field ptr={ptr} count={count} />
      <Phone ptr={ptr} />
    </>
  );
}

export default function PhoneScene() {
  return (
    <Canvas camera={{ position: [0, 0, 10.5], fov: 35 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} style={{ position: "absolute", inset: 0 }}>
      <Scene />
    </Canvas>
  );
}
