"use client";
import { useState } from "react";

// A prompt card: the text in quotes with a copy button.
export function PromptCard({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="prompt"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch {}
      }}
    >
      <span className="prompt-text">{text}</span>
      <span className="prompt-copy">{done ? "Copied" : "Copy"}</span>
    </button>
  );
}

// A small code block with a file name and copy button.
export function CodeBlock({ file, code }: { file: string; code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="code guide-code">
      <div className="code-bar">
        <span>{file}</span>
        <button className="cmd-copy" onClick={async () => { try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1400); } catch {} }}>
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
