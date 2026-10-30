"use client";
import { motion, useMotionTemplate, useScroll, useTransform, type MotionValue } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { asset } from "@/lib/site";
import CopyCmd from "./CopyCmd";
import Tilt from "./Tilt";

const ease = [0.2, 0.7, 0.2, 1] as const;

export function Reveal({ children, delay = 0, y = 28, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.9, delay, ease }}>
      {children}
    </motion.div>
  );
}

// Big headline whose words slide up out of a mask when it scrolls into view.
export function Title({ children, className = "" }: { children: string; className?: string }) {
  const parts = children.split(/(\*[^*]+\*)/).filter(Boolean);
  let k = 0;
  return (
    // The heading is observed, not the words: each word sits clipped inside its mask until it rises.
    <motion.h2 className={`disp ${className}`} initial="h" whileInView="v" viewport={{ once: true, amount: 0.2 }}>
      {parts.flatMap((p) => {
        const hl = p.startsWith("*");
        return p.replace(/\*/g, "").split(" ").filter(Boolean).map((w) => (
          <span className="mask" key={k}>
            <motion.span className={hl ? "hl" : ""} variants={{ h: { y: "105%" }, v: { y: "0%" } }} transition={{ duration: 0.9, delay: (k++) * 0.06, ease }}>
              {w}
            </motion.span>
          </span>
        ));
      })}
    </motion.h2>
  );
}

export function Marquee() {
  const items = ["Claude Code", "Cursor", "Antigravity", "Windsurf", "VS Code", "Any MCP client", "Shell scripts", "Samsung", "Pixel", "Xiaomi", "OnePlus", "Motorola"];
  const row = (hidden: boolean) => items.map((t) => <span key={t + hidden} aria-hidden={hidden || undefined}>{t}<i>✦</i></span>);
  return (
    <div className="ticker" aria-label="Works with">
      <div className="ticker-track">{row(false)}{row(true)}</div>
    </div>
  );
}

function Word({ w, range, p, hl }: { w: string; range: [number, number]; p: MotionValue<number>; hl: boolean }) {
  const o = useTransform(p, range, [0.13, 1]);
  return <motion.span style={{ opacity: o }} className={hl ? "hl" : ""}>{w} </motion.span>;
}

export function Manifesto() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const text = "Your agent can write code, search the web and run your terminal. It has never held a phone. *Agent Bridge hands it yours.* It reads the screen, taps, types, opens apps, turns the volume down and sends you the file. No emulator. No cloud. No account. *One npx command and a QR code.*";
  const words: { w: string; hl: boolean }[] = [];
  text.split(/(\*[^*]+\*)/).filter(Boolean).forEach((p) => p.replace(/\*/g, "").split(" ").filter(Boolean).forEach((w) => words.push({ w, hl: p.startsWith("*") })));
  return (
    <section className="manifesto">
      <div className="wrap">
        <p className="hud"><span>File 001</span> · <span>Why this exists</span></p>
        <p className="manifesto-text" ref={ref}>
          {words.map((x, i) => <Word key={i} w={x.w} hl={x.hl} p={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} />)}
        </p>
      </div>
    </section>
  );
}

const FEATURES = [
  { k: "01", t: "Sees the screen", d: "A numbered list of every button, field and line of text, plus screenshots with each element boxed. It knows what is hidden under sheets and dialogs.", tools: ["phone_screen", "phone_elements"], vis: "see" },
  { k: "02", t: "Reads what apps hide", d: "Many apps hide tab bars and buttons from accessibility. On-device OCR reads the pixels, so “tap Account” still works. Nothing leaves the phone.", tools: ["phone_ocr"], vis: "ocr" },
  { k: "03", t: "Acts like a person", d: "Tap by number, text or position. Type straight into fields, scroll, swipe, long-press, Back and Home. Open any app by name or from the Play Store.", tools: ["phone_tap", "phone_type", "phone_open_app"], vis: "act" },
  { k: "04", t: "Runs the device", d: "Volume for every stream, brightness, flashlight, rotation, Do Not Disturb, any settings page, links, the dialer, battery and notifications.", tools: ["phone_volume", "phone_toggle", "phone_settings"], vis: "ctl" },
  { k: "05", t: "AirDrop, both ways", d: "Send from the terminal or drag onto localhost:8350/drop. Share from any phone app to the computer. Wi-Fi, hotspot or USB, no size limit.", tools: ["phone_send_files", "phone_received_files"], vis: "xfer" },
  { k: "06", t: "Old phones welcome", d: "Works back to Android 5.0 from 2015. Where old Android can't do something itself, the computer does it over USB.", tools: ["Android 5 → 16"], vis: "old" },
];

