"use client";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { APK_SIZE } from "@/lib/site";
import { useStats } from "@/lib/useStats";
import CopyCmd from "./CopyCmd";
import { Title } from "./Sections";

function Letter({ c, i, p }: { c: string; i: number; p: MotionValue<number> }) {
  const y = useTransform(p, [i * 0.06, 0.55 + i * 0.06], ["100%", "0%"]);
  return <motion.span style={{ y }}>{c}</motion.span>;
}

export default function FinalCta() {
  const stats = useStats();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  return (
    <section className="final">
      <div className="final-glow" aria-hidden="true" />
      <div className="wrap final-inner">
        <p className="hud">Still here? <b>Good.</b></p>
        <Title className="center">Hand your agent *the phone.*</Title>
        <p className="final-sub">Download the app, run one command, scan the code.</p>
        <div className="final-actions">
          <a className="btn btn-lime" href={stats.apkUrl} download>Download for Android <span className="btn-meta">{APK_SIZE}</span></a>
          <CopyCmd cmd="npx android-agent-bridge start" />
        </div>
      </div>
      <div className="bigword" ref={ref} aria-hidden="true">
        {[..."BRIDGE"].map((c, i) => <Letter key={i} c={c} i={i} p={scrollYProgress} />)}
      </div>
    </section>
  );
}
