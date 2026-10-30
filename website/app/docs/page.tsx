import type { Metadata } from "next";
import CopyCmd from "@/components/CopyCmd";
import { GITHUB, VERSION } from "@/lib/site";

export const metadata: Metadata = { title: "Docs", description: "Install, pair and use Agent Bridge: every CLI command and MCP tool." };

type Row = [string, string];
const GROUPS: { id: string; h: string; rows: Row[] }[] = [
  { id: "setup", h: "Setup", rows: [
    ["phonectl start", "Runs the bridge and prints the QR code to scan. A bigger one is at localhost:8350/pair."],
    ["phonectl usb", "For a phone plugged in with USB debugging: installs the app, turns it on, pairs and runs the bridge. No QR code."],
    ["phonectl init", "Adds the MCP server to .mcp.json and a short agent guide to the current project."],
    ["phonectl pair", "Shows the QR code again. --reset makes a new secret; every phone must scan again."],
    ["phonectl status", "The connected phone, how it is connected, and what it can do."],
    ["phonectl permissions grant", "Over USB, switches on the optional permissions: brightness, rotation, Do Not Disturb, saving to Downloads."],
  ] },
  { id: "look", h: "Look", rows: [
    ["phonectl elements", "Numbered list of what's on screen. --all includes elements covered by sheets; --ocr adds text read from the pixels."],
    ["phonectl screen --out shot.jpg", "Screenshot with every element boxed and numbered. --mode grid | both | plain."],
    ["phonectl ocr", "All text drawn on screen, with positions."],
    ["phonectl current", "The app in front."],
    ['phonectl wait "Done"', "Waits until that text appears (--timeout 10000)."],
  ] },
  { id: "act", h: "Act", rows: [
    ["phonectl tap 12", "Taps a target. --long long-presses."],
    ['phonectl type "hello" --into 5', "Types into a field without the keyboard. --append keeps existing text, --submit presses Enter."],
    ["phonectl scroll down", "Scrolls the main list. --in 3 picks a list, --amount 0.6 how far."],
    ["phonectl swipe 540,1800 540,400", "Drags from one target to another (--ms 300)."],
    ["phonectl key back", "back, home, recents, notifications, quick_settings, enter, lock, power_dialog."],
  ] },
  { id: "apps", h: "Apps & links", rows: [
    ["phonectl launch Uber", "Opens an app by name or package. --store opens its Play Store page if it isn't installed."],
    ["phonectl apps whats", "Installed apps, filtered."],
    ["phonectl url youtube.com", "Opens a web page or deep link (geo:, mailto:, myapp://)."],
    ['phonectl search "weather"', "Web search on the phone."],
    ['phonectl store "Zepto"', "Play Store page or search."],
    ["phonectl dial 9876543210", "Opens the dialer with the number filled in. Never places the call."],
    ["phonectl stop com.example", "Force-stops an app (USB)."],
  ] },
  { id: "device", h: "Device", rows: [
    ["phonectl volume 40%", "Media volume. Streams: ring, notification, alarm, call, system. Actions: up, down, mute, unmute, max, a level or a percentage."],
    ["phonectl ringer vibrate", "normal, vibrate or silent."],
    ["phonectl brightness 70", "0–100, auto or manual."],
    ["phonectl rotation auto", "auto, portrait or landscape."],
    ["phonectl flashlight on", "on or off."],
    ["phonectl dnd on", "Do Not Disturb: on, alarms, total, off."],
    ["phonectl settings wifi", "Opens a settings page: wifi, bluetooth, display, sound, battery, location, apps, developer and more."],
    ["phonectl battery", "Level, charging, temperature, power saver."],
    ["phonectl notifications", "Notifications received since the service started."],
    ['phonectl clipboard set "text"', "Sets the clipboard; without set it reads it."],
    ["phonectl wake", "Turns the screen on. A PIN lock stays locked."],
  ] },
  { id: "transfer", h: "Transfer", rows: [
    ["phonectl send a.pdf b.jpg", "Sends files to the phone's Downloads/Agent Bridge."],
    ["phonectl received", "Files the phone sent, and the folder they're in (Downloads/Agent Bridge on the computer)."],
    ["phonectl drop", "Prints the drag-and-drop page address: http://localhost:8350/drop."],
  ] },
];

const TOOLS: Row[] = [
  ["phone_status", "Connection, model, Android version; pairing help if nothing is connected."],
  ["phone_elements · phone_screen · phone_ocr", "Read the screen as text, as a labelled screenshot, or from the pixels."],
  ["phone_tap · phone_type · phone_scroll · phone_swipe · phone_key", "Act on the screen. Each returns the updated element list."],
  ["phone_open_app · phone_apps · phone_wait_for", "Apps and waiting."],
  ["phone_volume · phone_brightness · phone_toggle", "Sound, screen, flashlight, rotation, Do Not Disturb, ringer."],
  ["phone_settings · phone_open_link · phone_web_search · phone_dial", "Jump to settings pages, links and the dialer."],
  ["phone_device_info · phone_notifications · phone_clipboard · phone_wake", "Status and small utilities."],
  ["phone_send_files · phone_received_files", "File transfer."],
  ["phone_permissions · phone_stop_app", "Permissions over USB, force-stopping apps."],
];

const TOC = [
  ["quick-start", "Quick start"], ["install", "Installation"], ["pairing", "Pairing"], ["targets", "Targets"],
  ["commands", "Commands"], ["mcp", "MCP tools"], ["troubleshooting", "Troubleshooting"], ["changelog", "Changelog"],
];