function Visual({ v }: { v: string }) {
  if (v === "see")
    return (
      <div className="vis vis-shot">
        <div className="vis-phone"><img src={asset("/screens/uber-home.webp")} alt="" loading="lazy" />
        {[[4, 11, 92, 7, 18], [4, 20, 92, 7, 2], [4, 27, 92, 7, 4], [4, 38, 92, 18, 6], [3, 64, 22, 13, 9], [27, 64, 22, 13, 10]].map(([x, y, w, h, n], i) => (
          <span key={i} className="el-box pulse" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, animationDelay: `${i * 0.25}s` }}><span>{n}</span></span>
        ))}</div>
      </div>
    );
  if (v === "ocr")
    return (
      <div className="vis vis-shot">
        <div className="vis-phone"><img src={asset("/screens/uber-services-tab.webp")} alt="" loading="lazy" />
        <i className="scanline" />
        <span className="ocr-tag" style={{ top: "5%" }}>“Services” · ocr</span>
        <span className="ocr-tag" style={{ top: "88%" }}>“Account” · ocr</span></div>
      </div>
    );
  if (v === "act") return <div className="vis vis-act"><i /><i /><i /><b>tap 540,355</b></div>;
  if (v === "ctl")
    return (
      <div className="vis vis-ctl">
        {[["Media", 40], ["Ring", 70], ["Bright", 55], ["Alarm", 85]].map(([n, val], i) => (
          <div key={n} className="slider"><span>{n}</span><div><motion.i initial={{ width: "8%" }} whileInView={{ width: `${val}%` }} viewport={{ once: false }} transition={{ duration: 1.2, delay: i * 0.12, ease }} /></div></div>
        ))}
        <div className="toggles"><span className="on">Torch</span><span>DND</span><span className="on">Rotate</span><span>Wi-Fi</span></div>
      </div>
    );
  if (v === "xfer")
    return (
      <div className="vis vis-shot vis-xfer">
        <div className="vis-phone"><img src={asset("/screens/app-transfer.webp")} alt="" loading="lazy" /></div>
        <div className="files"><i /><i /><i /></div>
      </div>
    );
  return (
    <div className="vis vis-old">
      {["5.0", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"].map((v, i) => (
        <motion.span key={v} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} style={{ height: `${30 + i * 5.5}%` }}><b>{v}</b></motion.span>
      ))}
    </div>
  );
}

// On phones the cards stack like a deck: each one sticks near the top, the next slides up
// over it, and the ones underneath shrink and dim a little as more pile on.
function StackCard({ i, n, progress, children }: { i: number; n: number; progress: MotionValue<number>; children: ReactNode }) {
  const start = i / n;
  const scale = useTransform(progress, [start, 1], [1, 1 - (n - 1 - i) * 0.045]);
  // darken rather than fade, so cards underneath stay solid and nothing ghosts through
  const dim = useTransform(progress, [start, Math.min(1, start + 1.5 / n)], [1, i === n - 1 ? 1 : 0.45]);
  const filter = useMotionTemplate`brightness(${dim})`;
  return (
    <motion.div className="stack-item" style={{ scale, top: `calc(84px + ${i * 14}px)` }}>
      <motion.div style={{ filter }}>{children}</motion.div>
    </motion.div>
  );
}

