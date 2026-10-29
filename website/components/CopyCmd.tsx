"use client";
import { useState } from "react";

export default function CopyCmd({ cmd, prompt = "$", className = "" }: { cmd: string; prompt?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className={`cmd ${className}`}>
      <span className="cmd-p">{prompt}</span>
      <code>{cmd}</code>
      <button
        type="button"
        className="cmd-copy"
        onClick={async () => {
          try { await navigator.clipboard.writeText(cmd); setDone(true); setTimeout(() => setDone(false), 1400); } catch {}
        }}
        aria-label="Copy command"
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
