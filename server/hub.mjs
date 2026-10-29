// Hub: one port for everything.
//   ws://<pc>:8350/phone   the Android app dials in here (token checked in "hello")
//   GET  /pair             pairing page with the QR code (this computer only)
//   GET  /status           connected phones as JSON (this computer only)
//   POST /rpc              CLI commands from another process (this computer only, token header)
//   GET  /drop             drag-and-drop page to send files to the phone (this computer only)
//   /files/*               file transfer both ways (see files.mjs)
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { Files } from './files.mjs';
import { dropPage } from './droppage.mjs';

export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vethernet|virtualbox|vmware|docker|wsl|loopback/i.test(name)) continue;
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

export function pairLink(cfg, hosts = lanAddresses()) {
  const q = new URLSearchParams({ h: hosts.join(','), p: String(cfg.port), t: cfg.token, n: os.hostname() });
  return 'agentbridge://pair?' + q;
}

export const qrTerminal = (link) => QRCode.toString(link, { type: 'terminal', small: true });

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const isLoopback = (req) => LOOPBACK.has(req.socket.remoteAddress);

function sameSecret(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

export class Hub {
  constructor({ cfg, log = () => {}, onRpc = null }) {
    this.cfg = cfg;
    this.port = cfg.port;
    this.log = log;
    this.onRpc = onRpc;
    this.devices = new Map();
    this.current = null;
    this.pending = new Map();
    this.nextId = 1;
    this.nextDevice = 1;
    this.waiters = [];
    this.startError = null;
    this.files = new Files({ log });
  }

  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleHttp(req, res).catch((err) => {
        res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: err.message }));
      }));
      this.wss = new WebSocketServer({ server: this.server, maxPayload: 64 * 1024 * 1024 });
      this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
      this.wss.on('error', () => {}); // re-emitted server errors, handled below
      this.server.on('error', (err) => {
        this.startError = err.code === 'EADDRINUSE' ? `Port ${this.port} is already in use.` : err.message;
        resolve(false);
      });
      this.server.listen(this.port, '0.0.0.0', () => {
        this.log(`listening on port ${this.port} (Wi-Fi: ${lanAddresses().join(', ') || 'none'})`);
        resolve(true);
      });
    });
  }

  async handleHttp(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const json = (code, body) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    // the phone uploads and downloads files from the Wi-Fi network too, so these check the token instead
    if (url.pathname.startsWith('/files/')) {
      return this.files.handle(req, res, url, { authed: sameSecret(req.headers['x-aab-token'] || '', this.cfg.token), local: isLoopback(req) });
    }
    if (!isLoopback(req)) return json(403, { ok: false, error: 'only reachable from this computer' });
    if (req.method === 'GET' && url.pathname === '/drop') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(dropPage());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/status') return json(200, { ok: true, result: this.status() });
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/pair')) {
      const link = pairLink(this.cfg);
      const svg = await QRCode.toString(link, { type: 'svg', margin: 2, width: 320 });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(pairPage(svg, link));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/rpc') {
      if (!sameSecret(req.headers['x-aab-token'] || '', this.cfg.token)) return json(401, { ok: false, error: 'bad token' });
      const { cmd, args, timeout } = JSON.parse((await readBody(req)) || '{}');
      try {
        return json(200, { ok: true, result: await this.onRpc(cmd, args || {}, timeout) });
      } catch (err) {
        return json(200, { ok: false, error: err.message });
      }
    }
    json(404, { ok: false, error: 'not found' });
  }

  onConnection(ws, req) {
    const device = { id: null, ws, info: null, address: req.socket.remoteAddress, connectedAt: Date.now() };
    const helloTimer = setTimeout(() => ws.close(4001, 'no hello'), 5000);
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg.type === 'hello') {
        clearTimeout(helloTimer);
        if (!sameSecret(msg.token || '', this.cfg.token)) {
          ws.send(JSON.stringify({ type: 'rejected', error: 'Pairing code is out of date. Scan the QR code again.' }));
          ws.close(4003, 'bad token');
          this.log(`rejected a phone from ${device.address} (old pairing)`);
          return;
        }
        device.id = 'p' + this.nextDevice++;
        device.info = msg.info || {};
        device.usb = LOOPBACK.has(device.address);
        this.devices.set(device.id, device);
        this.current = device;
        ws.send(JSON.stringify({ type: 'welcome', name: os.hostname() }));
        this.log(`phone connected: ${device.info.manufacturer} ${device.info.model}, Android ${device.info.release} (${device.usb ? 'USB' : device.address})`);
        this.waiters.splice(0).forEach((w) => w(device));
        return;
      }
      if (msg.type === 'info' && device.id) { device.info = msg.info || device.info; return; }
      const p = msg.id && this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (!device.id) return;
      this.devices.delete(device.id);
      if (this.current === device) this.current = [...this.devices.values()].pop() || null;
      this.log(`phone disconnected: ${device.info?.model}`);
      for (const [id, p] of this.pending) {
        if (p.device !== device) continue;
        this.pending.delete(id);
        clearTimeout(p.timer);
        p.reject(new Error('phone disconnected. It reconnects by itself within a few seconds; retry.'));
      }
    });
  }

  status() {
    return {
      port: this.port,
      wifi: lanAddresses(),
      phones: [...this.devices.values()].map((d) => ({ id: d.id, current: d === this.current, via: d.usb ? 'usb' : 'wifi', address: d.address, ...d.info })),
    };
  }

  waitForDevice(ms) {
    if (this.current) return Promise.resolve(this.current);
    return new Promise((resolve) => {
      const done = (d) => { clearTimeout(t); resolve(d); };
      const t = setTimeout(() => { this.waiters = this.waiters.filter((w) => w !== done); resolve(null); }, ms);
      this.waiters.push(done);
    });
  }

  notConnectedHelp() {
    if (this.startError) return this.startError;
    return [
      'No phone connected.',
      `• Wi-Fi: open http://localhost:${this.port}/pair on this computer and scan the QR code with the Agent Bridge app (same Wi-Fi network).`,
      '• USB: plug the phone in with USB debugging on and run `npx android-agent-bridge usb`.',
      `• Already paired? Open the Agent Bridge app and check that its accessibility service is on. Windows: allow Node.js through the firewall for port ${this.port}.`,
    ].join('\n');
  }

  async call(cmd, args = {}, timeoutMs = 20000) {
    const device = await this.waitForDevice(5000);
    if (!device) throw new Error(this.notConnectedHelp());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`phone did not answer "${cmd}" within ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, device });
      device.ws.send(JSON.stringify({ id, cmd, args }));
    });
  }

  close() {
    this.wss?.close();
    this.server?.close();
  }
}

function pairPage(svg, link) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pair your phone</title>
<style>
:root{--bg:#f6f7f9;--fg:#15171a;--muted:#5d6470;--card:#fff;--ok:#127a3e}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#eceef1;--muted:#9aa2ad;--card:#1c1f24;--ok:#4cc27e}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{background:var(--card);border-radius:16px;padding:28px;max-width:420px;text-align:center;box-shadow:0 2px 20px #0002}
h1{font-size:22px;margin:0 0 4px}p{color:var(--muted);margin:6px 0}
.qr{background:#fff;border-radius:12px;padding:8px;margin:18px auto;width:320px;max-width:100%}
.qr svg{width:100%;height:auto;display:block}
ol{text-align:left;color:var(--muted);padding-left:20px}
#st{font-weight:600;margin-top:12px}#st.ok{color:var(--ok)}
details{margin-top:12px;text-align:left;color:var(--muted);font-size:13px;word-break:break-all}
</style></head><body><main>
<h1>Pair your phone</h1><p>Give your AI agent access to your Android phone.</p>
<div class="qr">${svg}</div>
<ol><li>Open <b>Agent Bridge</b> on the phone.</li><li>Tap <b>Scan QR code</b> and point it here.</li><li>Phone and computer must be on the same Wi-Fi.</li></ol>
<div id="st">Waiting for the phone…</div>
<details><summary>Can't scan? Paste this link in the app</summary><code>${link}</code></details>
</main><script>
async function poll(){try{const r=await (await fetch('/status')).json();const p=r.result.phones;const el=document.getElementById('st');
if(p.length){el.textContent='Connected: '+p.map(x=>x.manufacturer+' '+x.model).join(', ')+'. You can close this page.';el.className='ok'}
else{el.textContent='Waiting for the phone…';el.className=''}}catch{}setTimeout(poll,1500)}poll();
</script></body></html>`;
}