// Pinned section that scrolls its cards sideways while you scroll down.
export function FeatureRail() {
  const ref = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [dist, setDist] = useState(0);
  const [pinned, setPinned] = useState(true);
  useLayoutEffect(() => {
    const m = () => {
      const wide = innerWidth > 900;
      setPinned(wide);
      setDist(wide && track.current ? track.current.scrollWidth - innerWidth + 48 : 0);
    };
    m();
    addEventListener("resize", m);
    return () => removeEventListener("resize", m);
  }, []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0.05, 0.95], [0, -dist]);
  const prog = useTransform(scrollYProgress, [0.05, 0.95], ["0%", "100%"]);
  const { scrollYProgress: stackProg } = useScroll({ target: track, offset: ["start start", "end end"] });
  return (
    <section className="rail" id="features" ref={ref} style={{ height: pinned ? `calc(100vh + ${dist}px)` : "auto" }}>
      <div className={pinned ? "rail-stick" : ""}>
        <div className="wrap rail-head">
          <div>
            <p className="eyebrow">What it can do</p>
            <Title>Everything you do *on a phone.*</Title>
          </div>
          <div className="rail-prog" aria-hidden="true"><motion.i style={{ width: prog }} /></div>
        </div>
        <motion.div className="rail-track" ref={track} style={pinned ? { x } : undefined}>
          {FEATURES.map((f, i) => {
            const card = (
              <Tilt as="article" className="fcard" key={f.k} max={7}>
                <Visual v={f.vis} />
                <div className="fcard-text">
                  <span className="fcard-k">{f.k}</span>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                  <div className="chips">{f.tools.map((t) => <code key={t}>{t}</code>)}</div>
                </div>
              </Tilt>
            );
            return pinned ? card : <StackCard key={f.k} i={i} n={FEATURES.length} progress={stackProg}>{card}</StackCard>;
          })}
        </motion.div>
      </div>
    </section>
  );
}

const CLIENTS = [
  { id: "claude", name: "Claude Code", file: "terminal", code: "claude mcp add phone -- npx -y android-agent-bridge" },
  { id: "init", name: "Any project", file: "terminal", code: "npx android-agent-bridge init\n# writes .mcp.json and a short agent guide" },
  { id: "cursor", name: "Cursor", file: ".cursor/mcp.json", code: `{\n  "mcpServers": {\n    "phone": { "command": "npx", "args": ["-y", "android-agent-bridge"] }\n  }\n}` },
  { id: "anti", name: "Antigravity / other", file: "mcp_config.json", code: `{\n  "mcpServers": {\n    "phone": { "command": "npx", "args": ["-y", "android-agent-bridge"] }\n  }\n}` },
  { id: "cli", name: "Shell", file: "terminal", code: "npm i -g android-agent-bridge\nphonectl launch YouTube\nphonectl tap \"Search\"\nphonectl type \"lofi\" --submit" },
];

export function QuickStart() {
  const [c, setC] = useState("claude");
  const cur = CLIENTS.find((x) => x.id === c)!;
  return (
    <section id="start" className="sec">
      <div className="wrap">
        <p className="eyebrow">Quick start</p>
        <Title>Up in *two minutes.*</Title>
        <div className="steps">
          {[
            { n: "01", t: "Install the app", d: "Turn on USB debugging and plug in. The CLI installs the app and switches it on. Or download the APK.", cmd: "npx android-agent-bridge usb" },
            { n: "02", t: "Start the bridge", d: "Open Agent Bridge on the phone and scan the QR. It reconnects by itself after that.", cmd: "npx android-agent-bridge start" },
            { n: "03", t: "Connect your agent", d: "Add the MCP server, restart the agent and ask it to use the phone.", cmd: "npx android-agent-bridge init" },
          ].map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <Tilt className="step" max={6}>
                <span className="step-n">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
                <CopyCmd cmd={s.cmd} />
              </Tilt>
            </Reveal>
          ))}
        </div>

        <Reveal className="clients">
          <div className="clients-tabs" role="tablist">
            {CLIENTS.map((x) => (
              <button key={x.id} role="tab" aria-selected={c === x.id} className={c === x.id ? "on" : ""} onClick={() => setC(x.id)}>
                {x.name}
                {c === x.id && <motion.i layoutId="client-ind" className="tab-ind" />}
              </button>
            ))}
          </div>
          <div className="code">
            <div className="code-bar"><span>{cur.file}</span><CopyBtn text={cur.code} /></div>
            <motion.pre key={c} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}><code>{cur.code}</code></motion.pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [d, setD] = useState(false);
  return <button className="cmd-copy" onClick={async () => { try { await navigator.clipboard.writeText(text); setD(true); setTimeout(() => setD(false), 1400); } catch {} }}>{d ? "Copied" : "Copy"}</button>;
}