function Table({ rows, head }: { rows: Row[]; head: [string, string] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>{head[0]}</th><th>{head[1]}</th></tr></thead>
        <tbody>{rows.map(([a, b]) => <tr key={a}><td><code>{a}</code></td><td>{b}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Docs() {
  return (
    <div className="page">
      <div className="wrap docs">
        <aside className="toc">
          <p className="eyebrow">Docs · v{VERSION}</p>
          {TOC.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
          <a href={`${GITHUB}/blob/main/README.md`} className="toc-ext">README on GitHub ↗</a>
        </aside>
        <article className="doc">
          <h1 className="disp page-title">Documentation</h1>
          <p className="lede">Every command works from a terminal and as an MCP tool. Keep <code>start</code> running in one terminal and run the rest in another.</p>

          <h2 id="quick-start">Quick start</h2>
          <ol className="doc-steps">
            <li><b>Install the app.</b> Turn on USB debugging, plug the phone in and run:<CopyCmd cmd="npx android-agent-bridge usb" /></li>
            <li><b>Start the bridge</b> whenever you want the agent to have the phone:<CopyCmd cmd="npx android-agent-bridge start" /></li>
            <li><b>Connect your agent.</b> In your project folder:<CopyCmd cmd="npx android-agent-bridge init" />For Claude Code you can also run <code>claude mcp add phone -- npx -y android-agent-bridge</code>.</li>
          </ol>

          <h2 id="install">Installation</h2>
          <p>The computer side needs Node.js 20 or newer. Run it with <code>npx</code> every time, or install it once to get the short <code>phonectl</code> command:</p>
          <CopyCmd cmd="npm i -g android-agent-bridge" />
          <p>The phone side is the Agent Bridge app (Android 5.0+). Install it with <code>usb</code> as above, or <a href="../download/">download the APK</a>. After installing, Android asks you to switch on the Agent Bridge accessibility service; the app walks you there.</p>

          <h2 id="pairing">Pairing</h2>
          <p><b>Wi-Fi:</b> phonectl and computer on the same network or hotspot. Run <code>start</code>, open the app, tap Scan and point it at the QR code. The app remembers the computer and reconnects by itself.</p>
          <p><b>USB:</b> <code>usb</code> sets up an adb tunnel, so no QR is needed and it works without Wi-Fi. On Windows, allow Node.js through the firewall the first time for Wi-Fi.</p>

          <h2 id="targets">Targets</h2>
          <p>Commands that act on something take a target in one of four forms:</p>
          <Table head={["Target", "Meaning"]} rows={[
            ["12", "Element number from the latest element list. The most reliable."],
            ['"Sign in"', "Visible text. The app's own controls win over the Android system bar, and text the app hides from accessibility is found by reading the screen."],
            ["C7", "A grid cell from screen --mode grid, for maps, games and images."],
            ["540,1200", "Screen pixels."],
          ]} />

          <h2 id="commands">Commands</h2>
          <p>The examples use <code>phonectl</code>, which you get from the global install. With npx, write <code>npx android-agent-bridge</code> instead.</p>
          {GROUPS.map((g) => (
            <div key={g.id}>
              <h3 id={g.id}>{g.h}</h3>
              <Table head={["Command", "What it does"]} rows={g.rows} />
            </div>
          ))}

          <h2 id="mcp">MCP tools</h2>
          <p>What your agent sees after <code>init</code>:</p>
          <Table head={["Tool", "Purpose"]} rows={TOOLS} />
          <p>Any MCP client works with this configuration:</p>
          <pre className="codeblock"><code>{`{
  "mcpServers": {
    "phone": { "command": "npx", "args": ["-y", "android-agent-bridge"] }
  }
}`}</code></pre>

          <h2 id="troubleshooting">Troubleshooting</h2>
          <ul className="doc-list">
            <li><b>“App blocked to protect your device”:</b> install over USB with <code>phonectl usb</code>.</li>
            <li><b>No phone connected:</b> is <code>start</code> running? Same Wi-Fi? On Windows, allow Node.js through the firewall. Over USB, run <code>phonectl usb</code> again to restore the tunnel.</li>
            <li><b>Accessibility switch greyed out</b> (Android 13+): App info → ⋮ → Allow restricted settings.</li>
            <li><b>A tap opened nothing right after Home:</b> Android holds app starts for about 5 seconds after Home. The commands retry, but run it again if needed.</li>
            <li><b>Black screenshots:</b> the app blocks capture (banking, video). Use <code>elements</code> instead.</li>
          </ul>

          <h2 id="changelog">Changelog</h2>
          <div className="change">
            <div className="change-head"><b>v0.1.1</b><span>October 2026</span></div>
            <ul className="doc-list">
              <li>QR scanner is now a portrait pop-up that slides up from the bottom, with a flash button.</li>
              <li>Recent transfers: tap a file to open it, delete received files from the phone, clear the list.</li>
              <li>Open folder button jumps to the received files (Samsung My Files opens right at the folder).</li>
            </ul>
          </div>
          <div className="change">
            <div className="change-head"><b>v0.1.0</b><span>October 2026 · first public release</span></div>
            <ul className="doc-list">
              <li>Android app (5.0+) with QR pairing over Wi-Fi and USB, Connect / Transfer / Device tabs.</li>
              <li>CLI and MCP server with 30+ tools: screen reading, taps, typing, gestures, apps, device controls.</li>
              <li>On-device OCR for text apps hide from accessibility; occlusion-aware element lists.</li>
              <li>File transfer both ways, with a drag-and-drop page at localhost:8350/drop.</li>
            </ul>
          </div>
        </article>
      </div>
    </div>
  );
}
