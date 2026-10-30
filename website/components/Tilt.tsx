"use client";
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";

// A card that leans toward the side the cursor is on, with a light glare that follows it.
// Springs give it weight: it lags a little, overshoots, then settles back flat on leave.
export default function Tilt({ children, className = "", max = 9, as = "div" }: { children: ReactNode; className?: string; max?: number; as?: "div" | "article" }) {
  const px = useMotionValue(0.5), py = useMotionValue(0.5);
  const cfg = { stiffness: 170, damping: 14, mass: 0.6 };
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), cfg);
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), cfg);
  const lift = useSpring(0, cfg);
  const gx = useTransform(px, (v) => `${v * 100}%`), gy = useTransform(py, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, rgba(184,255,92,0.14), transparent 60%)`;
  const Comp = as === "article" ? motion.article : motion.div;
  return (
    <Comp
      className={`tilt ${className}`}
      style={{ rotateX: rx, rotateY: ry, z: lift, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
        lift.set(30);
      }}
      onPointerLeave={() => { px.set(0.5); py.set(0.5); lift.set(0); }}
    >
      {children}
      <motion.span className="tilt-glare" style={{ background: glare }} aria-hidden="true" />
    </Comp>
  );
}
