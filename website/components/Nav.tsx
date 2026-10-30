"use client";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useState } from "react";
import { GITHUB, NPM, asset } from "@/lib/site";
import { useStats } from "@/lib/useStats";

const LINKS = [
  ["Demo", "/#demo"],
  ["Features", "/#features"],
  ["Quick start", "/#start"],
  ["Docs", "/docs/"],
  ["Download", "/download/"],
];

export default function Nav() {
  const stats = useStats();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(!open && y > prev && y > 400);
    setSolid(y > 20);
  });
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);

  return (
    <>
      <motion.nav className={`nav ${solid || open ? "solid" : ""}`} animate={{ y: hidden ? -90 : 0 }} transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }} aria-label="Main">
        <div className="nav-in">
          <Link className="brand" href="/" onClick={() => setOpen(false)}><img src={asset("/icon.svg")} alt="" width={28} height={28} />Agent Bridge</Link>
          <div className="nav-links">
            {LINKS.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}
          </div>
          <div className="nav-right">
            <a className="btn btn-ghost btn-sm gh" href={GITHUB}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z" /></svg>
              {stats.stars != null ? stats.stars.toLocaleString() : "Star"}
            </a>
            <Link className="btn btn-lime btn-sm" href="/download/" onClick={() => setOpen(false)}>Get the app</Link>
            <button className={`burger ${open ? "on" : ""}`} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
              <i /><i />
            </button>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div className="sheet" initial={{ clipPath: "circle(0% at 92% 4%)" }} animate={{ clipPath: "circle(150% at 92% 4%)" }} exit={{ clipPath: "circle(0% at 92% 4%)" }} transition={{ duration: 0.6, ease: [0.7, 0, 0.2, 1] }}>
            <nav className="sheet-links" aria-label="Menu">
              {LINKS.map(([t, h], i) => (
                <span className="mask" key={h}>
                  <motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }} style={{ display: "inline-block" }}>
                    <Link href={h} onClick={() => setOpen(false)}>{t}</Link>
                  </motion.span>
                </span>
              ))}
            </nav>
            <motion.div className="sheet-foot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <a href={GITHUB}>GitHub</a><a href={NPM}>npm</a><a href={`${GITHUB}/releases`}>Releases</a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
