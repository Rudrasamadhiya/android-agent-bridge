"use client";
import dynamic from "next/dynamic";
import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { APK_SIZE, NPM, VERSION } from "@/lib/site";
import { useStats } from "@/lib/useStats";
import CopyCmd from "./CopyCmd";

const PhoneScene = dynamic(() => import("./PhoneScene"), { ssr: false });

const ease = [0.2, 0.7, 0.2, 1] as const;

function Letters({ text, delay = 0, className = "" }: { text: string; delay?: number; className?: string }) {
  return (
    <span className={`hero-line ${className}`} aria-hidden="true">
      {[...text].map((c, i) => (
        <motion.span
          key={i}
          initial={{ y: "110%", rotate: i % 2 ? 6 : -6 }}
          animate={{ y: "0%", rotate: 0 }}
          transition={{ duration: 1, delay: delay + i * 0.055, ease }}
        >
          {c}
        </motion.span>
      ))}
    </span>
  );
}

const INSTALL = [
  { id: "npx", label: "npx", cmd: "npx android-agent-bridge start" },
  { id: "npm", label: "npm", cmd: "npm i -g android-agent-bridge" },
  { id: "usb", label: "USB setup", cmd: "npx android-agent-bridge usb" },
  { id: "mcp", label: "MCP", cmd: "npx android-agent-bridge init" },
];

export default function Hero() {
  const stats = useStats();
  const [tab, setTab] = useState("npx");
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const [taps, setTaps] = useState(0);
  const [lat, setLat] = useState(12);
  useEffect(() => {
    const id = setInterval(() => { setTaps((n) => n + 1 + Math.floor(Math.random() * 4)); setLat(8 + Math.floor(Math.random() * 14)); }, 450);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="hero" ref={ref}>
      <div className="hero-bg" aria-hidden="true" />
      <div className="hero-canvas"><PhoneScene /></div>

      <motion.div className="hud hud-l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} aria-hidden="true">
        Subject: your phone<br />Status: <b>awaiting agent</b><br />Link: Wi-Fi · USB
      </motion.div>
      <motion.div className="hud hud-r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} aria-hidden="true">
        Taps <b>{String(taps).padStart(6, "0")}</b><br />Latency <b>{String(lat).padStart(3, "0")}</b>ms<br />Android <b>5.0+</b>
      </motion.div>

      <motion.div className="wrap hero-text" style={{ y: textY, opacity: fade }}>
        <motion.a className="pill" href={NPM} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7, ease }}>
          <span className="pill-dot" /> v{VERSION} is live on npm <span className="pill-arrow">→</span>
        </motion.a>
        <h1 className="hero-title">
          <span className="sr-only">Agent Bridge: give your AI agent a real phone</span>
          <Letters text="AGENT" delay={0.15} />
          <Letters text="BRIDGE" delay={0.4} className="accent" />
        </h1>
        <motion.p className="hero-sub" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.8, ease }}>
          Give your AI agent <em>a real phone.</em> Claude Code, Cursor, Antigravity and any MCP client can see your Android screen, tap, type, open apps and move files.
        </motion.p>

        <motion.div className="hero-actions" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, duration: 0.8, ease }}>
          <a className="btn btn-lime" href={stats.apkUrl} download>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4M5 19h14" /></svg>
            Download for Android
            <span className="btn-meta">APK · {APK_SIZE}</span>
          </a>
          <div className="install">
            <div className="install-tabs" role="tablist">
              {INSTALL.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                  {tab === t.id && <motion.i layoutId="tab-ind" className="tab-ind" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                </button>
              ))}
            </div>
            <CopyCmd cmd={INSTALL.find((t) => t.id === tab)!.cmd} />
          </div>
        </motion.div>

        <motion.div className="hero-stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
          <span><b>{stats.apk?.toLocaleString() ?? "—"}</b> app downloads</span>
          <span><b>{stats.npm?.toLocaleString() ?? "—"}</b> npm installs</span>
          <span><b>{stats.stars?.toLocaleString() ?? "—"}</b> GitHub stars</span>
          <span><b>MIT</b> open source</span>
        </motion.div>
      </motion.div>

      <div className="scroll-cue" aria-hidden="true"><span>Scroll</span><i /></div>
    </header>
  );
}
