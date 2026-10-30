import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import QRCode from "qrcode";
import CopyCmd from "@/components/CopyCmd";
import DownloadButton from "./DownloadButton";
import { APK_LATEST, GITHUB, VERSION } from "@/lib/site";

export const metadata: Metadata = { title: "Download", description: "Download the Agent Bridge Android app and the npm package." };

// Read at build time so the page always matches the APK in the repo.
function apkInfo() {
  const file = path.join(process.cwd(), "..", "apk", "agent-bridge.apk");
  try {
    const buf = readFileSync(file);
    return { sha: createHash("sha256").update(buf).digest("hex"), size: `${(statSync(file).size / 1048576).toFixed(1)} MB` };
  } catch {
    return { sha: "", size: "13 MB" };
  }
}

export default async function Download() {
  const { sha, size } = apkInfo();
  const qr = await QRCode.toString(APK_LATEST, { type: "svg", margin: 1, color: { dark: "#07080a", light: "#ffffff" } });
  return (
    <div className="page">
      <div className="wrap">
        <p className="eyebrow">Download · v{VERSION}</p>
        <h1 className="disp page-title">Get <span className="hl">Agent Bridge</span></h1>
        <p className="lede">Two parts: a small Android app on the phone, and the bridge on your computer. Both are free and open source. The easiest way to get the app onto the phone is from your computer: one command installs it, switches it on and pairs it.</p>

        <h2 className="disp sub-title" id="install">Install from your computer</h2>
        <div className="steps">
          <div className="step"><span className="step-n">A</span><h3>With a USB cable</h3>
            <p>Any Android 5.0+. On the phone: Settings → About phone → tap <i>Build number</i> 7 times, then Developer options → <i>USB debugging</i>. Plug in and run:</p>
            <CopyCmd cmd="npx android-agent-bridge usb" /></div>
          <div className="step"><span className="step-n">B</span><h3>No cable: over Wi-Fi</h3>
            <p>Android 11+. Turn on Developer options as in A, then Developer options → <i>Wireless debugging</i>. Run this and scan the QR code from <i>Pair device with QR code</i>:</p>
            <CopyCmd cmd="npx android-agent-bridge wifi" /></div>
          <div className="step"><span className="step-n">C</span><h3>Connect your agent</h3>
            <p>For Claude Code. Other agents: see <a href="../start/#agent">Get started</a>.</p>
            <CopyCmd cmd="claude mcp add phone -- npx -y android-agent-bridge" /></div>
        </div>
        <p className="note">Both commands download Google's adb tool the first time if your computer doesn't have it. Installs through adb aren't blocked by Play Protect.</p>

        <div className="protect">
          <b>Why not just download the APK?</b>
          <p>Google Play Protect blocks sideloaded apps that use Android's accessibility service when they're opened from a browser, chat app or file manager. You'll see “App blocked to protect your device”, often with no way to continue. Agent Bridge needs the accessibility service to see and tap the screen, so installing from your computer (above) is the reliable way. The APK is here if you know your phone allows it.</p>
        </div>

        <div className="dl-grid">
          <div className="dl-card">
            <span className="dl-tag">Phone · fallback</span>
            <h2>Android APK</h2>
            <p>Android 5.0 or newer. May be blocked by Play Protect; use the commands above if it is.</p>
            <DownloadButton size={size} />
            <dl className="dl-meta">
              <div><dt>Version</dt><dd>{VERSION}</dd></div>
              <div><dt>Size</dt><dd>{size}</dd></div>
              <div><dt>Package</dt><dd>io.github.rudrasamadhiya.agentbridge</dd></div>
              {sha && <div><dt>SHA-256</dt><dd className="sha">{sha}</dd></div>}
            </dl>
          </div>
          <div className="dl-card dl-qr">
            <span className="dl-tag">On your phone?</span>
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <p>Scan with the phone's camera to download the APK directly.</p>
          </div>
          <div className="dl-card dl-main">
            <span className="dl-tag">Computer</span>
            <h2>Bridge &amp; MCP server</h2>
            <p>Node.js 20 or newer on Windows, macOS or Linux. Nothing to install: run it with npx.</p>
            <CopyCmd cmd="npx android-agent-bridge start" />
            <CopyCmd cmd="npm i -g android-agent-bridge" />
          </div>
        </div>
        <p className="note">Older versions and release notes are on <a href={`${GITHUB}/releases`}>GitHub Releases</a>.</p>
      </div>
    </div>
  );
}
