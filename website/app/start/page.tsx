import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, PromptCard } from "@/components/CopyBlock";
import CopyCmd from "@/components/CopyCmd";
import { CHEATSHEET, MCP_PROMPTS, PROMPT_GROUPS } from "@/lib/prompts";
import { APK_LATEST, APK_SIZE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Get started",
  description: "Set up Agent Bridge in a few minutes: install the app, pair, connect your agent, and try ready-made prompts.",
};

const TOC = [
  ["need", "What you need"],
  ["install", "1 · Install the app"],
  ["pair", "2 · Start and pair"],
  ["agent", "3 · Connect your agent"],
  ["check", "4 · Check it works"],
  ["prompts", "Prompts to try"],
  ["mcp-prompts", "Built-in MCP prompts"],
  ["cheatsheet", "Command cheat sheet"],
  ["help", "If something's wrong"],
];

const MCP_JSON = `{
  "mcpServers": {
    "phone": { "command": "npx", "args": ["-y", "android-agent-bridge"] }
  }
}`;

export default function Start() {
  return (
    <div className="page">
      <div className="wrap docs">
        <aside className="toc">
          <p className="eyebrow">Get started</p>
          {TOC.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
          <Link href="/docs/" className="toc-ext">Full docs →</Link>
        </aside>

        <article className="doc">
          <h1 className="disp page-title">Get <span className="hl">started</span></h1>
          <p className="lede">From nothing to “open YouTube on my phone” in about five minutes. Every command on this page has a copy button.</p>

          <h2 id="need">What you need</h2>
          <div className="need-grid">
            <div className="need"><b>An Android phone</b><span>Android 5.0 or newer, any brand</span></div>
            <div className="need"><b>A computer</b><span>Windows, macOS or Linux with Node.js 20+</span></div>
            <div className="need"><b>A USB cable</b><span>Only for the first install</span></div>
            <div className="need"><b>An AI agent</b><span>Claude Code, Cursor, Antigravity or any MCP client</span></div>
          </div>

          <h2 id="install">1 · Install the app</h2>
          <p><b>Recommended: over USB.</b> On the phone, open Settings → About phone and tap <i>Build number</i> seven times. Then go to Settings → Developer options and turn on <i>USB debugging</i>. Plug the phone in and run:</p>
          <CopyCmd cmd="npx android-agent-bridge usb" />
          <p>This installs the app, switches on its accessibility service, pairs it and starts the bridge. Accept the “Allow USB debugging?” prompt on the phone. You can skip step 2.</p>
          <p><b>Or download the APK</b> ({APK_SIZE}) and open it on the phone. If Play Protect blocks it, use the USB route above.</p>
          <p><a className="btn btn-lime" href={APK_LATEST}>Download the APK</a></p>

          <h2 id="pair">2 · Start and pair</h2>
          <p>Skip this if you used <code>usb</code>. Otherwise, with the phone and computer on the same Wi-Fi:</p>
          <CopyCmd cmd="npx android-agent-bridge start" />
          <ol className="doc-steps">
            <li>Open <b>Agent Bridge</b> on the phone and tap <b>Scan QR code</b>.</li>
            <li>Point the camera at the QR code in your terminal, or the bigger one at <code>localhost:8350/pair</code>.</li>
            <li>Tap <b>Accessibility service → Turn on</b> in the app and switch Agent Bridge on.</li>
          </ol>
          <p>The app remembers your computer and reconnects by itself. On Windows, allow Node.js through the firewall when asked.</p>

          <h2 id="agent">3 · Connect your agent</h2>
          <p><b>Claude Code:</b></p>
          <CopyCmd cmd="claude mcp add phone -- npx -y android-agent-bridge" />
          <p><b>Any project</b> (writes <code>.mcp.json</code> and a short agent guide):</p>
          <CopyCmd cmd="npx android-agent-bridge init" />
          <p><b>Cursor, Antigravity, Windsurf and other MCP clients:</b> add this to the client's MCP config file (Cursor: <code>.cursor/mcp.json</code>).</p>
          <CodeBlock file="mcp.json" code={MCP_JSON} />
          <p>Restart the agent after adding it. It gets 27 tools such as <code>phone_screen</code>, <code>phone_tap</code> and <code>phone_type</code>, plus the prompts below.</p>

          <h2 id="check">4 · Check it works</h2>
          <p>Ask your agent:</p>
          <PromptCard text="Is my phone connected? Take a screenshot and tell me what's on screen." />
          <p>Or from a terminal: install the short command once, then check the status.</p>
          <CopyCmd cmd="npm i -g android-agent-bridge" />
          <CopyCmd cmd="phonectl status" />

          <h2 id="prompts">Prompts to try</h2>
          <p>Click any prompt to copy it, then paste it into your agent. Agents are told to ask you before sending, paying, posting or deleting.</p>
          {PROMPT_GROUPS.map((g) => (
            <div key={g.id} className="prompt-group">
              <h3>{g.title}</h3>
              <p className="prompt-blurb">{g.blurb}</p>
              <div className="prompt-grid">{g.prompts.map((p) => <PromptCard key={p} text={p} />)}</div>
            </div>
          ))}

          <h2 id="mcp-prompts">Built-in MCP prompts</h2>
          <p>The MCP server also ships ready-made prompts. In Claude Code they're slash commands: type <code>/mcp__phone__</code> to see them. Other clients list them in their prompt menu.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Slash command</th><th>Asks for</th><th>What it does</th></tr></thead>
              <tbody>
                {MCP_PROMPTS.map((p) => (
                  <tr key={p.name}><td><code>/mcp__phone__{p.name}</code></td><td>{p.args || "nothing"}</td><td>{p.does}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 id="cheatsheet">Command cheat sheet</h2>
          <p>Everything an agent can do, you can do from a terminal. <code>phonectl</code> comes with <code>npm i -g android-agent-bridge</code>; without it, use <code>npx android-agent-bridge</code>. Keep <code>start</code> running in another terminal.</p>
          {CHEATSHEET.map((g) => (
            <div key={g.group}>
              <h3>{g.group}</h3>
              <div className="table-wrap">
                <table>
                  <tbody>{g.rows.map(([c, d]) => <tr key={c}><td><code>{c}</code></td><td>{d}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ))}
          <p>Every command, with all its options, is in the <Link href="/docs/#commands">full command reference</Link>.</p>

          <h2 id="help">If something's wrong</h2>
          <ul className="doc-list">
            <li><b>“App blocked to protect your device”:</b> install over USB with <code>npx android-agent-bridge usb</code>.</li>
            <li><b>The agent says no phone is connected:</b> is <code>start</code> (or <code>usb</code>) running? Same Wi-Fi? Is the accessibility service on in the app?</li>
            <li><b>Accessibility switch is greyed out</b> (Android 13+): App info → ⋮ → Allow restricted settings, then try again.</li>
            <li><b>Screenshots are black:</b> that app blocks screen capture (banking, video). The agent can still read the element list.</li>
          </ul>
          <p>Still stuck? <a href="https://github.com/Rudrasamadhiya/android-agent-bridge/issues">Open an issue on GitHub</a>.</p>
        </article>
      </div>
    </div>
  );
}
