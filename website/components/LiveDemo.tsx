"use client";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { asset } from "@/lib/site";
import Rain from "./Rain";

type Box = { n: number; x: number; y: number; w: number; h: number; label: string };
type Step = { title: string; body: string; img: string; cmd: string; out: string[]; boxes: Box[]; tap?: [number, number] };

// A real session, recorded on a Samsung A70 running Uber. Boxes are in % of the screen.
const STEPS: Step[] = [
  {
    title: "Open", body: "It launches any app by name, then reads the screen as a numbered list.", img: "uber-home",
    cmd: "phonectl launch Uber", out: ["Opened Uber (com.ubercab)", '[18] item "Where to?" @540,355', '[2] item "DB Mall · Zone-I" @540,563'],
    boxes: [{ n: 18, x: 4, y: 11, w: 92, h: 7, label: "Where to?" }, { n: 2, x: 4, y: 20, w: 92, h: 7, label: "DB Mall" }, { n: 6, x: 4, y: 38, w: 92, h: 18, label: "Payment" }],
  },
  {
    title: "Tap", body: "By number, by visible text or by position. It knows what is covered and never taps behind a sheet.", img: "uber-plan-trip",
    cmd: 'phonectl tap "Where to?"', out: ["Tapped at 540,355", '[16] input "Where to?" @518,590', '[2] button "DB Mall, Zone-I" @540,733'],
    boxes: [{ n: 16, x: 4, y: 19, w: 86, h: 7.5, label: "input" }, { n: 2, x: 4, y: 28, w: 92, h: 5.5, label: "DB Mall" }, { n: 3, x: 4, y: 34, w: 92, h: 6, label: "" }],
    tap: [50, 15],
  },
  {
    title: "Choose", body: "It compares options like you would, reading prices and times straight off the screen.", img: "uber-choose-trip",
    cmd: "phonectl tap 2", out: ["Tapped DB Mall", '[4] item "Uber Go · ₹112.00 · 5 min"', '[5] item "Premier · ₹120.26"', '[6] item "Auto · ₹136.92 · Faster"'],
    boxes: [{ n: 4, x: 2, y: 44.5, w: 96, h: 12.5, label: "Uber Go" }, { n: 5, x: 2, y: 58, w: 96, h: 8.5, label: "Premier" }, { n: 6, x: 2, y: 68, w: 96, h: 10, label: "Auto" }],
    tap: [50, 30.5],
  },
  {
    title: "Act", body: "And it asks you before anything that costs money. Here you said yes.", img: "uber-finding-ride",
    cmd: 'phonectl tap "Choose Uber Go"', out: ["Tapped at 540,2290", 'phonectl wait "Confirming"', "✓ Confirming your trip"],
    boxes: [{ n: 1, x: 10, y: 68.5, w: 80, h: 6, label: "status" }],
    tap: [50, 95],
  },
];

const EASE = [0.25, 0.8, 0.25, 1] as const;

export default function LiveDemo() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [i, setI] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => setI(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length * 0.999))));
  // springs smooth out the scroll-linked motion so it glides instead of tracking every wheel tick
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.5 });
  const bar = useTransform(smooth, [0, 1], ["0%", "100%"]);
  const rot = useTransform(smooth, [0, 1], [-3, 3]);
  const lift = useTransform(smooth, [0, 0.5, 1], [24, 0, -24]);
  const s = STEPS[i];

  return (
    <section className="demo" ref={ref} id="demo">
      <div className="demo-stick">
        <Rain />
        <div className="demo-fade" aria-hidden="true" />
        <div className="wrap demo-grid">
          <div className="demo-copy">
            <p className="eyebrow">Live session · recorded on a real phone</p>
            <div className="demo-num" aria-hidden="true">
              <AnimatePresence mode="popLayout">
                <motion.span key={i} initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-100%", opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
                  {String(i + 1).padStart(2, "0")}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="swap">
              <AnimatePresence initial={false}>
                <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }}>
                  <h3 className="demo-title">{s.title}</h3>
                  <p className="demo-body">{s.body}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="demo-steps">
              {STEPS.map((st, k) => <span key={k} className={k === i ? "on" : k < i ? "done" : ""}>{st.title}</span>)}
            </div>
            <div className="demo-bar"><motion.i style={{ width: bar }} /></div>
          </div>

          <div className="demo-term">
            <div className="term-bar"><i /><i /><i /><span>claude → phone</span></div>
            <div className="swap">
            <AnimatePresence initial={false}>
              <motion.div key={i} className="term-body" initial="h" animate="v" exit={{ opacity: 0, transition: { duration: 0.2 } }} variants={{ v: { transition: { staggerChildren: 0.07 } } }}>
                <motion.div className="t-in" variants={{ h: { opacity: 0, x: -6 }, v: { opacity: 1, x: 0, transition: { duration: 0.25 } } }}>{s.cmd}</motion.div>
                {s.out.map((o, k) => (
                  <motion.div key={k} className={o.startsWith("✓") ? "t-ok" : o.startsWith("phonectl") ? "t-in" : "t-out"} variants={{ h: { opacity: 0, x: -6 }, v: { opacity: 1, x: 0, transition: { duration: 0.25 } } }}>{o}</motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
            </div>
          </div>

          <motion.div className="demo-phone" style={{ rotate: rot, y: lift }}>
            <div className="device">
              <div className="device-screen">
                <AnimatePresence mode="popLayout">
                  <motion.img key={s.img} src={asset(`/screens/${s.img}.webp`)} alt={`Uber, ${s.title} step`} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} />
                </AnimatePresence>
                <AnimatePresence>
                  {s.boxes.map((b, k) => (
                    <motion.div key={`${i}-${b.n}`} className="el-box" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
                      initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.15 + k * 0.07, duration: 0.3, ease: EASE }}>
                      <span>{b.n}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {s.tap && <motion.i key={`tap-${i}`} className="tap-ring" style={{ left: `${s.tap[0]}%`, top: `${s.tap[1]}%` }} initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.8, ease: "easeOut" }} />}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
