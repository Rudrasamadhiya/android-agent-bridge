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
const FROM_IN = new THREE.Vector3(-7.5, -1.2, -1.5), FROM_OUT = new THREE.Vector3(-7.5, 1.6, -2);

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

// A stream of glowing points flying along curves, from the computer into the phone (or back out).
function Stream({ count, from, color, reverse = false, speed = 0.18 }: { count: number; from: THREE.Vector3; color: string; reverse?: boolean; speed?: number }) {
  const ref = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    const starts: THREE.Vector3[] = [], mids: THREE.Vector3[] = [], ends: THREE.Vector3[] = [], t = new Float32Array(count), v = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      starts.push(from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 2)));
      ends.push(new THREE.Vector3((Math.random() - 0.5) * SW * 0.9, (Math.random() - 0.5) * SH * 0.9, D / 2 + 0.02));
      mids.push(new THREE.Vector3(from.x * 0.45 + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4, 1.6 + Math.random() * 1.6));
      t[i] = Math.random();
      v[i] = speed * (0.5 + Math.random());
    }
    return { starts, mids, ends, t, v, pos: new Float32Array(count * 3) };
  }, [count, from, speed]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const { starts, mids, ends, t, v, pos } = data;
    for (let i = 0; i < count; i++) {
      t[i] = (t[i] + v[i] * Math.min(dt, 0.05)) % 1;
      const k = reverse ? 1 - t[i] : t[i];
      const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
      tmp.set(0, 0, 0).addScaledVector(starts[i], a).addScaledVector(mids[i], b).addScaledVector(ends[i], c);
      pos[i * 3] = tmp.x; pos[i * 3 + 1] = tmp.y; pos[i * 3 + 2] = tmp.z;
    }
    if (ref.current) ref.current.geometry.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.055} sizeAttenuation transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
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
      <Stream count={narrow ? 260 : 520} from={FROM_IN} color="#3ddc97" />
      <Stream count={narrow ? 120 : 240} from={FROM_OUT} color="#7aa7ff" reverse speed={0.14} />
    </group>
  );
}

function Scene() {
  const ptr = usePointer();
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <pointLight position={[-4, -2, 3]} intensity={30} color="#3ddc97" />
      <pointLight position={[4, 3, -2]} intensity={20} color="#7aa7ff" />
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
