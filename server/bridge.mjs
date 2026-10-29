// Bridge: what the CLI and the MCP server talk to. It either owns the hub
// (first process to start) or forwards commands to the process that does.
import { setTimeout as sleep } from 'node:timers/promises';
import { Hub, pairLink, qrTerminal } from './hub.mjs';
import { loadConfig, APP_ID } from './config.mjs';
import { adb, pickSerial, KEYCODES } from './adb.mjs';

// commands that change the screen: report the new screen afterwards
const ACTIONS = new Set(['tap', 'swipe', 'scroll', 'type', 'key', 'open_app']);

/** Best OCR line for a query: exact, then starts-with, then contains (case-insensitive). */
export function findText(lines, query) {
  const q = query.toLowerCase().trim();
  const t = (l) => l.text.toLowerCase().trim();
  const strong = lines.find((l) => t(l) === q) || lines.find((l) => t(l).startsWith(q));
  if (strong) return { ...strong, strong: true };
  const weak = lines.find((l) => t(l).includes(q));
  return weak ? { ...weak, strong: false } : null;
}

async function hubAlive(cfg) {
  try {
    const r = await fetch(`http://127.0.0.1:${cfg.port}/status`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch { return false; }
}

async function rpc(cfg, cmd, args, timeout) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${cfg.port}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-aab-token': cfg.token },
      body: JSON.stringify({ cmd, args, timeout }),
      signal: AbortSignal.timeout((timeout || 20000) + 15000),
    });
  } catch (err) {
    const e = new Error('hub not reachable: ' + err.message);
    e.hubGone = true;
    throw e;
  }
  const body = await res.json();
  if (!body.ok) throw new Error(body.error);
  return body.result;
}

export class Bridge {
  /** host: start the hub here when none is running (MCP server, `start`); false for one-shot CLI commands. */
  constructor({ log = () => {}, host = true } = {}) {
    this.cfg = loadConfig();
    this.log = log;
    this.host = host;
    this.hub = null;
  }

  /** Concurrent callers share one attempt, so only one hub is ever started. */
  ensure() {
    if (!this.ensuring) this.ensuring = this.doEnsure().finally(() => { this.ensuring = null; });
    return this.ensuring;
  }

  async doEnsure() {
    if (this.hub) return;
    if (await hubAlive(this.cfg)) return;
    if (!this.host) {
      throw new Error(`No bridge is running. Start one with \`npx android-agent-bridge start\` (or let your AI agent's MCP server start it).`);
    }
    const hub = new Hub({ cfg: this.cfg, log: this.log, onRpc: (c, a, t) => this.runLocal(c, a, t) });
    hub.files.onDrop = (paths) => this.sendFiles(paths);
    if (await hub.start()) { this.hub = hub; return; }
    if (!(await hubAlive(this.cfg))) throw new Error(hub.startError + ' Another program is using it; set AAB_PORT to pick another port.');
  }

  async run(cmd, args = {}, timeout) {
    await this.ensure();
    if (this.hub) return this.runLocal(cmd, args, timeout);
    try {
      return await rpc(this.cfg, cmd, args, timeout);
    } catch (err) {
      if (!err.hubGone || !this.host) throw err;
      await this.ensure(); // the process that owned the hub exited: take over
      return this.runLocal(cmd, args, timeout);
    }
  }