export function Compat() {
  const rows = [
    ["Android 11 – 16", "✓", "✓", "✓", "✓", "✓"],
    ["Android 7 – 10", "✓", "✓", "✓", "One-time prompt", "✓"],
    ["Android 5 – 6", "✓", "✓", "Over USB", "One-time prompt", "✓"],
  ];
  return (
    <section className="sec" id="compat">
      <div className="wrap">
        <p className="eyebrow">Compatibility</p>
        <Title>Ten years of *Android.*</Title>
        <Reveal className="table-wrap">
          <table>
            <thead><tr><th>Version</th><th>Read screen</th><th>Tap by element</th><th>Tap by position</th><th>Screenshots</th><th>Wi-Fi &amp; USB</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={c === "✓" ? "yes" : ""}>{c}</td>)}</tr>)}</tbody>
          </table>
        </Reveal>
        <p className="note">Tested on Samsung, Pixel, Xiaomi and OnePlus phones. Works on Windows, macOS and Linux with Node 20 or newer.</p>
      </div>
    </section>
  );
}

export function Security() {
  const items = [
    { t: "Paired, not public", d: "Only a computer holding the secret from your QR code can connect. Make a new one any time with pair --reset." },
    { t: "Stays on your network", d: "The phone talks to your computer over Wi-Fi or USB. No cloud, no account, no analytics." },
    { t: "On-device OCR", d: "Text recognition runs on the phone. Screenshots go to your computer and nowhere else." },
    { t: "One switch to stop", d: "Turn off the accessibility service and access ends at once. Forget the computer from the app." },
    { t: "Agents ask first", d: "The bundled guide tells agents to ask before paying, posting, sending or deleting, and never to type passwords." },
    { t: "Open source, MIT", d: "Every line of the app, bridge and MCP server is on GitHub. Read it, fork it, audit it." },
  ];
  return (
    <section className="sec" id="security">
      <div className="wrap">
        <p className="eyebrow">Security &amp; privacy</p>
        <Title>Your phone. *Your rules.*</Title>
        <div className="sec-grid">
          {items.map((x, i) => (
            <Reveal key={x.t} delay={(i % 3) * 0.08}>
              <Tilt className="sec-card">
              <span className="lock" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              </span>
              <h3>{x.t}</h3>
              <p>{x.d}</p>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  ["Play Protect says “App blocked to protect your device”", "Google blocks sideloaded apps that use accessibility when they're opened from a browser or chat app. Install over USB with npx android-agent-bridge usb. After that, Wi-Fi works too."],
  ["Is my phone exposed to the internet?", "No. Only a computer that scanned your QR code can connect, over your own Wi-Fi or USB."],
  ["Does it work on iPhone?", "No. It relies on Android's accessibility service, which iOS doesn't offer to apps."],
  ["Can it control banking and streaming apps?", "Those apps block screenshots, so the screen comes out black. Their element list often still works, but some screens stay off-limits by design."],
  ["Do I need USB?", "Only to install the app the first time. Day to day it works over the same Wi-Fi or a hotspot."],
  ["Which agents work?", "Anything that speaks MCP: Claude Code, Cursor, Antigravity, Windsurf, VS Code and others. Shell scripts can use the CLI directly."],
  ["What does it cost?", "Nothing. It's open source under the MIT license."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="sec" id="faq">
      <div className="wrap faq-wrap">
        <div>
          <p className="eyebrow">FAQ</p>
          <Title>Questions</Title>
        </div>
        <div className="faq">
          {FAQS.map(([q, a], i) => (
            <div key={i} className={`faq-item ${open === i ? "open" : ""}`}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span className="faq-q">Q{String(i + 1).padStart(2, "0")}</span>{q}<span className="faq-x" aria-hidden="true">+</span>
              </button>
              <motion.div initial={false} animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }} transition={{ duration: 0.4, ease }} style={{ overflow: "hidden" }}>
                <p>{a}</p>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Count up from zero when the number scrolls into view.
export function useCountUp(to: number | undefined, run: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run || to == null) return;
    const t0 = performance.now();
    let id = 0;
    const step = (now: number) => { const k = Math.min(1, (now - t0) / 1400); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) id = requestAnimationFrame(step); };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [to, run]);
  return v;
}
