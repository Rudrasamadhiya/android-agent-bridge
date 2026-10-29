"use client";
import { useEffect, useRef } from "react";

// Falling green streaks, like the phone's signal raining down. Pauses when off screen.
export default function Rain({ density = 18, className = "" }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let w = 0, h = 0, raf = 0, visible = true;
    let drops: { x: number; y: number; l: number; v: number; g: boolean }[] = [];
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = Array.from({ length: Math.round(w / density) }, () => ({ x: Math.random() * w, y: Math.random() * h, l: 40 + Math.random() * 160, v: 2 + Math.random() * 7, g: Math.random() < 0.22 }));
    };
    const frame = () => {
      if (visible) {
        ctx.clearRect(0, 0, w, h);
        for (const d of drops) {
          d.y += d.v;
          if (d.y - d.l > h) { d.y = -10; d.x = Math.random() * w; }
          const grad = ctx.createLinearGradient(0, d.y - d.l, 0, d.y);
          grad.addColorStop(0, "rgba(61,220,151,0)");
          grad.addColorStop(1, d.g ? "rgba(184,255,92,.6)" : "rgba(61,220,151,.22)");
          ctx.strokeStyle = grad; ctx.lineWidth = d.g ? 1.5 : 1;
          ctx.beginPath(); ctx.moveTo(d.x, d.y - d.l); ctx.lineTo(d.x, d.y); ctx.stroke();
        }
      }
      raf = requestAnimationFrame(frame);
    };
    size();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);
    addEventListener("resize", size);
    frame();
    return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener("resize", size); };
  }, [density]);
  return <canvas ref={ref} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}
