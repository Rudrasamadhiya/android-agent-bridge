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
        <p className="lede">Two parts: a small Android app on the phone, and the bridge on your computer. Both are free and open source.</p>

        <div className="dl-grid">
          <div className="dl-card dl-main">
            <span className="dl-tag">Phone</span>
            <h2>Android app</h2>
            <p>Android 5.0 or newer. Arm phones (nearly all of them).</p>
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
          <div className="dl-card">
            <span className="dl-tag">Computer</span>
            <h2>Bridge &amp; MCP server</h2>
            <p>Node.js 20 or newer on Windows, macOS or Linux. Nothing to install: run it with npx.</p>
            <CopyCmd cmd="npx android-agent-bridge start" />
            <CopyCmd cmd="npm i -g android-agent-bridge" />
          </div>
        </div>

        <h2 className="disp sub-title">Install the app</h2>
        <div className="steps">
          <div className="step"><span className="step-n">A</span><h3>Recommended: over USB</h3>
            <p>Turn on Developer options → USB debugging, plug the phone in, run this. It installs, enables and pairs in one go, and Play Protect won't block it.</p>
            <CopyCmd cmd="npx android-agent-bridge usb" /></div>
          <div className="step"><span className="step-n">B</span><h3>Or from the APK</h3>
            <p>Open the downloaded file on the phone and allow installs from your browser. If Play Protect blocks it, use the USB route instead.</p></div>
          <div className="step"><span className="step-n">C</span><h3>Then pair</h3>
            <p>Run <code>start</code> on the computer, open Agent Bridge, tap Scan and point it at the QR in your terminal.</p>
            <CopyCmd cmd="npx android-agent-bridge start" /></div>
        </div>
        <p className="note">Older versions and release notes are on <a href={`${GITHUB}/releases`}>GitHub Releases</a>.</p>
      </div>
    </div>
  );
}