  async runLocal(cmd, args = {}, timeout) {
    const hub = this.hub;
    if (cmd === 'status') return hub.status();
    if (cmd === 'pair') {
      const link = pairLink(this.cfg);
      return { link, page: `http://localhost:${this.cfg.port}/pair`, qr: await qrTerminal(link) };
    }
    if (cmd === 'ocr') return this.ocr(args);
    if (cmd === 'grant_permissions') return this.grantPermissions();
    if (cmd === 'send_files') return this.sendFiles(args.paths || []);
    if (cmd === 'received_files') return hub.files.received(args.limit);
    if (cmd === 'force_stop') return this.forceStop(args.package);
    let r;
    try {
      r = await hub.call(cmd, args, timeout);
    } catch (err) {
      // Text the app draws but hides from accessibility (Uber's tab bar, payment row):
      // find it in the screen pixels and tap there instead.
      const t = cmd === 'tap' && typeof args.target === 'string' ? args.target.trim() : '';
      if (!t || !/nothing on screen matches/.test(err.message) || /^#?\d+$|^\d+\s*,\s*\d+$|^[A-Za-z]{1,2}\d{1,3}$/.test(t)) throw err;
      const lines = (await this.ocr({ idle: 0 })).lines || [];
      const hit = findText(lines, t);
      const tapAt = async (h) => ({ ...(await hub.call('tap', { ...args, target: `${h.x},${h.y}` }, timeout)), via: 'ocr', matched: h.text });
      // exact / starts-with on screen beats a loose "contains" match in the element list
      if (hit?.strong) r = await tapAt(hit);
      else if (/closest in the app/.test(err.message)) r = await hub.call('tap', { ...args, loose: true }, timeout);
      else if (hit) r = await tapAt(hit);
      // only the system bar has it (e.g. Android's Home button): last resort
      else if (/only the system bar/.test(err.message)) r = await hub.call('tap', { ...args, system: true }, timeout);
      else throw new Error(`nothing on screen matches "${t}", not in the element list nor in the screen text (OCR).`);
    }
    if (r?.needsAdb) r = { ...r, ...(await this.viaAdb(r.needsAdb)), needsAdb: undefined };
    if (cmd === 'screen' && !r.image && r.captureError) {
      const png = await this.screencap();
      if (png) {
        try {
          // the phone draws the numbers/grid on it, same as its own screenshots
          Object.assign(r, await hub.call('annotate', { image: png, mode: args.mode, maxSide: args.maxSide }, 30000));
        } catch (err) {
          Object.assign(r, { image: png, mime: 'image/png', note: `Screenshot taken over USB without labels (${err.message}). Use coordinates "x,y" or element numbers from the list.` });
        }
        delete r.captureError;
      }
    }
    if (ACTIONS.has(cmd) && args.after !== false) {
      // wait for the screen to stop changing (page loads, animations), up to `settle` ms
      await sleep(250);
      const settle = args.settle ?? 2500;
      r.outline = (await hub.call('elements', { idle: settle }, settle + 20000)).outline;
    }
    return r;
  }

  /** Send files from this computer to the phone: staged here, downloaded by the phone into Downloads/Agent Bridge. */
  async sendFiles(paths) {
    if (!paths.length) throw new Error('give at least one file');
    const staged = this.hub.files.stage(paths);
    const results = [];
    for (const f of staged) {
      // a minute, plus about 2 s per 10 MB for slow Wi-Fi
      const r = await this.hub.call('receive_file', f, 60000 + Math.ceil(f.size / 5e6) * 1000);
      this.log(`sent ${f.name} to the phone → ${r.saved}`);
      results.push({ name: f.name, size: f.size, saved: r.saved });
    }
    return results;
  }

  /** Full-resolution screenshot over USB as base64 PNG, or null without adb. */
  async screencap() {
    const serial = await pickSerial(this.hub.current?.info?.model);
    if (!serial) return null;
    return (await adb(['exec-out', 'screencap', '-p'], { serial, binary: true, timeout: 20000 })).toString('base64');
  }

  /** Text in the screen pixels, read on the phone (ML Kit). Uses a USB screenshot when the phone can't capture. */
  async ocr(args = {}) {
    let r = await this.hub.call('ocr', args, 40000);
    if (r.captureError) {
      const png = await this.screencap();
      if (!png) throw new Error(`Can't read the screen: ${r.captureError}. Connect USB, or allow screen capture in the app.`);
      r = await this.hub.call('ocr', { ...args, image: png, idle: 0 }, 40000);
    }
    return r;
  }

  /** One-time permissions the user would otherwise switch on in Settings, granted over USB with adb. */
  async grantPermissions() {
    const serial = await pickSerial(this.hub.current?.info?.model);
    if (!serial) throw new Error("Plug the phone in over USB (USB debugging on) to grant permissions, or switch them on in the phone's Settings.");
    const sh = (...c) => adb(['shell', ...c], { serial });
    const granted = [];
    await sh('appops', 'set', APP_ID, 'WRITE_SETTINGS', 'allow').then(() => granted.push('modify system settings')).catch(() => {});
    await sh('cmd', 'notification', 'allow_dnd', APP_ID).then(() => granted.push('do not disturb access')).catch(() => {});
    await sh('pm', 'grant', APP_ID, 'android.permission.POST_NOTIFICATIONS').then(() => granted.push('notifications')).catch(() => {});
    // Android 9 and older: save received files in Downloads/Agent Bridge
    await sh('pm', 'grant', APP_ID, 'android.permission.WRITE_EXTERNAL_STORAGE').then(() => granted.push('storage')).catch(() => {});
    return { granted, permissions: await this.hub.call('permissions', {}) };
  }

  async forceStop(pkg) {
    if (!pkg || !/^[\w.]+$/.test(pkg)) throw new Error('give the app package, e.g. com.instagram.android (see `apps`)');
    const serial = await pickSerial(this.hub.current?.info?.model);
    if (!serial) throw new Error('Force-stopping an app needs the phone on USB.');
    await adb(['shell', 'am', 'force-stop', pkg], { serial });
    return { stopped: pkg };
  }

  /** The phone could not do it itself (old Android): do it through adb. */
  async viaAdb(op) {
    const serial = await pickSerial(this.hub.current?.info?.model);
    if (!serial) throw new Error(`${op.reason} Connect the phone over USB with USB debugging on and it will be done through adb.`);
    const sh = (...c) => adb(['shell', ...c.map(String)], { serial });
    if (op.op === 'tap') await (op.long ? sh('input', 'swipe', op.x, op.y, op.x, op.y, 800) : sh('input', 'tap', op.x, op.y));
    else if (op.op === 'swipe') await sh('input', 'swipe', op.x1, op.y1, op.x2, op.y2, op.ms || 300);
    else if (op.op === 'key') await sh('input', 'keyevent', KEYCODES[op.key] ?? op.key);
    else if (op.op === 'text') await sh('input', 'text', `'${String(op.text).replace(/'/g, `'\\''`).replace(/ /g, '%s')}'`);
    else throw new Error('unknown adb fallback ' + op.op);
    return { via: 'adb' };
  }

  close() { this.hub?.close(); }
}
