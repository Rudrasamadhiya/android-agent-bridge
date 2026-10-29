"use client";
import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStats } from "@/lib/useStats";
import { Title } from "./Sections";

const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.+,";
const CELLS = 9;

// One row of split-flap tiles that spin through letters before settling on the value.
function Flaps({ value, go }: { value: string; go: boolean }) {
  const target = value.toUpperCase().padStart(CELLS, " ").slice(-CELLS);
  const [shown, setShown] = useState(" ".repeat(CELLS));
  const [flip, setFlip] = useState<number[]>([]);
  useEffect(() => {
    if (!go) return;
    const left = [...target].map((_, k) => 5 + k * 2 + Math.floor(Math.random() * 5));
    const id = setInterval(() => {
      const busy = left.some((n) => n > 0);
      setShown([...target].map((c, k) => (left[k] > 0 ? CHARS[Math.floor(Math.random() * CHARS.length)] : c)).join(""));
      setFlip(left.map((n, k) => (n > 0 ? k : -1)).filter((k) => k >= 0));
      left.forEach((n, k) => { if (n > 0) left[k] = n - 1; });
      if (!busy) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, [target, go]);
  return (
    <div className="flaps">
      {[...shown].map((c, k) => <span key={k} className={`flap ${/[0-9+]/.test(c) ? "g" : ""} ${flip.includes(k) ? "flip" : ""}`}>{c}</span>)}
    </div>
  );
}

export default function Board() {
  const s = useStats();
  const ref = useRef<HTMLDivElement>(null);
  const go = useInView(ref, { once: true, amount: 0.3 });
  const n = (v?: number) => (v == null ? (s.loaded ? "0" : "") : v.toLocaleString("en-US"));
  const rows: [string, string][] = [
    ["App downloads", n(s.apk)],
    ["npm installs · 12 mo", n(s.npm)],
    ["GitHub stars", n(s.stars)],
    ["Agent tools", "30+"],
    ["Oldest Android", "5.0 2015"],
    ["Price", "FREE MIT"],
  ];
  return (
    <section className="sec" id="numbers">
      <div className="wrap">
        <p className="eyebrow">The numbers · live from GitHub and npm</p>
        <Title>Departures *board*</Title>
        <div className="board" ref={ref}>
          <div className="board-head"><span>Flight AB-01 · computer → phone</span><span className="blink">Boarding</span></div>
          {rows.map(([k, v]) => (
            <div className="brow" key={k}><label>{k}</label><Flaps value={v} go={go && v !== ""} /></div>
          ))}
        </div>
      </div>
    </section>
  );
}
